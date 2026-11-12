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
import { applyItem, type ItemFault } from "./items.js";
import { itemsOf, membersOf, observeAll } from "./plain-members.js";
import { type PhaseFault, readConditions, runPhase } from "./phases.js";
import { type ConditionReading, judge, RuleExpander } from "./reference-rules.js";
import { type GraphRefusal, type GraphRefusalCode, refuse } from "./refusal.js";
import { resolveItem } from "./resolvers.js";
import { type GraphStep, Scratch, StepLimitReached } from "./scratch.js";
import { type EntityView, type GraphRecord, isObject, readEachPlain } from "./view.js";

/**
 * The conditions' breaches in the state the edit found, read with the plan's context once per position and context (D21, D28), or
 * the condition that failed to answer.
 */
export type ConditionsBefore = (context: unknown) => { ok: true; breaches: ReadonlyMap<string, ConditionReading> } | { ok: false; fault: PhaseFault };

/** The faults of a resolver's write that are the resolver's own: a write that is no item, or names no declared kind (D27). */
const RESOLVER_FAULTS: ReadonlySet<GraphRefusalCode> = new Set(["invalid-edit", "unknown-operation", "undeclared-kind", "not-plain"]);

/**
 * The bounds of a plan (D17, D35): at most this many requested items, this many net writes after the rules, and this many steps,
 * ten times the net writes, so an expansion is refused before it costs more than its record could hold.
 */
export const PLAN_LIMITS = Object.freeze({ maxEditItems: 2000, maxNetWrites: 2000, maxSteps: 20_000 });

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
/** A refusal carrying the facts named: any of its rule key, measure, sentence and writers. */
const withDetails = (r: GraphRefusal, details: Partial<GraphRefusal["details"]>): GraphPlan => ({ ok: false, refusal: { ...r, details: { ...r.details, ...details } } });

/** Plans an edit over the view, with the context already read as plain JSON; reads the view and changes nothing of it. */
export function planEdit(view: EntityView, d: CompiledDeclaration, input: unknown, context: unknown, conditionsBefore: ConditionsBefore): GraphPlan {
	const no = (code: GraphRefusalCode, subject: string, opIndex = -1): GraphPlan => ({ ok: false, refusal: refuse(code, subject, opIndex) });
	// an edit refused before its items are read has its promises observed, so none it holds goes unhandled (D30)
	const unread = (code: GraphRefusalCode, subject: string): GraphPlan => {
		observeAll(input);
		return no(code, subject);
	};
	const edit = membersOf(input);
	if (edit === null) return no("invalid-edit", "edit");
	const stray = Object.keys(edit).find((k) => k !== "items");
	if (stray !== undefined) return unread("invalid-edit", `edit.${stray}`);
	const listed = itemsOf(edit["items"], true);
	if (listed === null) return no("invalid-edit", "items");
	if (listed.length === 0) return unread("empty-edit", "items");
	if (listed.length > PLAN_LIMITS.maxEditItems) return unread("too-many-items", String(listed.length));
	const read = readEachPlain(listed);
	if (!read.ok) return no("not-plain", `items[${read.at}]`, read.at);

	const s = new Scratch(view, d, PLAN_LIMITS.maxSteps);
	try {
		return planOn(s, view, d, read.items, context, conditionsBefore, no);
	} catch (thrown) {
		if (!(thrown instanceof StepLimitReached)) throw thrown;
		return withFacts(refuse("too-many-steps", `bound ${PLAN_LIMITS.maxSteps}`), "steps", thrown.steps);
	}
}

/** The plan itself, on its scratch layer: the stopping rule, the bound, and judging. */
function planOn(s: Scratch, view: EntityView, d: CompiledDeclaration, items: readonly unknown[], context: unknown, conditionsBefore: ConditionsBefore, no: (code: GraphRefusalCode, subject: string, opIndex?: number) => GraphPlan): GraphPlan {
	// 1. each requested item, after its kind's resolver, applied; a fault refused at the first item that faults (the corpus's R22)
	const itemFault = (fault: ItemFault, i: number): GraphPlan =>
		fault.code === "invalid-edit" || fault.code === "not-plain" ? no(fault.code, fault.subject, i) : withFacts(refuse(fault.code, fault.subject, i), fault.ruleKey ?? fault.code, 1);
	for (const [i, item] of items.entries()) {
		const kind = isObject(item) && typeof item["kind"] === "string" ? item["kind"] : undefined;
		const resolver = kind === undefined ? undefined : d.resolvers.get(kind);
		if (resolver === undefined) {
			const fault = applyItem(s, d, item, `items[${i}]`, i, null);
			if (fault !== null) return itemFault(fault, i);
			continue;
		}
		// the resolver sees the edit as the items before it left it, and its writes stand in the item's place, carrying its index
		// (the corpus's R35; D27)
		const writes = resolveItem(s, d, resolver, item, context);
		const named = isObject(item) && typeof item["id"] === "string" && item["id"] !== "" ? item["id"] : `items[${i}]`;
		if (writes === null) return withFacts(refuse("resolver-failed", named, i), `${kind}.intentResolver`, 1);
		for (const [j, write] of writes.entries()) {
			const fault = applyItem(s, d, write, `items[${i}].writes[${j}]`, i, null);
			if (fault === null) continue;
			if (RESOLVER_FAULTS.has(fault.code)) return withFacts(refuse(fault.code, fault.subject, i), `${kind}.intentResolver`, 1);
			return itemFault(fault, i);
		}
	}
	// the rules expanded to a fixed point; 2. each phase once, in declared order, the rules expanded after each; 3. none again.
	// Only the last expansion may stop at the bound: before it, a later phase's consequence may still write back what a rule
	// wrote, so the earlier expansions run to their fixed point and the net writes are judged once the phases are done (D25)
	const bound = (measure: number): GraphPlan => withFacts(refuse("too-many-writes", `bound ${PLAN_LIMITS.maxNetWrites}`), "net-writes", measure);
	const expander = new RuleExpander(s, d);
	const stopAt = (last: boolean) => (last ? PLAN_LIMITS.maxNetWrites : Number.POSITIVE_INFINITY);
	if (!expander.run(stopAt(d.phases.length === 0))) return bound(s.certainWrites());
	for (const [p, phase] of d.phases.entries()) {
		const fault = runPhase(s, d, phase, context);
		if (fault !== null) return withDetails(refuse(fault.code, fault.subject, fault.opIndex), { ruleKey: fault.ruleKey, measure: fault.measure, ...(fault.writers ? { writers: fault.writers } : {}) });
		if (!expander.run(stopAt(p === d.phases.length - 1))) return bound(s.certainWrites());
	}
	// the bound is judged before the rules' breaches, since an expansion stopped at it is not judged (D19)
	const writes = s.netWrites();
	if (writes.length > PLAN_LIMITS.maxNetWrites) return bound(writes.length);
	let before: ReadonlyMap<string, ConditionReading> = new Map();
	let after: ReadonlyMap<string, ConditionReading> = new Map();
	if (d.conditions.length > 0) {
		const was = conditionsBefore(context);
		if (!was.ok) return withFacts(refuse(was.fault.code, was.fault.subject, was.fault.opIndex), was.fault.ruleKey, 1);
		const now = readConditions(d, s, context);
		if (!now.ok) return withFacts(refuse(now.fault.code, now.fault.subject, now.fault.opIndex), now.fault.ruleKey, 1);
		before = was.breaches;
		after = now.breaches;
	}
	const verdict = judge(s, d, before, after);
	if (verdict !== null) return withDetails(refuse(verdict.code, verdict.subject, verdict.opIndex), { ruleKey: verdict.ruleKey, measure: verdict.measure, sentence: verdict.sentence, ...(verdict.writers ? { writers: verdict.writers } : {}) });
	return { ok: true, position: view.position(), steps: [...s.steps], inverse: s.inverse(), writes };
}
