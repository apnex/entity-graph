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
 * A condition is called with a reader of one state and the plan's context, and answers its breaches, each a subject, a measure
 * and its own sentence. Every consequence, condition and resolver of a plan is handed the same context, frozen (D28).
 *
 * Purity (D22): what a function is handed is frozen and its reader answers only during the call; what it answers is read once
 * as plain JSON, running none of its code. A function that throws, answers what is not plain data or is not in the form asked,
 * or reaches for what it was handed, is refused, and nothing of it reaches the view.
 */
import { observePromises, readPlainJson } from "@apnex/shape-check";
import type { CompiledConsequence, CompiledDeclaration } from "./declaration.js";
import { applyItem } from "./items.js";
import { openReader } from "./reader.js";
import type { ConditionReading } from "./reference-rules.js";
import type { GraphRefusalCode } from "./refusal.js";
import { type Attribution, type GraphChangeRecord, type GraphState, later, type Scratch } from "./scratch.js";
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

/**
 * Whether a consequence's trigger hears one change -- an entity of its kinds created or deleted, or one of its named fields
 * changed -- and if so the write the change follows from: the entity's creation or deletion, or the latest write of a field the
 * trigger names; `false` where it does not hear it. Plain loops, since it runs once per consequence per change heard.
 */
function heardFrom(s: Scratch, c: CompiledConsequence, change: GraphChangeRecord): Attribution | undefined | false {
	const created = change.before === null;
	const deleted = change.after === null;
	let heard = false;
	let at: Attribution | undefined;
	for (const clause of c.clauses) {
		if (deleted ? clause.deleted?.includes(change.kind) : created ? clause.created?.includes(change.kind) : false) return s.presence.get(change.id);
		if (created || deleted || clause.changed === undefined || clause.changed.kind !== change.kind) continue;
		for (const field of clause.changed.fields) {
			if (!change.fields.includes(field)) continue;
			heard = true;
			at = later(at, s.fieldCause(change.id, field));
		}
	}
	return heard ? at : false;
}

/** Runs one phase over the edit so far, applying what its consequences write; the fault that stops it, or null. */
export function runPhase(s: Scratch, d: CompiledDeclaration, phase: string, context: unknown): PhaseFault | null {
	const index = d.listening.get(phase)!;
	const claimed = new Map<string, string>(); // entity -> the consequence that wrote it in this run of the phase
	// what a trigger hears, by its clauses, while nothing has been written since: consequences with one trigger share it (D25)
	const heardBy = new Map<string, { readonly steps: number; readonly matches: readonly GraphChangeRecord[]; readonly cause: number }>();
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
		let found = heardBy.get(c.signature);
		if (found === undefined || found.steps !== s.steps.length) {
			const list: GraphChangeRecord[] = [];
			const seen = new Set<string>();
			let at: Attribution | undefined;
			for (const kind of c.kinds) {
				for (const id of s.touchedOf(kind)) {
					if (seen.has(id)) continue;
					seen.add(id);
					const change = s.change(id);
					if (change === null) continue;
					const from = heardFrom(s, c, change);
					if (from === false) continue;
					list.push(change);
					at = later(at, from);
				}
			}
			// one kind's identities are already in the order first touched; several kinds' are merged into it
			if (c.kinds.length > 1) list.sort((a, b) => s.touchOrder(a.id) - s.touchOrder(b.id));
			found = { steps: s.steps.length, matches: Object.freeze(list), cause: at?.cause ?? -1 };
			heardBy.set(c.signature, found);
		}
		const { matches, cause } = found;
		if (matches.length === 0) continue;
		const failed = (code: GraphRefusalCode, ruleKey: string, subject: string): PhaseFault => ({ code, ruleKey, subject, measure: 1, opIndex: cause });
		// each change record is frozen once, when worked out, and handed as it is
		const heard = matches;
		const { reader, close } = openReader(s, d);
		let returned: unknown;
		try {
			returned = Reflect.apply(c.run, undefined, [Object.freeze({ matches: heard, graph: reader, context })]);
		} catch (thrown) {
			observePromises(thrown); // a thrown value holding a promise that rejects leaves no unhandled rejection (D30)
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

/** Every condition's breaches in one state, read with the plan's context, keyed `<rule key>@<subject>`, or the condition that failed to answer. */
export function readConditions(d: CompiledDeclaration, state: GraphState, context: unknown): { ok: true; breaches: Map<string, ConditionReading> } | { ok: false; fault: PhaseFault } {
	const breaches = new Map<string, ConditionReading>();
	for (const c of d.conditions) {
		const failed = { ok: false as const, fault: { code: "condition-failed" as const, ruleKey: c.key, subject: c.key, measure: 1, opIndex: -1 } };
		const { reader, close } = openReader(state, d);
		let returned: unknown;
		try {
			returned = Reflect.apply(c.check, undefined, [Object.freeze({ graph: reader, context })]);
		} catch (thrown) {
			observePromises(thrown);
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
