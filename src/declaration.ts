/**
 * The declaration as M1 reads it (CONTRACT.md `graph-declaration`, *Reference rules*; docs/DECISIONS.md D10, D11): a list of
 * kinds, each with the list of references its records hold, each naming its field, the declared kinds it may target, how many
 * targets it holds and what becomes of the referrer when a target is deleted, with the other rule options as the contract
 * allows them; their effects are planning's (M2). A bad declaration is refused at creation, its subject naming the kind, the
 * field and the member at fault. The members later milestones read -- a kind's shape, conditions, consequences and intent
 * resolver, and the phases -- are accepted and not yet read.
 */
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

/** Checks the declaration and compiles what M1 reads, or refuses it, its subject naming the kind, field and member at fault. */
export function compileDeclaration(input: unknown): { ok: true; declaration: CompiledDeclaration } | { ok: false; refusal: GraphRefusal } {
	const bad = (subject: string) => ({ ok: false as const, refusal: refuse("invalid-declaration", subject) });
	if (!isRecord(input)) return bad("declaration");
	const kinds = input["kinds"];
	if (!Array.isArray(kinds) || kinds.length === 0) return bad("kinds");
	// every kind's name first, so a reference may target a kind declared after it
	const names: string[] = [];
	for (const [i, declared] of kinds.entries()) {
		if (!isRecord(declared) || !isName(declared["kind"])) return bad(`kinds[${i}]`);
		if (names.includes(declared["kind"])) return bad(declared["kind"]);
		names.push(declared["kind"]);
	}
	const compiled = new Map<string, CompiledReference[]>();
	const fields = new Set<string>();
	for (const declared of kinds as Record<string, unknown>[]) {
		const kind = declared["kind"] as string;
		const unknown = firstUnknown(declared, KIND);
		if (unknown !== undefined) return bad(`${kind}.${unknown}`);
		const references = declared["references"] ?? [];
		if (!Array.isArray(references)) return bad(`${kind}.references`);
		const list: CompiledReference[] = [];
		for (const [j, ref] of references.entries()) {
			if (!isRecord(ref) || !isName(ref["field"])) return bad(`${kind}.references[${j}]`);
			const field = ref["field"];
			const at = `${kind}.${field}`;
			if (list.some((r) => r.field === field)) return bad(at);
			// an option the contract does not name first, so a misspelt one is named rather than reported missing
			const stray = firstUnknown(ref, REFERENCE);
			if (stray !== undefined) return bad(`${at}.${stray}`);
			const targets = ref["targets"];
			if (!Array.isArray(targets) || targets.length === 0 || !targets.every(isName) || new Set(targets).size !== targets.length) return bad(`${at}.targets`);
			const undeclared = targets.find((t) => !names.includes(t));
			if (undeclared !== undefined) return bad(`${at}.targets: ${undeclared}`);
			const holds = ref["holds"];
			if (holds !== "one" && holds !== "many") return bad(`${at}.holds`);
			if (ref["onTargetDelete"] === undefined) return bad(`${at}.onTargetDelete`);
			for (const [option, values] of Object.entries(OPTIONS)) {
				const value = ref[option];
				if (value !== undefined && !values.includes(value as string)) return bad(`${at}.${option}`);
			}
			const min = ref["min"];
			if (min !== undefined && (typeof min !== "number" || !Number.isInteger(min) || min < 0 || (holds === "one" && min > 1))) return bad(`${at}.min`);
			if (min !== undefined && ref["onBelowMin"] === undefined) return bad(`${at}.min`);
			if (min === undefined && ref["onBelowMin"] !== undefined) return bad(`${at}.onBelowMin`);
			list.push(Object.freeze({ field, targets: Object.freeze([...targets]), holds }));
			fields.add(field);
		}
		compiled.set(kind, list);
	}
	const stray = firstUnknown(input, TOP);
	if (stray !== undefined) return bad(stray);
	return { ok: true, declaration: { kinds: compiled, fields } };
}
