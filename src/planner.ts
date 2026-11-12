/**
 * Planning an edit (CONTRACT.md `plan-graph-change`, *Consequences and the stopping rule*, *Consequence writes held to request
 * rules*, *Judging and refusals*; docs/DECISIONS.md D15 to D24), under one stopping rule: the edit is read once as plain data,
 * part by part; each requested item is checked against the scratch layer as the items before it left it and applied; the
 * reference rules are expanded until nothing more follows; the declared phases run in their order, each once, the rules
 * expanded again after each; and the result is judged by key and measure against the state the edit found -- the reference
 * rules, the shapes and the conditions -- every entity a consequence wrote held to what a requested write of it meets. The plan
 * answers the steps applied, their reversal and the net writes, at the view's position, or refuses, naming the rule, the
 * entity and the item that led there. The view is only read. Intent resolvers and the edit context are M4's.
 */
import type { CompiledDeclaration } from "./declaration.js";
import { applyItem } from "./items.js";
import { itemsOf, membersOf } from "./plain-members.js";
import { type PhaseFault, readConditions, runPhase } from "./phases.js";
import { type ConditionReading, judge, RuleExpander } from "./reference-rules.js";
import { type GraphRefusal, type GraphRefusalCode, refuse } from "./refusal.js";
import { type GraphStep, Scratch } from "./scratch.js";
import { type EntityView, type GraphRecord, readEachPlain } from "./view.js";

/** The conditions' breaches in the state the edit found, read once per position (D21), or the condition that failed to answer. */
export type ConditionsBefore = () => { ok: true; breaches: ReadonlyMap<string, ConditionReading> } | { ok: false; fault: PhaseFault };

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

/** A refusal carrying the rule key and measure its facts name. */
const withFacts = (r: GraphRefusal, ruleKey: string, measure: number): GraphPlan => ({ ok: false, refusal: { ...r, details: { ...r.details, ruleKey, measure } } });

/** Plans an edit over the view; reads the view and changes nothing of it. */
export function planEdit(view: EntityView, d: CompiledDeclaration, input: unknown, conditionsBefore: ConditionsBefore): GraphPlan {
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

	// 1. each requested item applied, a fault refused at the first item that faults (the corpus's R22)
	const s = new Scratch(view, d);
	for (const [i, item] of read.items.entries()) {
		const fault = applyItem(s, d, item, `items[${i}]`, i, null);
		if (fault === null) continue;
		if (fault.code === "invalid-edit" || fault.code === "not-plain") return no(fault.code, fault.subject, i);
		return withFacts(refuse(fault.code, fault.subject, i), fault.ruleKey ?? fault.code, 1);
	}
	// the rules expanded to a fixed point; 2. each phase once, in declared order, the rules expanded after each; 3. none again
	const bound = (measure: number): GraphPlan => withFacts(refuse("too-many-writes", `bound ${PLAN_LIMITS.maxNetWrites}`), "net-writes", measure);
	const expander = new RuleExpander(s, d);
	if (!expander.run(PLAN_LIMITS.maxNetWrites)) return bound(s.certainWrites());
	for (const phase of d.phases) {
		const fault = runPhase(s, d, phase);
		if (fault !== null) return withFacts(refuse(fault.code, fault.subject, fault.opIndex), fault.ruleKey, 1);
		if (!expander.run(PLAN_LIMITS.maxNetWrites)) return bound(s.certainWrites());
	}
	// the bound is judged before the rules' breaches, since an expansion stopped at it is not judged (D19)
	const writes = s.netWrites();
	if (writes.length > PLAN_LIMITS.maxNetWrites) return bound(writes.length);
	let before: ReadonlyMap<string, ConditionReading> = new Map();
	let after: ReadonlyMap<string, ConditionReading> = new Map();
	if (d.conditions.length > 0) {
		const was = conditionsBefore();
		if (!was.ok) return withFacts(refuse(was.fault.code, was.fault.subject, was.fault.opIndex), was.fault.ruleKey, 1);
		const now = readConditions(d, s);
		if (!now.ok) return withFacts(refuse(now.fault.code, now.fault.subject, now.fault.opIndex), now.fault.ruleKey, 1);
		before = was.breaches;
		after = now.breaches;
	}
	const verdict = judge(s, d, before, after);
	if (verdict !== null) {
		const r = withFacts(refuse(verdict.code, verdict.subject, verdict.opIndex), verdict.ruleKey, verdict.measure);
		return verdict.sentence === null || r.ok ? r : { ok: false, refusal: { ...r.refusal, details: { ...r.refusal.details, sentence: verdict.sentence } } };
	}
	return { ok: true, position: view.position(), steps: [...s.steps], inverse: s.inverse(), writes };
}
