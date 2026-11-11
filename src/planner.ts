/**
 * Planning an edit (CONTRACT.md `plan-graph-change`, as far as M2 builds it; docs/DECISIONS.md D15 to D18): the edit is read
 * once as plain data, part by part; each requested item is checked against the scratch layer as the items before it left it
 * and applied; the reference rules are expanded until nothing more follows; the result is judged by key and measure against
 * the state the edit found; and the plan answers the steps applied, their reversal and the net writes, at the view's position
 * -- or refuses, at the item that faults or for the breach the edit introduced, naming its rule, its entity and the item
 * that led there. The view is only read. Application phases, consequences, the resolver and the context are later milestones'.
 */
import type { CompiledDeclaration } from "./declaration.js";
import { itemsOf, membersOf } from "./plain-members.js";
import { expandRules, newBreaches } from "./reference-rules.js";
import { type GraphRefusal, type GraphRefusalCode, refuse } from "./refusal.js";
import { type GraphStep, Scratch } from "./scratch.js";
import { type EntityView, type GraphRecord, heldBy, isObject, readEachPlain } from "./view.js";

/** The bounds of a plan (D17): at most this many requested items, and this many net writes after the rules. */
export const PLAN_LIMITS = Object.freeze({ maxEditItems: 2000, maxNetWrites: 2000 });

/**
 * One requested item (D18): a `create` of an entity absent at that point, with its whole record; a `change` of one present,
 * to a whole record; a `set` of named fields of one present, merged over its record; or a `remove` of one present.
 */
export type GraphEditItem =
	| { op: "create"; kind: string; id: string; record: GraphRecord }
	| { op: "change"; kind: string; id: string; record: GraphRecord }
	| { op: "set"; kind: string; id: string; patch: GraphRecord }
	| { op: "remove"; kind: string; id: string };

/** An edit: the items asked for together. */
export interface GraphEdit {
	items: readonly GraphEditItem[];
}

/** A plan: the steps in the order applied, their reversal in the order that undoes them, and the net writes per entity. */
export type GraphPlan = { ok: true; position: number; steps: GraphStep[]; inverse: GraphStep[]; writes: GraphStep[] } | { ok: false; refusal: GraphRefusal };

const MEMBERS: Readonly<Record<string, readonly string[]>> = { create: ["record"], change: ["record"], set: ["patch"], remove: [] };

/** A refusal carrying the rule key and measure its facts name. */
const withFacts = (r: GraphRefusal, ruleKey: string, measure: number): GraphPlan => ({ ok: false, refusal: { ...r, details: { ...r.details, ruleKey, measure } } });

/** Plans an edit over the view; reads the view and changes nothing of it. */
export function planEdit(view: EntityView, d: CompiledDeclaration, input: unknown): GraphPlan {
	const no = (code: GraphRefusalCode, subject: string, opIndex = -1): GraphPlan => ({ ok: false, refusal: refuse(code, subject, opIndex) });
	const edit = membersOf(input);
	if (edit === null) return no("invalid-edit", "edit");
	const stray = Object.keys(edit).find((k) => k !== "items");
	if (stray !== undefined) return no("invalid-edit", `edit.${stray}`);
	const listed = itemsOf(edit["items"]);
	if (listed === null) return no("invalid-edit", "items");
	if (listed.length === 0) return no("empty-edit", "items");
	if (listed.length > PLAN_LIMITS.maxEditItems) return no("too-many-items", String(listed.length));
	const read = readEachPlain(listed);
	if (!read.ok) return no("not-plain", `items[${read.at}]`, read.at);

	const s = new Scratch(view, d);
	for (const [i, item] of read.items.entries()) {
		if (!isObject(item)) return no("invalid-edit", `items[${i}]`, i);
		const { op, kind, id } = item;
		// a fault in the request names the item's identity as its subject (the corpus's R22; D18)
		const fault = (code: GraphRefusalCode, ruleKey: string = code): GraphPlan => withFacts(refuse(code, typeof id === "string" && id !== "" ? id : `items[${i}]`, i), ruleKey, 1);
		if (typeof op !== "string" || !Object.hasOwn(MEMBERS, op)) return fault("unknown-operation");
		const members = Object.keys(item).filter((k) => k !== "op" && k !== "kind" && k !== "id");
		if (typeof kind !== "string" || typeof id !== "string" || id === "" || members.join() !== MEMBERS[op]!.join()) return no("invalid-edit", `items[${i}]`, i);
		const refs = d.kinds.get(kind);
		if (refs === undefined) return fault("undeclared-kind");
		const held = s.get(id);
		if (op === "create") {
			if (held !== undefined) return fault(held.kind === kind ? "entity-present" : "identity-taken");
		} else if (held === undefined || held.kind !== kind) return fault("entity-absent");
		if (op === "remove") {
			s.write({ op: "del", kind, id }, i);
			continue;
		}
		const given = op === "set" ? item["patch"] : item["record"];
		if (!isObject(given)) return no("not-plain", id, i);
		const record: GraphRecord = op === "set" ? { ...held!.record, ...given } : given;
		for (const ref of refs) if (heldBy(record, ref) === undefined) return fault("invalid-reference", `${kind}.${ref.field}.holds`);
		s.write({ op: "put", kind, id, record }, i);
	}

	expandRules(s, d);
	const breach = newBreaches(s, d)[0];
	if (breach !== undefined) return withFacts(refuse("rule-broken", breach.subject, breach.opIndex), breach.ruleKey, breach.measure);
	const writes = s.netWrites();
	if (writes.length > PLAN_LIMITS.maxNetWrites) return withFacts(refuse("too-many-writes", `bound ${PLAN_LIMITS.maxNetWrites}`), "net-writes", writes.length);
	return { ok: true, position: view.position(), steps: [...s.steps], inverse: [...s.inverse], writes };
}

