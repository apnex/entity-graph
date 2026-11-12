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
import { EntityView, type GraphChange, type GraphEntity, readEachPlain } from "./view.js";

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

/** Makes a graph from a declaration, or refuses the declaration or the first entities, naming what is wrong. */
export function createEntityGraph(declaration: GraphDeclaration, opening?: GraphOpening): { ok: true; graph: EntityGraph } | { ok: false; refusal: GraphRefusal } {
	const compiled = compileDeclaration(declaration);
	if (!compiled.ok) {
		observeAll(opening); // refused before the opening is read, it is observed unread (D31)
		return compiled;
	}
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
			// the context read once as plain JSON before any item, refused of the edit as a whole if it is not (the corpus's R34; D28)
			let context: unknown;
			if (options !== undefined) {
				const given = membersOf(options, true);
				// each refusal before the edit is read observes it, and the options' members it did not read (D30, D31)
				if (given === null) {
					observeAll(edit);
					return { ok: false, refusal: refuse("invalid-edit", "options") };
				}
				const stray = Object.keys(given).find((k) => k !== "context");
				if (stray !== undefined) {
					observeAll([given, edit]);
					return { ok: false, refusal: refuse("invalid-edit", `options.${stray}`) };
				}
				if (given["context"] !== undefined) {
					const read = readPlain(given["context"]);
					if (!read.ok) {
						observeAll(edit);
						return { ok: false, refusal: refuse("invalid-context", "context") };
					}
					context = read.value;
				}
			}
			planning = true;
			try {
				return planEdit(view, d, edit, context, conditionsBefore);
			} finally {
				planning = false;
			}
		},
	};
	return { ok: true, graph: Object.freeze(graph) };
}
