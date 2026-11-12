/**
 * createEntityGraph (CONTRACT.md `dated-graph-view`; docs/DECISIONS.md D10 to D14): a graph made from the application's
 * declaration and, optionally, the entities it holds at a stated position; it takes in each later change in position order
 * and answers, each answer stating the position it reflects: an entity, a kind's entities, what refers to an entity, what an
 * entity refers to, which containers of a kind hold a member, and what can be reached from an entity by following references.
 * Asking changes nothing. A question naming a kind or a field the declaration does not hold is refused, not answered empty.
 */
import { type CompiledDeclaration, compileDeclaration, type GraphDeclaration } from "./declaration.js";
import type { Referrer } from "./references.js";
import { type GraphRefusal, refuse } from "./refusal.js";
import { itemsOf, membersOf, observeAll, readPlain, samePlain } from "./plain-members.js";
import { readConditions } from "./phases.js";
import { type ConditionsBefore, type GraphEdit, type GraphPlan, planEdit } from "./planner.js";
import { viewState } from "./scratch.js";
import { History, type HistoryBounds, type HistoryEdit, noteOf, type RecordedEntity, recordOf, type UndoRecord } from "./history.js";
import { type GraphStorePort, noteBytes } from "./port.js";
import { planReplay } from "./replay.js";
import type { GraphStep } from "./scratch.js";
import { EntityView, type GraphChange, type GraphEntity, isObject, readEachPlain } from "./view.js";

/** Where a graph starts: the position its first entities are stated at, and those entities (docs/DECISIONS.md D12). */
export interface GraphOpening {
	position?: number;
	entities?: readonly { kind: string; id: string; record: unknown }[];
}

/** Which references a question follows: those of the named fields, and those held by or reaching entities of the named kinds. */
export interface ReferenceFilter {
	kinds?: readonly string[];
	fields?: readonly string[];
}

/** One target an entity's reference holds, with the target's kind, or null when the view holds no entity of that identity. */
export interface HeldTarget {
	readonly field: string;
	readonly id: string;
	readonly kind: string | null;
}

/** What an answer always carries: the store position it is true at. */
type Dated<T> = ({ ok: true; position: number } & T) | { ok: false; refusal: GraphRefusal };

/** A graph's questions and its intake. */
export interface EntityGraph {
	position(): number;
	get(kind: string, id: string): Dated<{ entity: GraphEntity | null }>;
	all(kind: string): Dated<{ entities: GraphEntity[] }>;
	referrersOf(targetId: string, filter?: ReferenceFilter): Dated<{ referrers: Referrer[] }>;
	targetsOf(id: string, field?: string): Dated<{ found: boolean; targets: HeldTarget[] }>;
	ownerOf(memberId: string, containerKind: string): Dated<{ owners: string[] }>;
	reachable(fromId: string, filter?: ReferenceFilter): Dated<{ reached: { kind: string | null; id: string }[] }>;
	applyChange(change: GraphChange): { ok: true; position: number } | { ok: false; refusal: GraphRefusal };
	/**
	 * Plans an edit with the kinds' intent resolvers, the declared reference rules, phases, shapes and conditions (D15, D20 to D28):
	 * the steps, their reversal and the net writes, or a refusal; changes no answer. `options.context` is read once as plain JSON
	 * and handed to consequences, conditions and resolvers, never interpreted.
	 */
	plan(edit: GraphEdit, options?: { context?: unknown }): GraphPlan;
	/** Plans an edit and lands its net writes through the store port as one change, its undo record in its note (D33, D34). */
	commit(edit: GraphEdit, options?: { context?: unknown }): CommitAnswer;
	/** Undoes the latest landed edit not yet undone, or every such edit down to the one that landed at `to`, as one change (D33). */
	undo(to?: number, options?: { context?: unknown }): CommitAnswer;
	/** Redoes the latest undone edit (D33). */
	redo(options?: { context?: unknown }): CommitAnswer;
	/** What the history holds: each edit by the position it landed at, oldest first, whether undone, and how many it evicted (D35). */
	history(): { edits: { position: number; bytes: number; pinned: boolean; undone: boolean }[]; evicted: number };
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isList = (value: unknown): value is unknown[] => Array.isArray(value);

/**
 * A filter read once as plain JSON, naming declared kinds and fields alone, or the subject of its refusal: a getter or a Proxy is
 * refused rather than run, and what is checked is what is used.
 */
function readFilter(input: unknown, declaration: CompiledDeclaration): { filter: { kinds?: readonly string[]; fields?: readonly string[] } } | { problem: string } {
	if (input === undefined) return { filter: {} };
	const read = readPlain(input);
	if (!read.ok || typeof read.value !== "object" || read.value === null || Array.isArray(read.value)) return { problem: "filter" };
	const value = read.value as Record<string, unknown>;
	for (const key of Object.keys(value)) if (key !== "kinds" && key !== "fields") return { problem: `filter.${key}` };
	const { kinds, fields } = value;
	if (kinds !== undefined && (!isList(kinds) || !kinds.every((k) => typeof k === "string" && declaration.kinds.has(k)))) return { problem: "filter.kinds" };
	if (fields !== undefined && (!isList(fields) || !fields.every((f) => typeof f === "string" && declaration.fields.has(f)))) return { problem: "filter.fields" };
	return { filter: { ...(kinds !== undefined ? { kinds: kinds as string[] } : {}), ...(fields !== undefined ? { fields: fields as string[] } : {}) } };
}

/** A graph's options: the store port it lands edits through, and the bounds of the history it keeps for undo (D33, D35). */
export interface GraphOptions {
	port?: GraphStorePort;
	history?: HistoryBounds;
}

/**
 * What a commit, an undo or a redo answers: that its change landed, where, and its net writes; or, for a commit whose plan changes
 * nothing, that it landed nothing, with no position (D38); or a refusal.
 */
export type CommitAnswer =
	| { ok: true; landed: true; position: number; writes: GraphStep[]; steps?: GraphStep[]; inverse?: GraphStep[] }
	| { ok: true; landed: false; writes: []; steps: GraphStep[]; inverse: GraphStep[] }
	| { ok: false; refusal: GraphRefusal };

/** Calls the store port, its answer read once as plain JSON; null where it throws or answers otherwise (D30, D31). */
function callPort(call: () => unknown): unknown {
	try {
		const read = readPlain(call());
		return read.ok ? read.value : null;
	} catch (thrown) {
		observeAll(thrown);
		return null;
	}
}

/**
 * A call's options read once, its context as plain JSON (the corpus's R34; D28), or the refusal; each refusal observes `unread`,
 * what the call carries that was not read, and the options' members it did not read (D30, D31).
 */
function readCallOptions(options: unknown, unread: unknown): { ok: true; context: unknown } | { ok: false; refusal: GraphRefusal } {
	if (options === undefined) return { ok: true, context: undefined };
	const given = membersOf(options, true);
	if (given === null) {
		observeAll(unread);
		return { ok: false, refusal: refuse("invalid-edit", "options") };
	}
	const stray = Object.keys(given).find((k) => k !== "context");
	if (stray !== undefined) {
		observeAll([given, unread]);
		return { ok: false, refusal: refuse("invalid-edit", `options.${stray}`) };
	}
	if (given["context"] === undefined) return { ok: true, context: undefined };
	const read = readPlain(given["context"]);
	if (read.ok) return { ok: true, context: read.value };
	observeAll(unread);
	return { ok: false, refusal: refuse("invalid-context", "context") };
}

/** The graph's options read once: the port's members and the history's bounds, or the refusal naming the part (D33, D35). */
function readGraphOptions(options: unknown): { ok: true; port: GraphStorePort | undefined; bounds: HistoryBounds } | { ok: false; refusal: GraphRefusal } {
	const bad = (subject: string) => ({ ok: false as const, refusal: refuse("invalid-options", subject) });
	if (options === undefined) return { ok: true, port: undefined, bounds: {} };
	const given = membersOf(options);
	if (given === null) return bad("options: invalid");
	const stray = Object.keys(given).find((k) => k !== "port" && k !== "history");
	if (stray !== undefined) return bad(`${stray}: unknown`);
	let port: GraphStorePort | undefined;
	const p = given["port"];
	if (p !== undefined) {
		if (typeof p !== "object" || p === null) return bad("port: invalid");
		try {
			const { noteBound, position, change, changes } = p as Record<string, unknown>;
			if (typeof noteBound !== "number" || !Number.isSafeInteger(noteBound) || noteBound < 1) return bad("port.noteBound: invalid");
			for (const [name, fn] of [["position", position], ["change", change], ["changes", changes]] as const) if (typeof fn !== "function") return bad(`port.${name}: invalid`);
			port = Object.freeze({
				noteBound,
				position: () => Reflect.apply(position as () => number, p, []) as number,
				change: (input: Parameters<GraphStorePort["change"]>[0]) => Reflect.apply(change as GraphStorePort["change"], p, [input]) as ReturnType<GraphStorePort["change"]>,
				changes: (since: number) => Reflect.apply(changes as GraphStorePort["changes"], p, [since]) as ReturnType<GraphStorePort["changes"]>,
			});
		} catch (thrown) {
			observeAll(thrown);
			return bad("port: invalid");
		}
	}
	if (given["history"] === undefined) return { ok: true, port, bounds: {} };
	const h = membersOf(given["history"]);
	if (h === null) return bad("history: invalid");
	const extra = Object.keys(h).find((k) => !["count", "bytes", "hardCount", "hardBytes", "pin"].includes(k));
	if (extra !== undefined) return bad(`history.${extra}: unknown`);
	for (const k of ["count", "bytes", "hardCount", "hardBytes"]) {
		const v = h[k];
		if (v !== undefined && (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1)) return bad(`history.${k}: invalid`);
	}
	const n = (k: string) => h[k] as number | undefined;
	if (n("hardCount") !== undefined && n("count") !== undefined && n("hardCount")! < n("count")!) return bad("history.hardCount: invalid");
	if (n("hardBytes") !== undefined && n("bytes") !== undefined && n("hardBytes")! < n("bytes")!) return bad("history.hardBytes: invalid");
	if (h["pin"] !== undefined && typeof h["pin"] !== "function") return bad("history.pin: invalid");
	return { ok: true, port, bounds: h as HistoryBounds };
}

/** Makes a graph from a declaration, or refuses the declaration or the first entities, naming what is wrong. */
export function createEntityGraph(declaration: GraphDeclaration, opening?: GraphOpening, options?: GraphOptions): { ok: true; graph: EntityGraph } | { ok: false; refusal: GraphRefusal } {
	const compiled = compileDeclaration(declaration);
	if (!compiled.ok) {
		observeAll([opening, options]); // refused before the opening and the options are read, they are observed unread (D31)
		return compiled;
	}
	const store = readGraphOptions(options);
	if (!store.ok) {
		observeAll([opening, options]);
		return store;
	}
	const { port, bounds } = store;
	const history = new History({ count: bounds.count ?? Infinity, bytes: bounds.bytes ?? Infinity, hardCount: bounds.hardCount ?? Infinity, hardBytes: bounds.hardBytes ?? Infinity });
	const d = compiled.declaration;
	// the opening read once as plain data, part by part (D12): none opens an empty graph at 0; a member other than its
	// position and entities, or anything not plain data, is refused, the first entity that is not named by its index
	const members = opening === undefined ? Object.create(null) as Record<string, unknown> : membersOf(opening);
	if (members === null) return { ok: false, refusal: refuse("invalid-opening", "opening") };
	// an opening refused before its entities are read has its promises observed (D30)
	const unread = (subject: string) => {
		observeAll(opening);
		return { ok: false as const, refusal: refuse("invalid-opening", subject) };
	};
	const stray = Object.keys(members).find((k) => k !== "position" && k !== "entities");
	if (stray !== undefined) return unread(`opening.${stray}`);
	const start = members["position"] ?? 0;
	if (typeof start !== "number" || !Number.isSafeInteger(start) || start < 0) return unread("opening.position");
	const listed = members["entities"] === undefined ? [] : itemsOf(members["entities"], true);
	if (listed === null) return { ok: false, refusal: refuse("invalid-opening", "opening.entities") };
	const entities = readEachPlain(listed);
	if (!entities.ok) return { ok: false, refusal: refuse("invalid-opening", `opening.entities[${entities.at}]`, entities.at) };
	const view = new EntityView(d, start);
	const filled = view.fill(entities.items);
	if (!filled.ok) return filled;
	// a graph made over a store stands at the store's position, its opening what the store holds there (D33)
	if (port !== undefined) {
		const at = callPort(() => port.position());
		if (at !== start) return { ok: false, refusal: refuse("invalid-options", `port: the store stands at ${String(at)}, the opening at ${start}`) };
	}

	// a question refused for one argument observes all of them, so a promise in one it never read goes unhandled by no one (D31)
	const query = (subject: string, ...args: unknown[]) => {
		observeAll(args);
		return { ok: false as const, refusal: refuse("invalid-query", subject) };
	};
	const isId = (value: unknown): value is string => typeof value === "string";
	const at = () => view.position();
	// whether a plan is running, so a consequence, condition or resolver calling back in is refused (D22); and the conditions'
	// breaches as the view stands, read once per position and context (D21, D28)
	let planning = false;
	// the context compared with its keys' order, since a condition may read that order (D31)
	let held: { position: number; context: unknown; reading: ReturnType<ConditionsBefore> } | null = null;
	const conditionsBefore: ConditionsBefore = (context) => {
		if (held === null || held.position !== view.position() || !samePlain(held.context, context, true)) held = { position: view.position(), context, reading: readConditions(d, viewState(view), context) };
		return held.reading;
	};

	const graph: EntityGraph = {
		position: at,
		get(kind, id) {
			if (!d.kinds.has(kind)) return query("kind", kind, id);
			if (!isId(id)) return query("id", kind, id);
			const e = view.get(id);
			return { ok: true, position: at(), entity: e !== undefined && e.kind === kind ? e : null };
		},
		all(kind) {
			if (!d.kinds.has(kind)) return query("kind", kind);
			return { ok: true, position: at(), entities: view.all(kind) };
		},
		referrersOf(targetId, input) {
			if (!isId(targetId)) return query("targetId", targetId, input);
			const read = readFilter(input, d);
			if ("problem" in read) return query(read.problem, targetId, input);
			const filter = read.filter;
			const referrers = view.index.referrersOf(targetId).filter((r) => (filter.kinds === undefined || filter.kinds.includes(r.kind)) && (filter.fields === undefined || filter.fields.includes(r.field)));
			return { ok: true, position: at(), referrers };
		},
		targetsOf(id, field) {
			if (!isId(id)) return query("id", id, field);
			if (field !== undefined && !(typeof field === "string" && d.fields.has(field))) return query("field", id, field);
			const targets: HeldTarget[] = [];
			for (const [f, ids] of view.index.targetsOf(id)) {
				if (field !== undefined && f !== field) continue;
				for (const t of ids) targets.push({ field: f, id: t, kind: view.get(t)?.kind ?? null });
			}
			return { ok: true, position: at(), found: view.get(id) !== undefined, targets };
		},
		ownerOf(memberId, containerKind) {
			if (!isId(memberId)) return query("memberId", memberId, containerKind);
			if (!d.kinds.has(containerKind)) return query("containerKind", memberId, containerKind);
			const owners = [...new Set(view.index.referrersOf(memberId).filter((r) => r.kind === containerKind).map((r) => r.id))];
			return { ok: true, position: at(), owners };
		},
		reachable(fromId, input) {
			if (!isId(fromId)) return query("fromId", fromId, input);
			const read = readFilter(input, d);
			if ("problem" in read) return query(read.problem, fromId, input);
			const filter = read.filter;
			// every identity reached by a path of one or more references: the start only when a cycle leads back to it, and an
			// identity the view does not hold reached, as held, leading nowhere further (D13)
			// the queue is read by a moving index, never shifted, so a walk costs what it reaches
			const reachedIds = new Set<string>();
			const queue = [fromId];
			for (let next = 0; next < queue.length; next++) {
				const from = queue[next] as string;
				if (view.get(from) === undefined) continue;
				for (const [f, ids] of view.index.targetsOf(from)) {
					if (filter.fields !== undefined && !filter.fields.includes(f)) continue;
					for (const t of ids) {
						const kind = view.get(t)?.kind ?? null;
						if (reachedIds.has(t) || (filter.kinds !== undefined && (kind === null || !filter.kinds.includes(kind)))) continue;
						reachedIds.add(t);
						queue.push(t);
					}
				}
			}
			const reached = [...reachedIds].map((id) => ({ kind: view.get(id)?.kind ?? null, id })).sort(byId);
			return { ok: true, position: at(), reached };
		},
		applyChange(change) {
			if (planning) {
				observeAll(change); // refused unread (D31)
				return { ok: false, refusal: refuse("reentrant", "applyChange") };
			}
			return view.take(change);
		},
		plan(edit, options) {
			// a call made while planning is refused for that alone, whatever it carries, which is observed unread (D22, D31)
			if (planning) {
				observeAll([edit, options]);
				return { ok: false, refusal: refuse("reentrant", "plan") };
			}
			const read = readCallOptions(options, edit);
			if (!read.ok) return read;
			planning = true;
			try {
				return planEdit(view, d, edit, read.context, conditionsBefore);
			} finally {
				planning = false;
			}
		},
		commit(edit, options) {
			if (planning) {
				observeAll([edit, options]);
				return { ok: false, refusal: refuse("reentrant", "commit") };
			}
			if (port === undefined) {
				observeAll([edit, options]);
				return { ok: false, refusal: refuse("no-store", "commit") };
			}
			const read = readCallOptions(options, edit);
			if (!read.ok) return read;
			planning = true;
			try {
				const planned = planEdit(view, d, edit, read.context, conditionsBefore);
				// a plan that changes nothing lands nothing (D29), holds no place in the history, and answers no position (D38)
				if (!planned.ok) return planned;
				if (planned.writes.length === 0) return { ok: true, landed: false, steps: planned.steps, inverse: planned.inverse, writes: [] };
				const entities: RecordedEntity[] = planned.writes.map((w) => [w.kind, w.id, view.get(w.id)?.record ?? null, w.op === "put" ? w.record : null]);
				const landed = land(port, planned.writes, { act: "edit", of: [], entities });
				if (!landed.ok) return landed;
				history.landed({ position: landed.position, bytes: landed.bytes, pinned: pinned(landed.position, planned.writes) });
				return { ok: true, landed: true, position: landed.position, steps: planned.steps, inverse: planned.inverse, writes: planned.writes };
			} finally {
				planning = false;
			}
		},
		undo(to, options) {
			if (planning) {
				observeAll([to, options]);
				return { ok: false, refusal: refuse("reentrant", "undo") };
			}
			if (port === undefined) {
				observeAll([to, options]);
				return { ok: false, refusal: refuse("no-store", "undo") };
			}
			if (to !== undefined && !Number.isSafeInteger(to)) {
				observeAll([to, options]);
				return { ok: false, refusal: refuse("undo-target-unknown", "to") };
			}
			const read = readCallOptions(options, to);
			if (!read.ok) return read;
			planning = true;
			try {
				const edits = history.toUndo(to);
				if (edits === null) return { ok: false, refusal: history.holdsAny() ? refuse("undo-target-unknown", String(to)) : refuse("nothing-to-undo", "history") };
				return replay(port, edits, true, read.context);
			} finally {
				planning = false;
			}
		},
		redo(options) {
			if (planning) {
				observeAll(options);
				return { ok: false, refusal: refuse("reentrant", "redo") };
			}
			if (port === undefined) {
				observeAll(options);
				return { ok: false, refusal: refuse("no-store", "redo") };
			}
			const read = readCallOptions(options, undefined);
			if (!read.ok) return read;
			planning = true;
			try {
				const edit = history.toRedo();
				if (edit === null) return { ok: false, refusal: refuse("nothing-to-redo", "history") };
				return replay(port, [edit], false, read.context);
			} finally {
				planning = false;
			}
		},
		history() {
			return history.read();
		},
	};

	/** Whether the application pins an edit just landed; a pin answering anything but true, or throwing, pins nothing (D35). */
	function pinned(position: number, writes: readonly GraphStep[]): boolean {
		if (bounds.pin === undefined) return false;
		try {
			const answer: unknown = Reflect.apply(bounds.pin, undefined, [Object.freeze({ position, writes: Object.freeze([...writes]) })]);
			if (typeof answer !== "boolean") observeAll(answer);
			return answer === true;
		} catch (thrown) {
			observeAll(thrown);
			return false;
		}
	}

	/** Replays the records of `edits` - their reversal where `undo` - as one change, and moves the history (D33, D37). */
	function replay(port: GraphStorePort, edits: readonly HistoryEdit[], undo: boolean, context: unknown): CommitAnswer {
		const records: UndoRecord[] = [];
		for (const e of edits) {
			const read = recordAt(port, e.position);
			if (!read.ok) return read;
			records.push(read.record);
		}
		const planned = planReplay(view, d, records, undo, context, conditionsBefore);
		if (!planned.ok) return planned;
		const landed = land(port, planned.writes, { act: undo ? "undo" : "redo", of: edits.map((e) => e.position), entities: planned.entities });
		if (!landed.ok) return landed;
		if (undo) history.undone(edits.length);
		else history.redone();
		return { ok: true, landed: true, position: landed.position, writes: planned.writes };
	}

	/**
	 * Lands net writes as one change through the port, its undo record in its note, guarded by the view's position; refused before
	 * anything lands where the record would not fit the store's bound on a note (D33, D34).
	 */
	function land(port: GraphStorePort, writes: readonly GraphStep[], record: UndoRecord): { ok: true; position: number; bytes: number } | { ok: false; refusal: GraphRefusal } {
		const note = noteOf(record);
		const bytes = noteBytes(note);
		if (bytes > port.noteBound) return { ok: false, refusal: { ...refuse("note-bound", "note"), details: { ...refuse("note-bound", "note").details, measure: bytes } } };
		const items = writes.map((w) => (w.op === "del" ? { kind: w.kind, id: w.id, deleted: true as const } : { kind: w.kind, id: w.id, record: w.record }));
		// a change the view would not take is never sent, so the store and the view cannot part (D38)
		const unfit = view.checkItems(items);
		if (unfit !== null) return { ok: false, refusal: unfit };
		const answer = callPort(() => port.change({ writes: items, expectedPosition: view.position(), note }));
		if (answer === null || typeof answer !== "object" || typeof (answer as { ok?: unknown }).ok !== "boolean") return { ok: false, refusal: refuse("store-failed", "change") };
		const { ok, position, code } = answer as { ok: boolean; position?: unknown; code?: unknown };
		if (!ok) return { ok: false, refusal: code === "store-moved" ? refuse("store-moved", "position") : refuse("store-failed", `change: ${String(code)}`) };
		if (typeof position !== "number" || !Number.isSafeInteger(position)) return { ok: false, refusal: refuse("store-failed", "change") };
		const taken = view.take({ position, items });
		if (!taken.ok) return { ok: false, refusal: refuse("store-failed", `change: landed at ${position}, not taken in`) };
		return { ok: true, position, bytes };
	}

	/** The undo record in the note on the change that landed at `position`, read back from the store (D34). */
	function recordAt(port: GraphStorePort, position: number): { ok: true; record: UndoRecord } | { ok: false; refusal: GraphRefusal } {
		const answer = callPort(() => port.changes(position - 1));
		const changes = answer !== null && typeof answer === "object" && Array.isArray((answer as { changes?: unknown }).changes) ? (answer as { changes: unknown[] }).changes : null;
		if (changes === null) return { ok: false, refusal: refuse("store-failed", "changes") };
		const change = changes.find((c) => isObject(c) && c["position"] === position);
		const record = isObject(change) ? recordOf(change["note"]) : null;
		return record === null ? { ok: false, refusal: refuse("history-unreadable", String(position)) } : { ok: true, record };
	}

		return { ok: true, graph: Object.freeze(graph) };
}
