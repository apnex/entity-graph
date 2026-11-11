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
import { EntityView, type GraphChange, type GraphEntity } from "./view.js";

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
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isList = (value: unknown): value is unknown[] => Array.isArray(value);

/** The filter's problem, as the subject of a refusal, or null when it names declared kinds and fields alone. */
function filterProblem(filter: unknown, declaration: CompiledDeclaration): string | null {
	if (filter === undefined) return null;
	if (typeof filter !== "object" || filter === null || Array.isArray(filter)) return "filter";
	for (const key of Object.keys(filter)) if (key !== "kinds" && key !== "fields") return `filter.${key}`;
	const { kinds, fields } = filter as { kinds?: unknown; fields?: unknown };
	if (kinds !== undefined && (!isList(kinds) || !kinds.every((k) => typeof k === "string" && declaration.kinds.has(k)))) return "filter.kinds";
	if (fields !== undefined && (!isList(fields) || !fields.every((f) => typeof f === "string" && declaration.fields.has(f)))) return "filter.fields";
	return null;
}

/** Makes a graph from a declaration, or refuses the declaration or the first entities, naming what is wrong. */
export function createEntityGraph(declaration: GraphDeclaration, opening: GraphOpening = {}): { ok: true; graph: EntityGraph } | { ok: false; refusal: GraphRefusal } {
	const compiled = compileDeclaration(declaration);
	if (!compiled.ok) return compiled;
	const d = compiled.declaration;
	const start = opening.position ?? 0;
	if (typeof start !== "number" || !Number.isSafeInteger(start) || start < 0) return { ok: false, refusal: refuse("invalid-change", "position") };
	const view = new EntityView(d, start);
	const filled = view.fill(opening.entities ?? []);
	if (!filled.ok) return filled;

	const query = (subject: string) => ({ ok: false as const, refusal: refuse("invalid-query", subject) });
	const isId = (value: unknown): value is string => typeof value === "string";
	const at = () => view.position();

	const graph: EntityGraph = {
		position: at,
		get(kind, id) {
			if (!d.kinds.has(kind)) return query("kind");
			if (!isId(id)) return query("id");
			const e = view.get(id);
			return { ok: true, position: at(), entity: e !== undefined && e.kind === kind ? e : null };
		},
		all(kind) {
			if (!d.kinds.has(kind)) return query("kind");
			return { ok: true, position: at(), entities: view.all(kind) };
		},
		referrersOf(targetId, filter) {
			if (!isId(targetId)) return query("targetId");
			const problem = filterProblem(filter, d);
			if (problem !== null) return query(problem);
			const referrers = view.index.referrersOf(targetId).filter((r) => (filter?.kinds === undefined || filter.kinds.includes(r.kind)) && (filter?.fields === undefined || filter.fields.includes(r.field)));
			return { ok: true, position: at(), referrers };
		},
		targetsOf(id, field) {
			if (!isId(id)) return query("id");
			if (field !== undefined && !(typeof field === "string" && d.fields.has(field))) return query("field");
			const targets: HeldTarget[] = [];
			for (const [f, ids] of view.index.targetsOf(id)) {
				if (field !== undefined && f !== field) continue;
				for (const t of ids) targets.push({ field: f, id: t, kind: view.get(t)?.kind ?? null });
			}
			return { ok: true, position: at(), found: view.get(id) !== undefined, targets };
		},
		ownerOf(memberId, containerKind) {
			if (!isId(memberId)) return query("memberId");
			if (!d.kinds.has(containerKind)) return query("containerKind");
			const owners = [...new Set(view.index.referrersOf(memberId).filter((r) => r.kind === containerKind).map((r) => r.id))];
			return { ok: true, position: at(), owners };
		},
		reachable(fromId, filter) {
			if (!isId(fromId)) return query("fromId");
			const problem = filterProblem(filter, d);
			if (problem !== null) return query(problem);
			// every identity reached by a path of one or more references: the start only when a cycle leads back to it, and an
			// identity the view does not hold reached, as held, leading nowhere further (D13)
			const reachedIds = new Set<string>();
			const queue = [fromId];
			while (queue.length > 0) {
				const from = queue.shift() as string;
				if (view.get(from) === undefined) continue;
				for (const [f, ids] of view.index.targetsOf(from)) {
					if (filter?.fields !== undefined && !filter.fields.includes(f)) continue;
					for (const t of ids) {
						const kind = view.get(t)?.kind ?? null;
						if (reachedIds.has(t) || (filter?.kinds !== undefined && (kind === null || !filter.kinds.includes(kind)))) continue;
						reachedIds.add(t);
						queue.push(t);
					}
				}
			}
			const reached = [...reachedIds].map((id) => ({ kind: view.get(id)?.kind ?? null, id })).sort(byId);
			return { ok: true, position: at(), reached };
		},
		applyChange(change) {
			return view.take(change);
		},
	};
	return { ok: true, graph: Object.freeze(graph) };
}
