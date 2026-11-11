/**
 * The declaration as M1 reads it (CONTRACT.md `graph-declaration`, *Reference rules*; docs/DECISIONS.md D10, D11): a list of
 * kinds, each with the list of references its records hold, each naming its field, the declared kinds it may target, how many
 * targets it holds and what becomes of the referrer when a target is deleted, with the other rule options as the contract
 * allows them; their effects are planning's (M2). A bad declaration is refused at creation, its subject naming the kind, the
 * field and the member at fault. The members later milestones read -- a kind's shape, conditions, consequences and intent
 * resolver, and the phases -- are accepted and not yet read.
 */
import { readPlainJson } from "@apnex/shape-check";
import { itemsOf, membersOf } from "./plain-members.js";
import { type GraphRefusal, refuse } from "./refusal.js";

/** How many targets a reference holds. */
export type ReferenceHolding = "one" | "many";

/** One reference a kind's records hold, in the field it names. */
export interface ReferenceDeclaration {
	field: string;
	targets: readonly string[];
	holds: ReferenceHolding;
	onTargetDelete: "refuse" | "cascade-delete" | "unlink";
	exclusivity?: "refuse" | "steal";
	min?: number;
	onBelowMin?: "refuse" | "cascade-delete";
	onUnreferenced?: "keep" | "delete";
}

/** One kind: the references its records hold, and the members later milestones read. */
export interface KindDeclaration {
	kind: string;
	references?: readonly ReferenceDeclaration[];
	shape?: unknown;
	conditions?: unknown;
	consequences?: unknown;
	intentResolver?: unknown;
}

/** The application's declaration. */
export interface GraphDeclaration {
	kinds: readonly KindDeclaration[];
	phases?: unknown;
}

/** One reference field as the view and the index read it. */
export interface CompiledReference {
	readonly field: string;
	readonly targets: readonly string[];
	readonly holds: ReferenceHolding;
}

/** The declaration checked: each kind's reference fields, in declaration order, and every reference field name. */
export interface CompiledDeclaration {
	readonly kinds: ReadonlyMap<string, readonly CompiledReference[]>;
	readonly fields: ReadonlySet<string>;
}

const TOP = new Set(["kinds", "phases"]);
const KIND = new Set(["kind", "references", "shape", "conditions", "consequences", "intentResolver"]);
const REFERENCE = new Set(["field", "targets", "holds", "onTargetDelete", "exclusivity", "min", "onBelowMin", "onUnreferenced"]);
const OPTIONS: Readonly<Record<string, readonly string[]>> = {
	onTargetDelete: ["refuse", "cascade-delete", "unlink"],
	exclusivity: ["refuse", "steal"],
	onBelowMin: ["refuse", "cascade-delete"],
	onUnreferenced: ["keep", "delete"],
};

/** An object of named members, not an array, a function or a class's instance. */
const isRecord = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const proto: unknown = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};
const isName = (value: unknown): value is string => typeof value === "string" && value !== "";
const firstUnknown = (value: Record<string, unknown>, known: ReadonlySet<string>): string | undefined => Object.keys(value).find((k) => !known.has(k));

/**
 * Checks the declaration and compiles what M1 reads, or refuses it. Every object and list is read once as plain data, its
 * references as plain JSON, so nothing of the application's runs. A refusal's subject is `<path>: <fault>`, the path naming
 * the kind, the field and the member at fault, and the fault one of `missing`, `empty`, `invalid`, `duplicate`, `unknown`,
 * `unpaired`, or `undeclared <kind>`.
 */
export function compileDeclaration(input: unknown): { ok: true; declaration: CompiledDeclaration } | { ok: false; refusal: GraphRefusal } {
	const bad = (path: string, fault: string) => ({ ok: false as const, refusal: refuse("invalid-declaration", `${path}: ${fault}`) });
	const top = membersOf(input);
	if (top === null) return bad("declaration", "invalid");
	if (top["kinds"] === undefined) return bad("kinds", "missing");
	const kinds = itemsOf(top["kinds"]);
	if (kinds === null) return bad("kinds", "invalid");
	if (kinds.length === 0) return bad("kinds", "empty");
	// every kind's name first, so a reference may target a kind declared after it
	const entries: Record<string, unknown>[] = [];
	const names: string[] = [];
	for (const [i, item] of kinds.entries()) {
		const declared = membersOf(item);
		if (declared === null || !isName(declared["kind"])) return bad(`kinds[${i}]`, "invalid");
		if (names.includes(declared["kind"])) return bad(declared["kind"], "duplicate");
		names.push(declared["kind"]);
		entries.push(declared);
	}
	const compiled = new Map<string, CompiledReference[]>();
	const fields = new Set<string>();
	for (const declared of entries) {
		const kind = declared["kind"] as string;
		const unknown = firstUnknown(declared, KIND);
		if (unknown !== undefined) return bad(`${kind}.${unknown}`, "unknown");
		const read = declared["references"] === undefined ? { ok: true as const, value: [] } : readPlainJson(declared["references"]);
		if (!read.ok || !Array.isArray(read.value)) return bad(`${kind}.references`, "invalid");
		const list: CompiledReference[] = [];
		for (const [j, ref] of read.value.entries()) {
			if (!isRecord(ref) || !isName(ref["field"])) return bad(`${kind}.references[${j}]`, "invalid");
			const field = ref["field"];
			const at = `${kind}.${field}`;
			if (list.some((r) => r.field === field)) return bad(at, "duplicate");
			// an option the contract does not name first, so a misspelt one is named rather than reported missing
			const stray = firstUnknown(ref, REFERENCE);
			if (stray !== undefined) return bad(`${at}.${stray}`, "unknown");
			const targets = ref["targets"];
			if (targets === undefined) return bad(`${at}.targets`, "missing");
			if (!Array.isArray(targets) || !targets.every(isName) || new Set(targets).size !== targets.length) return bad(`${at}.targets`, "invalid");
			if (targets.length === 0) return bad(`${at}.targets`, "empty");
			const undeclared = targets.find((t) => !names.includes(t));
			if (undeclared !== undefined) return bad(`${at}.targets`, `undeclared ${undeclared}`);
			const holds = ref["holds"];
			if (holds === undefined) return bad(`${at}.holds`, "missing");
			if (holds !== "one" && holds !== "many") return bad(`${at}.holds`, "invalid");
			if (ref["onTargetDelete"] === undefined) return bad(`${at}.onTargetDelete`, "missing");
			for (const [option, values] of Object.entries(OPTIONS)) {
				const value = ref[option];
				if (value !== undefined && !values.includes(value as string)) return bad(`${at}.${option}`, "invalid");
			}
			const min = ref["min"];
			if (min !== undefined && (typeof min !== "number" || !Number.isInteger(min) || min < 0 || (holds === "one" && min > 1))) return bad(`${at}.min`, "invalid");
			if (min !== undefined && ref["onBelowMin"] === undefined) return bad(`${at}.min`, "unpaired");
			if (min === undefined && ref["onBelowMin"] !== undefined) return bad(`${at}.onBelowMin`, "unpaired");
			list.push(Object.freeze({ field, targets: Object.freeze([...targets]), holds }));
			fields.add(field);
		}
		compiled.set(kind, list);
	}
	const stray = firstUnknown(top, TOP);
	if (stray !== undefined) return bad(stray, "unknown");
	return { ok: true, declaration: { kinds: compiled, fields } };
}
