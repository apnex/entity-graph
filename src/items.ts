/**
 * One item applied to the scratch layer (CONTRACT.md *Judging and refusals*, *Consequence writes held to request rules*;
 * docs/DECISIONS.md D18, D19, D23, D24): a requested item, or a write a consequence returned, checked against the edit as the
 * writes before it left it and applied, or the fault that stops it -- the same checks for both, so a consequence's write meets
 * every rule a requested write meets at the point it is made, but for its shape, which the result judges.
 */
import type { CompiledDeclaration } from "./declaration.js";
import type { GraphRefusalCode } from "./refusal.js";
import type { Scratch } from "./scratch.js";
import { type GraphRecord, heldBy, isObject } from "./view.js";

/** The members each operation carries beyond its operation, kind and identity. */
export const ITEM_MEMBERS: Readonly<Record<string, readonly string[]>> = { create: ["record"], change: ["record"], set: ["patch"], remove: [] };

/** Why an item cannot be applied: its code, what it names, and for a reference in the wrong form, its rule key. */
export interface ItemFault {
	readonly code: GraphRefusalCode;
	readonly subject: string;
	readonly ruleKey?: string;
}

/**
 * Applies one item, or answers its fault; `at` names it where it has no identity (`items[2]`, `writes[0]`), `cause` the requested
 * item it follows from, and `by` the consequence that returned it, or null for a requested item.
 */
export function applyItem(s: Scratch, d: CompiledDeclaration, item: unknown, at: string, cause: number, by: string | null): ItemFault | null {
	if (!isObject(item)) return { code: "invalid-edit", subject: at };
	const { op, kind, id } = item;
	// a fault in an item names its identity as its subject (the corpus's R22; D18)
	const named = typeof id === "string" && id !== "" ? id : at;
	if (typeof op !== "string" || !Object.hasOwn(ITEM_MEMBERS, op)) return { code: "unknown-operation", subject: named };
	const members = Object.keys(item).filter((k) => k !== "op" && k !== "kind" && k !== "id");
	if (typeof kind !== "string" || typeof id !== "string" || id === "" || members.join() !== ITEM_MEMBERS[op]!.join()) return { code: "invalid-edit", subject: at };
	const refs = d.kinds.get(kind);
	if (refs === undefined) return { code: "undeclared-kind", subject: id };
	const held = s.get(id);
	if (op === "create") {
		if (held !== undefined) return { code: held.kind === kind ? "entity-present" : "identity-taken", subject: id };
		// an identity the edit found held by another kind stays that kind's within the edit, so no net write names it twice (D19)
		if (s.before(id) !== undefined && s.before(id)!.kind !== kind) return { code: "identity-taken", subject: id };
	} else if (held === undefined || held.kind !== kind) return { code: "entity-absent", subject: id };
	if (op === "remove") {
		s.write({ op: "del", kind, id }, cause, by, true);
		return null;
	}
	const given = op === "set" ? item["patch"] : item["record"];
	if (!isObject(given)) return { code: "not-plain", subject: id };
	const record: GraphRecord = op === "set" ? { ...held!.record, ...given } : given;
	for (const ref of refs) if (heldBy(record, ref) === undefined) return { code: "invalid-reference", subject: id, ruleKey: `${kind}.${ref.field}.holds` };
	// a requested write's record is judged against its kind's shape at its item, whether or not the entity fit before (the
	// corpus's R31; D24); a consequence's is judged on the result, as every entity a consequence or a rule wrote is
	if (by === null && d.shapes.get(kind)?.judge(record as never).verdict === "misfit") return { code: "shape-misfit", subject: id, ruleKey: `${kind}.shape` };
	s.write({ op: "put", kind, id, record }, cause, by, true);
	return null;
}
