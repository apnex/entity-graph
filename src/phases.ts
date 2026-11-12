/**
 * The application's consequences and conditions (CONTRACT.md *Consequences and the stopping rule*, *Judging and refusals*;
 * docs/DECISIONS.md D20 to D23).
 *
 * A phase runs once: the consequences listening, through the dispatch index, to a kind the edit has touched run in declared
 * order, each called once if its trigger hears a change in the edit as it stands when its turn comes, and handed those changes
 * and a reader of the edit so far, so it sees every write before it; a kind first touched during the phase brings its listeners
 * declared later into the same run. Each write a consequence returns is checked and applied as a requested item is, carrying
 * the item the changes it heard follow from; a second consequence writing an entity one already wrote in this run of the phase
 * is a fault, never resolved by letting one win.
 *
 * A condition is called with a reader of one state and answers its breaches, each a subject, a measure and its own sentence.
 *
 * Purity (D22): what a function is handed is frozen and its reader answers only during the call; what it answers is read once
 * as plain JSON, running none of its code. A function that throws, answers what is not plain data or is not in the form asked,
 * or reaches for what it was handed, is refused, and nothing of it reaches the view.
 */
import { readPlainJson } from "@apnex/shape-check";
import type { CompiledConsequence, CompiledDeclaration } from "./declaration.js";
import { applyItem } from "./items.js";
import { openReader } from "./reader.js";
import type { ConditionReading } from "./reference-rules.js";
import type { GraphRefusalCode } from "./refusal.js";
import { type Attribution, fieldKey, type GraphChangeRecord, type GraphState, later, type Scratch } from "./scratch.js";
import { isObject } from "./view.js";

/** Why a phase or a condition stops the plan: the refusal's code and the facts it names. */
export interface PhaseFault {
	readonly code: GraphRefusalCode;
	readonly ruleKey: string;
	readonly subject: string;
	readonly measure: number;
	readonly opIndex: number;
	readonly writers?: readonly string[];
}

/** Whether a consequence's trigger hears one change: an entity of its kinds created or deleted, or one of its named fields changed. */
function hears(c: CompiledConsequence, change: GraphChangeRecord): boolean {
	return c.clauses.some((clause) =>
		(change.after === null && (clause.deleted?.includes(change.kind) ?? false))
		|| (change.before === null && (clause.created?.includes(change.kind) ?? false))
		|| (change.before !== null && change.after !== null && clause.changed?.kind === change.kind && clause.changed.fields.some((f) => change.fields.includes(f))));
}

/** The write a change follows from: an entity's creation or deletion, or the latest write of a field the trigger names. */
function causeOfChange(s: Scratch, c: CompiledConsequence, change: GraphChangeRecord): Attribution | undefined {
	if (change.before === null || change.after === null) return s.presence.get(change.id);
	let at: Attribution | undefined;
	for (const clause of c.clauses) {
		if (clause.changed?.kind !== change.kind) continue;
		for (const field of clause.changed.fields) if (change.fields.includes(field)) at = later(at, s.fieldCause.get(fieldKey(change.id, field)));
	}
	return at;
}

/** Runs one phase over the edit so far, applying what its consequences write; the fault that stops it, or null. */
export function runPhase(s: Scratch, d: CompiledDeclaration, phase: string): PhaseFault | null {
	const index = d.listening.get(phase)!;
	const claimed = new Map<string, string>(); // entity -> the consequence that wrote it in this run of the phase
	const queued = new Set<CompiledConsequence>();
	let pending: CompiledConsequence[] = [];
	let next = 0;
	let last = -1;
	let kindsRead = 0;
	// the listeners of every kind touched since last asked, declared after the consequence that ran last, read by a moving index
	const listen = () => {
		const added: CompiledConsequence[] = [];
		for (; kindsRead < s.kindsTouched.length; kindsRead++) {
			for (const c of index.get(s.kindsTouched[kindsRead]!) ?? []) {
				if (c.order > last && !queued.has(c)) {
					queued.add(c);
					added.push(c);
				}
			}
		}
		if (added.length === 0) return;
		pending = pending.slice(next).concat(added).sort((a, b) => a.order - b.order);
		next = 0;
	};
	listen();
	while (next < pending.length) {
		const c = pending[next++]!;
		last = c.order;
		const matches: GraphChangeRecord[] = [];
		const seen = new Set<string>();
		for (const kind of c.kinds) {
			for (const id of s.touchedOf(kind)) {
				if (seen.has(id)) continue;
				seen.add(id);
				const change = s.change(id);
				if (change !== null && hears(c, change)) matches.push(change);
			}
		}
		if (matches.length === 0) continue;
		matches.sort((a, b) => s.touchOrder(a.id) - s.touchOrder(b.id));
		let at: Attribution | undefined;
		for (const m of matches) at = later(at, causeOfChange(s, c, m));
		const cause = at?.cause ?? -1;
		const failed = (code: GraphRefusalCode, ruleKey: string, subject: string): PhaseFault => ({ code, ruleKey, subject, measure: 1, opIndex: cause });
		const heard = Object.freeze(matches.map((m) => Object.freeze({ kind: m.kind, id: m.id, before: m.before, after: m.after, fields: Object.freeze([...m.fields]) })));
		const { reader, close } = openReader(s, d);
		let returned: unknown;
		try {
			returned = Reflect.apply(c.run, undefined, [Object.freeze({ matches: heard, graph: reader })]);
		} catch {
			return failed("consequence-failed", c.key, matches[0]!.id);
		} finally {
			close();
		}
		const read = readPlainJson(returned as never);
		if (!read.ok || !Array.isArray(read.value)) return failed("consequence-failed", c.key, matches[0]!.id);
		for (const [i, write] of (read.value as unknown[]).entries()) {
			const id = isObject(write) && typeof write["id"] === "string" ? write["id"] : null;
			const holder = id === null ? undefined : claimed.get(id);
			// the fault is between two consequences, not of one item, so it names the edit as a whole (the corpus's R29; D21)
			if (holder !== undefined && holder !== c.key) return { code: "consequence-conflict", ruleKey: "consequence-conflict", subject: id!, measure: 2, opIndex: -1, writers: [holder, c.key] };
			const fault = applyItem(s, d, write, `writes[${i}]`, cause, c.key);
			if (fault !== null) return failed(fault.code, c.key, fault.subject);
			if (id !== null) claimed.set(id, c.key);
		}
		listen();
	}
	return null;
}

/** Every condition's breaches in one state, keyed `<rule key>@<subject>`, or the condition that failed to answer. */
export function readConditions(d: CompiledDeclaration, state: GraphState): { ok: true; breaches: Map<string, ConditionReading> } | { ok: false; fault: PhaseFault } {
	const breaches = new Map<string, ConditionReading>();
	for (const c of d.conditions) {
		const failed = { ok: false as const, fault: { code: "condition-failed" as const, ruleKey: c.key, subject: c.key, measure: 1, opIndex: -1 } };
		const { reader, close } = openReader(state, d);
		let returned: unknown;
		try {
			returned = Reflect.apply(c.check, undefined, [reader]);
		} catch {
			return failed;
		} finally {
			close();
		}
		const read = readPlainJson(returned as never);
		if (!read.ok || !Array.isArray(read.value)) return failed;
		const subjects = new Set<string>();
		for (const b of read.value as unknown[]) {
			if (!isObject(b) || Object.keys(b).some((k) => k !== "subject" && k !== "measure" && k !== "sentence")) return failed;
			const { subject, measure, sentence } = b;
			if (typeof subject !== "string" || subject === "" || subjects.has(subject)) return failed;
			if (typeof measure !== "number" || !Number.isFinite(measure) || measure <= 0 || typeof sentence !== "string") return failed;
			subjects.add(subject);
			breaches.set(`${c.key}@${subject}`, Object.freeze({ ruleKey: c.key, subject, measure, sentence }));
		}
	}
	return { ok: true, breaches };
}
