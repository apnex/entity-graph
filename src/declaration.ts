/**
 * The declaration as M1 reads it (CONTRACT.md `graph-declaration`, *Reference rules*; docs/DECISIONS.md D10): the kinds, and
 * for each kind the references it holds, each naming the declared kinds it may target, how many targets it holds, and the
 * rule options, whose values are checked here and whose effects are planning's (M2). A bad declaration is refused at
 * creation, naming the member that is wrong. The members later milestones read -- a kind's shape, conditions, consequences
 * and intent resolver, and the phases -- are accepted and not yet read.
 */
import { type GraphRefusal, refuse } from "./refusal.js";

/** How many targets a reference holds. */
export type ReferenceHolding = "one" | "many";

/** One reference a kind holds, in a field of its record. */
export interface ReferenceDeclaration {
	targets: readonly string[];
	holds: ReferenceHolding;
	onTargetDelete?: "refuse" | "cascade-delete" | "unlink";
	exclusivity?: "refuse" | "steal";
	min?: number;
	onBelowMin?: "refuse" | "cascade-delete";
	onUnreferenced?: "keep" | "delete";
}

/** One kind: the references its records hold, and the members later milestones read. */
export interface KindDeclaration {
	references?: Readonly<Record<string, ReferenceDeclaration>>;
	shape?: unknown;
	conditions?: unknown;
	consequences?: unknown;
	intentResolver?: unknown;
}

/** The application's declaration. */
export interface GraphDeclaration {
	kinds: Readonly<Record<string, KindDeclaration>>;
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
const KIND = new Set(["references", "shape", "conditions", "consequences", "intentResolver"]);
const REFERENCE = new Set(["targets", "holds", "onTargetDelete", "exclusivity", "min", "onBelowMin", "onUnreferenced"]);
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

const firstUnknown = (value: Record<string, unknown>, known: ReadonlySet<string>): string | undefined => Object.keys(value).find((k) => !known.has(k));

/** Checks the declaration and compiles what M1 reads, or refuses it naming the member that is wrong. */
export function compileDeclaration(input: unknown): { ok: true; declaration: CompiledDeclaration } | { ok: false; refusal: GraphRefusal } {
	const bad = (subject: string) => ({ ok: false as const, refusal: refuse("invalid-declaration", subject) });
	if (!isRecord(input)) return bad("");
	const kinds = input["kinds"];
	if (!isRecord(kinds) || Object.keys(kinds).length === 0) return bad("kinds");
	const names = Object.keys(kinds);
	const compiled = new Map<string, CompiledReference[]>();
	const fields = new Set<string>();
	for (const kind of names) {
		const at = `kinds.${kind}`;
		const declared = kinds[kind];
		if (kind === "" || !isRecord(declared)) return bad(at);
		const unknown = firstUnknown(declared, KIND);
		if (unknown !== undefined) return bad(`${at}.${unknown}`);
		const references = declared["references"] ?? {};
		if (!isRecord(references)) return bad(`${at}.references`);
		const list: CompiledReference[] = [];
		for (const field of Object.keys(references)) {
			const where = `${at}.references.${field}`;
			const ref = references[field];
			if (field === "" || !isRecord(ref)) return bad(where);
			const targets = ref["targets"];
			if (!Array.isArray(targets) || targets.length === 0 || new Set(targets).size !== targets.length
				|| !targets.every((t): t is string => typeof t === "string" && names.includes(t))) return bad(`${where}.targets`);
			const holds = ref["holds"];
			if (holds !== "one" && holds !== "many") return bad(`${where}.holds`);
			for (const [option, values] of Object.entries(OPTIONS)) {
				const value = ref[option];
				if (value !== undefined && !values.includes(value as string)) return bad(`${where}.${option}`);
			}
			const min = ref["min"];
			if (min !== undefined && (typeof min !== "number" || !Number.isInteger(min) || min < 0 || (holds === "one" && min > 1))) return bad(`${where}.min`);
			const stray = firstUnknown(ref, REFERENCE);
			if (stray !== undefined) return bad(`${where}.${stray}`);
			list.push(Object.freeze({ field, targets: Object.freeze([...targets]), holds }));
			fields.add(field);
		}
		compiled.set(kind, list);
	}
	const stray = firstUnknown(input, TOP);
	if (stray !== undefined) return bad(stray);
	return { ok: true, declaration: { kinds: compiled, fields } };
}
