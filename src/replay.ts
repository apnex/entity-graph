/**
 * Planning an undo or a redo (CONTRACT.md *Undo and redo*; docs/DECISIONS.md D8, D33, D34, D37): the recorded reversal of each edit
 * undone, latest first, or the recorded writes of the edit redone, applied to a scratch layer over the view as the records hold
 * them - no resolver, no consequence and no rule worked out again, since the records already hold every write of the edits -
 * and the result judged as any edit is, by its shapes, the reference rules and the conditions, on the state it would leave.
 *
 * An entity an undo or a redo writes must stand as the record left it - as the edit left it, for an undo, or as it was before
 * the edit, for a redo - or the replay is refused, `history-superseded`, naming the entity, so a reversal is never applied to a
 * state it was not recorded against (D37).
 */
import type { CompiledDeclaration } from "./declaration.js";
import type { RecordedEntity, UndoRecord } from "./history.js";
import { samePlain } from "./plain-members.js";
import { readConditions } from "./phases.js";
import type { ConditionsBefore } from "./planner.js";
import { type ConditionReading, judge } from "./reference-rules.js";
import { type GraphRefusal, refuse } from "./refusal.js";
import { Scratch } from "./scratch.js";
import type { EntityView } from "./view.js";

/** A planned replay: its net writes and the entities its own record holds, or a refusal. */
export type Replay = { ok: true; writes: ReturnType<Scratch["netWrites"]>; entities: RecordedEntity[] } | { ok: false; refusal: GraphRefusal };

const facts = (r: GraphRefusal, details: Partial<GraphRefusal["details"]>): Replay => ({ ok: false, refusal: { ...r, details: { ...r.details, ...details } } });

/** Plans the replay of `records` in order: each record's `before` written where `undo`, its `after` where not. */
export function planReplay(view: EntityView, d: CompiledDeclaration, records: readonly UndoRecord[], undo: boolean, context: unknown, conditionsBefore: ConditionsBefore): Replay {
	const s = new Scratch(view, d);
	for (const record of records) {
		for (const [kind, id, before, after] of record.entities) {
			const expected = undo ? after : before;
			const target = undo ? before : after;
			const now = s.get(id);
			const stands = expected === null ? now === undefined : now !== undefined && now.kind === kind && samePlain(now.record, expected);
			if (!stands) return facts(refuse("history-superseded", id), { ruleKey: "history-superseded", measure: 1 });
			s.write(target === null ? { op: "del", kind, id } : { op: "put", kind, id, record: target }, -1, null, true);
		}
	}
	const writes = s.netWrites();
	let before: ReadonlyMap<string, ConditionReading> = new Map();
	let after: ReadonlyMap<string, ConditionReading> = new Map();
	if (d.conditions.length > 0) {
		const was = conditionsBefore(context);
		if (!was.ok) return facts(refuse(was.fault.code, was.fault.subject, -1), { ruleKey: was.fault.ruleKey });
		const now = readConditions(d, s, context);
		if (!now.ok) return facts(refuse(now.fault.code, now.fault.subject, -1), { ruleKey: now.fault.ruleKey });
		before = was.breaches;
		after = now.breaches;
	}
	const verdict = judge(s, d, before, after);
	if (verdict !== null) return facts(refuse(verdict.code, verdict.subject, -1), { ruleKey: verdict.ruleKey, measure: verdict.measure, sentence: verdict.sentence, ...(verdict.writers ? { writers: verdict.writers } : {}) });
	const entities: RecordedEntity[] = writes.map((w) => [w.kind, w.id, view.get(w.id)?.record ?? null, w.op === "put" ? w.record : null]);
	return { ok: true, writes, entities };
}
