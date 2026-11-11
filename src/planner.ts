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

/** One requested item: a creation or replacement with its whole record, a change of named fields, or a removal. */
export type GraphEditItem = { op: "put"; kind: string; id: string; record: GraphRecord } | { op: "set"; kind: string; id: string; patch: GraphRecord } | { op: "del"; kind: string; id: string };

/** An edit: the items asked for together. */
export interface GraphEdit {
	items: readonly GraphEditItem[];
}

/** A plan: the steps in the order applied, their reversal in the order that undoes them, and the net writes per entity. */
export type GraphPlan = { ok: true; position: number; steps: GraphStep[]; inverse: GraphStep[]; writes: GraphStep[] } | { ok: false; refusal: GraphRefusal };

const OPS = new Set(["put", "set", "del"]);
const MEMBERS: Readonly<Record<string, readonly string[]>> = { put: ["record"], set: ["patch"], del: [] };

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
		if (typeof op !== "string" || !OPS.has(op)) return no("unknown-operation", `items[${i}].op`, i);
		const members = Object.keys(item).filter((k) => k !== "op" && k !== "kind" && k !== "id");
		if (typeof kind !== "string" || typeof id !== "string" || id === "" || members.join() !== MEMBERS[op]!.join()) return no("invalid-edit", `items[${i}]`, i);
		const subject = `${kind}:${id}`;
		const refs = d.kinds.get(kind);
		if (refs === undefined) return no("undeclared-kind", subject, i);
		const held = s.get(id);
		if (op === "del") {
			if (held === undefined || held.kind !== kind) return no("not-found", subject, i);
			s.write({ op: "del", kind, id }, i);
			continue;
		}
		if (held !== undefined && held.kind !== kind) return no("identity-taken", subject, i);
		if (op === "set" && held === undefined) return no("not-found", subject, i);
		const given = op === "put" ? item["record"] : item["patch"];
		if (!isObject(given)) return no("not-plain", subject, i);
		const record: GraphRecord = op === "put" ? given : { ...held!.record, ...given };
		for (const ref of refs) if (heldBy(record, ref) === undefined) return no("invalid-reference", `${subject}.${ref.field}`, i);
		s.write({ op: "put", kind, id, record }, i);
	}

	expandRules(s, d);
	const breach = newBreaches(s, d)[0];
	if (breach !== undefined) {
		const r = refuse("rule-broken", breach.subject, breach.opIndex);
		return { ok: false, refusal: { ...r, details: { ...r.details, ruleKey: breach.ruleKey, measure: breach.measure } } };
	}
	const writes = s.netWrites();
	if (writes.length > PLAN_LIMITS.maxNetWrites) {
		const r = refuse("too-many-writes", `bound ${PLAN_LIMITS.maxNetWrites}`);
		return { ok: false, refusal: { ...r, details: { ...r.details, ruleKey: "net-writes", measure: writes.length } } };
	}
	return { ok: true, position: view.position(), steps: [...s.steps], inverse: [...s.inverse], writes };
}

