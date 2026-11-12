/**
 * The declaration (CONTRACT.md `graph-declaration`, *Reference rules*, *Consequences and the stopping rule*; docs/DECISIONS.md
 * D10, D11, D20, D21): a list of kinds, each with the list of references its records hold, each naming its field, the declared
 * kinds it may target, how many targets it holds and what becomes of the referrer when a target is deleted, with the other rule
 * options as the contract allows them; the shape of its records, prepared through shape-check; its consequences, each a
 * function with a trigger stated as data and one of the phases the declaration lists; and its conditions over the whole set.
 * A bad declaration is refused at creation, its subject naming the kind, the member and the part at fault. The index from each
 * kind to the consequences of each phase listening to it is built here, once. An intent resolver is accepted and not yet read
 * (M4).
 */
import { type PreparedShape, prepareShapeDocument, readPlainJson } from "@apnex/shape-check";
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

/** What a trigger hears: an entity of named kinds created, or deleted, or named fields of a kind changed (D20). */
export interface TriggerClause {
	created?: readonly string[];
	deleted?: readonly string[];
	changed?: { kind: string; fields: readonly string[] };
}

/** One change a consequence heard: the entity as the edit found it and as it stands, and the top-level fields that differ. */
export interface GraphChangeHeard {
	readonly kind: string;
	readonly id: string;
	readonly before: { readonly [field: string]: unknown } | null;
	readonly after: { readonly [field: string]: unknown } | null;
	readonly fields: readonly string[];
}

/** What a consequence or a condition may read while it is called: the entities as they stand, frozen (D22). */
export interface GraphReader {
	get(kind: string, id: string): { readonly kind: string; readonly id: string; readonly record: { readonly [field: string]: unknown } } | null;
	all(kind: string): readonly { readonly kind: string; readonly id: string; readonly record: { readonly [field: string]: unknown } }[];
	referrersOf(id: string): readonly { readonly kind: string; readonly id: string; readonly field: string }[];
	targetsOf(id: string): readonly { readonly field: string; readonly id: string }[];
}

/** An application consequence: a pure function returning writes, called in its phase when its trigger hears a change (D20). */
export interface ConsequenceDeclaration {
	id: string;
	phase: string;
	trigger: TriggerClause | readonly TriggerClause[];
	run: (input: { readonly matches: readonly GraphChangeHeard[]; readonly graph: GraphReader }) => unknown;
}

/** One breach a condition reports: the entity or thing concerned, how much, and the application's own sentence (D21). */
export interface ConditionBreach {
	subject: string;
	measure: number;
	sentence: string;
}

/** A condition over the whole set that a shape cannot state (D21). */
export interface ConditionDeclaration {
	id: string;
	check: (graph: GraphReader) => unknown;
}

/** One kind: its records' shape, the references they hold, its consequences and conditions, and its intent resolver (M4). */
export interface KindDeclaration {
	kind: string;
	references?: readonly ReferenceDeclaration[];
	shape?: unknown;
	conditions?: readonly ConditionDeclaration[];
	consequences?: readonly ConsequenceDeclaration[];
	intentResolver?: unknown;
}

/** The application's declaration: its kinds, and the phases its consequences run in, in order. */
export interface GraphDeclaration {
	kinds: readonly KindDeclaration[];
	phases?: readonly string[];
}

/** A consequence as the planner calls it: its key `<kind>.<id>`, its phase, the place it was declared, its trigger and its function. */
export interface CompiledConsequence {
	readonly key: string;
	readonly phase: string;
	readonly order: number;
	readonly clauses: readonly TriggerClause[];
	/** The trigger as text, so consequences with one trigger can share what it hears. */
	readonly signature: string;
	readonly kinds: readonly string[];
	readonly run: ConsequenceDeclaration["run"];
}

/** A condition as the planner calls it: its key `<kind>.<id>` and its function. */
export interface CompiledCondition {
	readonly key: string;
	readonly check: ConditionDeclaration["check"];
}

/** One reference field as the view, the index and the rules read it: its options, `onUnreferenced` given its default. */
export interface CompiledReference {
	readonly field: string;
	readonly targets: readonly string[];
	readonly holds: ReferenceHolding;
	readonly onTargetDelete: "refuse" | "cascade-delete" | "unlink";
	readonly exclusivity: "refuse" | "steal" | null;
	readonly min: number | null;
	readonly onBelowMin: "refuse" | "cascade-delete" | null;
	readonly onUnreferenced: "keep" | "delete";
}

/**
 * The declaration checked: each kind's reference fields, in declaration order, and every reference field name; each shaped
 * kind's prepared shape; the phases in order; every consequence and condition in declared order, kind by kind; and, per phase,
 * the consequences listening to each kind, in declared order -- the dispatch index, built once.
 */
export interface CompiledDeclaration {
	readonly kinds: ReadonlyMap<string, readonly CompiledReference[]>;
	readonly fields: ReadonlySet<string>;
	readonly shapes: ReadonlyMap<string, PreparedShape & { accepted: true }>;
	readonly phases: readonly string[];
	readonly consequences: readonly CompiledConsequence[];
	readonly listening: ReadonlyMap<string, ReadonlyMap<string, readonly CompiledConsequence[]>>;
	readonly conditions: readonly CompiledCondition[];
}

const TOP = new Set(["kinds", "phases"]);
const CONSEQUENCE = new Set(["id", "phase", "trigger", "run"]);
const CONDITION = new Set(["id", "check"]);
const CLAUSE = new Set(["created", "deleted", "changed"]);
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
	// the phases, so a consequence names one of them
	const phases: string[] = [];
	if (top["phases"] !== undefined) {
		const listed = itemsOf(top["phases"]);
		if (listed === null || !listed.every(isName)) return bad("phases", "invalid");
		if (listed.length === 0) return bad("phases", "empty");
		for (const phase of listed as string[]) {
			if (phases.includes(phase)) return bad(`phases.${phase}`, "duplicate");
			phases.push(phase);
		}
	}
	const compiled = new Map<string, CompiledReference[]>();
	const fields = new Set<string>();
	const shapes = new Map<string, PreparedShape & { accepted: true }>();
	const consequences: CompiledConsequence[] = [];
	const conditions: CompiledCondition[] = [];
	for (const declared of entries) {
		const kind = declared["kind"] as string;
		const unknown = firstUnknown(declared, KIND);
		if (unknown !== undefined) return bad(`${kind}.${unknown}`, "unknown");
		// the references read once, each as plain JSON, so the first that is not plain data is named by its index
		const listed = declared["references"] === undefined ? [] : itemsOf(declared["references"]);
		if (listed === null) return bad(`${kind}.references`, "invalid");
		const references: unknown[] = [];
		for (const [j, entry] of listed.entries()) {
			const read = readPlainJson(entry);
			if (!read.ok) return bad(`${kind}.references[${j}]`, "invalid");
			references.push(read.value);
		}
		const list: CompiledReference[] = [];
		for (const [j, ref] of references.entries()) {
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
			list.push(Object.freeze({
				field, targets: Object.freeze([...targets]), holds,
				onTargetDelete: ref["onTargetDelete"] as CompiledReference["onTargetDelete"],
				exclusivity: (ref["exclusivity"] ?? null) as CompiledReference["exclusivity"],
				min: (min ?? null) as number | null,
				onBelowMin: (ref["onBelowMin"] ?? null) as CompiledReference["onBelowMin"],
				onUnreferenced: (ref["onUnreferenced"] ?? "keep") as CompiledReference["onUnreferenced"],
			}));
			fields.add(field);
		}
		compiled.set(kind, list);
		if (declared["shape"] !== undefined) {
			const read = readPlainJson(declared["shape"]);
			if (!read.ok) return bad(`${kind}.shape`, "invalid");
			const prepared = prepareShapeDocument(read.value);
			if (!prepared.accepted) return bad(`${kind}.shape${prepared.problems[0]?.pointer ?? ""}`, "invalid");
			shapes.set(kind, prepared);
		}
		const own = compileConsequences(kind, declared["consequences"], names, phases, consequences.length);
		if (!own.ok) return bad(own.path, own.fault);
		consequences.push(...own.list);
		const checks = compileConditions(kind, declared["conditions"]);
		if (!checks.ok) return bad(checks.path, checks.fault);
		conditions.push(...checks.list);
	}
	const stray = firstUnknown(top, TOP);
	if (stray !== undefined) return bad(stray, "unknown");
	// the dispatch index: per phase, which consequences listen to each kind, in declared order
	const listening = new Map<string, Map<string, CompiledConsequence[]>>(phases.map((p) => [p, new Map()]));
	for (const c of consequences) {
		const index = listening.get(c.phase)!;
		for (const k of c.kinds) {
			if (!index.has(k)) index.set(k, []);
			index.get(k)!.push(c);
		}
	}
	return { ok: true, declaration: { kinds: compiled, fields, shapes, phases, consequences, listening, conditions } };
}

type Compiled<T> = { ok: true; list: T[] } | { ok: false; path: string; fault: string };

/** A trigger read as plain data: one clause or a list of them, each naming declared kinds or a declared kind's fields; or the fault. */
function compileTrigger(value: unknown, names: readonly string[]): { ok: true; clauses: TriggerClause[] } | { ok: false; fault: string } {
	if (value === undefined) return { ok: false, fault: "missing" };
	const read = readPlainJson(value);
	if (!read.ok) return { ok: false, fault: "invalid" };
	const given = Array.isArray(read.value) ? read.value : [read.value];
	if (given.length === 0) return { ok: false, fault: "invalid" };
	const kindList = (list: unknown): list is string[] => Array.isArray(list) && list.length > 0 && list.every(isName) && new Set(list).size === list.length;
	const clauses: TriggerClause[] = [];
	for (const clause of given) {
		if (!isRecord(clause) || Object.keys(clause).length === 0 || firstUnknown(clause, CLAUSE) !== undefined) return { ok: false, fault: "invalid" };
		const { created, deleted, changed } = clause;
		if (created !== undefined && !kindList(created)) return { ok: false, fault: "invalid" };
		if (deleted !== undefined && !kindList(deleted)) return { ok: false, fault: "invalid" };
		if (changed !== undefined) {
			if (!isRecord(changed) || firstUnknown(changed, new Set(["kind", "fields"])) !== undefined || !isName(changed["kind"]) || !kindList(changed["fields"])) return { ok: false, fault: "invalid" };
		}
		const named = [...(created ?? []), ...(deleted ?? []), ...(changed ? [changed["kind"] as string] : [])] as string[];
		const undeclared = named.find((k) => !names.includes(k));
		if (undeclared !== undefined) return { ok: false, fault: `undeclared ${undeclared}` };
		clauses.push(Object.freeze({
			...(created ? { created: Object.freeze([...created]) } : {}),
			...(deleted ? { deleted: Object.freeze([...deleted]) } : {}),
			...(changed ? { changed: Object.freeze({ kind: changed["kind"] as string, fields: Object.freeze([...(changed["fields"] as string[])]) }) } : {}),
		}));
	}
	return { ok: true, clauses };
}

/** A kind's consequences, each read once as plain data, its function kept and never called here; or the fault, named by its part. */
function compileConsequences(kind: string, value: unknown, names: readonly string[], phases: readonly string[], declaredBefore: number): Compiled<CompiledConsequence> {
	const list: CompiledConsequence[] = [];
	if (value === undefined) return { ok: true, list };
	const listed = itemsOf(value);
	if (listed === null) return { ok: false, path: `${kind}.consequences`, fault: "invalid" };
	for (const [j, item] of listed.entries()) {
		const declared = membersOf(item);
		if (declared === null || !isName(declared["id"])) return { ok: false, path: `${kind}.consequences[${j}]`, fault: "invalid" };
		const at = `${kind}.consequences.${declared["id"]}`;
		const key = `${kind}.${declared["id"]}`;
		if (list.some((c) => c.key === key)) return { ok: false, path: at, fault: "duplicate" };
		const stray = firstUnknown(declared, CONSEQUENCE);
		if (stray !== undefined) return { ok: false, path: `${at}.${stray}`, fault: "unknown" };
		const phase = declared["phase"];
		if (phase === undefined) return { ok: false, path: `${at}.phase`, fault: "missing" };
		if (!isName(phase)) return { ok: false, path: `${at}.phase`, fault: "invalid" };
		if (!phases.includes(phase)) return { ok: false, path: `${at}.phase`, fault: `undeclared ${phase}` };
		const trigger = compileTrigger(declared["trigger"], names);
		if (!trigger.ok) return { ok: false, path: `${at}.trigger`, fault: trigger.fault };
		const run = declared["run"];
		if (run === undefined) return { ok: false, path: `${at}.run`, fault: "missing" };
		if (typeof run !== "function") return { ok: false, path: `${at}.run`, fault: "invalid" };
		const kinds = [...new Set(trigger.clauses.flatMap((c) => [...(c.created ?? []), ...(c.deleted ?? []), ...(c.changed ? [c.changed.kind] : [])]))];
		list.push(Object.freeze({ key, phase, order: declaredBefore + list.length, clauses: Object.freeze(trigger.clauses), signature: JSON.stringify(trigger.clauses), kinds: Object.freeze(kinds), run: run as ConsequenceDeclaration["run"] }));
	}
	return { ok: true, list };
}

/** A kind's conditions, each read once as plain data, its function kept and never called here; or the fault, named by its part. */
function compileConditions(kind: string, value: unknown): Compiled<CompiledCondition> {
	const list: CompiledCondition[] = [];
	if (value === undefined) return { ok: true, list };
	const listed = itemsOf(value);
	if (listed === null) return { ok: false, path: `${kind}.conditions`, fault: "invalid" };
	for (const [j, item] of listed.entries()) {
		const declared = membersOf(item);
		if (declared === null || !isName(declared["id"])) return { ok: false, path: `${kind}.conditions[${j}]`, fault: "invalid" };
		const at = `${kind}.conditions.${declared["id"]}`;
		const key = `${kind}.${declared["id"]}`;
		if (list.some((c) => c.key === key)) return { ok: false, path: at, fault: "duplicate" };
		const stray = firstUnknown(declared, CONDITION);
		if (stray !== undefined) return { ok: false, path: `${at}.${stray}`, fault: "unknown" };
		const check = declared["check"];
		if (check === undefined) return { ok: false, path: `${at}.check`, fault: "missing" };
		if (typeof check !== "function") return { ok: false, path: `${at}.check`, fault: "invalid" };
		list.push(Object.freeze({ key, check: check as ConditionDeclaration["check"] }));
	}
	return { ok: true, list };
}
