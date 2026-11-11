/**
 * The dated view (CONTRACT.md `dated-graph-view`; the build plan's `view` module): the entities by identity and kind, as they
 * stand at one store position, and the reference index kept with them. A change is taken in whole or not at all: every item
 * is checked against the view as the items before it leave it, and only then is any applied, the position moving to the
 * change's. Records are read as plain JSON through shape-check and kept frozen, so no answer can change what is held.
 */
import { readPlainJson } from "@apnex/shape-check";
import type { CompiledDeclaration, CompiledReference } from "./declaration.js";
import { ReferenceIndex } from "./references.js";
import { type GraphRefusal, refuse } from "./refusal.js";

/** The bounds of a change (docs/DECISIONS.md D10): at most as many items as the store beneath lands in one change. An opening is no change, and is not bound by it (D12). */
export const GRAPH_LIMITS = Object.freeze({ maxChangeItems: 2000 });

/** A record: an entity's fields, plain JSON. */
export type GraphRecord = { readonly [field: string]: unknown };

/** An entity as the view holds it: its kind, its identity, and its record. */
export interface GraphEntity {
	readonly kind: string;
	readonly id: string;
	readonly record: GraphRecord;
}

/** One item of a change: an entity's whole state after the change, or its deletion. */
export type GraphChangeItem = { kind: string; id: string; record: unknown } | { kind: string; id: string; deleted: true };

/** A change taken in: its store position, and the items that landed together at it. */
export interface GraphChange {
	position: number;
	items: readonly GraphChangeItem[];
}

interface Checked {
	readonly kind: string;
	readonly id: string;
	readonly record: GraphRecord | null;
	readonly fields: ReadonlyMap<string, readonly string[]>;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isPosition = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function deepFreeze<T>(value: T): T {
	if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
		for (const member of Object.values(value)) deepFreeze(member);
		Object.freeze(value);
	}
	return value;
}

/**
 * The targets a reference field holds in a record, or undefined when the field holds a form its declaration does not allow.
 * Read from the record's own members alone, so a field named as a member every object inherits -- `constructor`,
 * `__proto__` -- is absent from a record that does not hold it.
 */
function heldBy(record: GraphRecord, ref: CompiledReference): readonly string[] | undefined {
	const value = Object.hasOwn(record, ref.field) ? record[ref.field] : undefined;
	if (value === undefined || value === null) return [];
	if (ref.holds === "one") return typeof value === "string" && value !== "" ? [value] : undefined;
	if (!Array.isArray(value) || new Set(value).size !== value.length) return undefined;
	return value.every((t): t is string => typeof t === "string" && t !== "") ? value : undefined;
}

export class EntityView {
	private current: number;
	private readonly entities = new Map<string, GraphEntity>();
	private readonly byKind = new Map<string, Set<string>>();
	readonly index = new ReferenceIndex();

	constructor(private readonly declaration: CompiledDeclaration, position: number) {
		this.current = position;
		for (const kind of declaration.kinds.keys()) this.byKind.set(kind, new Set());
	}

	position(): number {
		return this.current;
	}

	get(id: string): GraphEntity | undefined {
		return this.entities.get(id);
	}

	/** The entities of a kind, in identity order. */
	all(kind: string): GraphEntity[] {
		const ids = [...(this.byKind.get(kind) ?? [])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
		return ids.map((id) => this.entities.get(id)).filter((e): e is GraphEntity => e !== undefined);
	}

	/**
	 * Takes in a change after the view's position, whole, or refuses it and changes nothing. The change is read once, as plain
	 * JSON, before any of it is used, so a getter or a Proxy is refused rather than run, and a value read twice cannot differ.
	 */
	take(input: unknown): { ok: true; position: number } | { ok: false; refusal: GraphRefusal } {
		const read = readPlainJson(input);
		if (!read.ok || !isObject(read.value)) return { ok: false, refusal: refuse("invalid-change", "change") };
		const change = read.value;
		if (!isPosition(change["position"])) return { ok: false, refusal: refuse("invalid-change", "position") };
		const position = change["position"];
		if (position <= this.current) return { ok: false, refusal: refuse("stale-position", String(position)) };
		const items = change["items"];
		if (!Array.isArray(items)) return { ok: false, refusal: refuse("invalid-change", "items") };
		if (items.length === 0) return { ok: false, refusal: refuse("empty-change", "items") };
		if (items.length > GRAPH_LIMITS.maxChangeItems) return { ok: false, refusal: refuse("too-many-items", String(items.length)) };
		return this.land(position, items, false);
	}

	/**
	 * Fills an empty view from entities stated with its position, already read as plain JSON: the first fill (docs/DECISIONS.md
	 * D12). An opening is no change, so no bound on a change's items applies to it.
	 */
	fill(entities: readonly unknown[]): { ok: true; position: number } | { ok: false; refusal: GraphRefusal } {
		return this.land(this.current, entities, true);
	}

	private land(position: number, items: readonly unknown[], first: boolean): { ok: true; position: number } | { ok: false; refusal: GraphRefusal } {
		const checked: Checked[] = [];
		const seen = new Set<string>();
		for (const [i, item] of items.entries()) {
			const one = this.check(item, i, seen, first);
			if (!one.ok) return one;
			checked.push(one.checked);
			seen.add(one.checked.id);
		}
		for (const c of checked) {
			if (c.record === null) {
				this.entities.delete(c.id);
				this.byKind.get(c.kind)?.delete(c.id);
				this.index.remove(c.id);
			} else {
				this.entities.set(c.id, Object.freeze({ kind: c.kind, id: c.id, record: c.record }));
				this.byKind.get(c.kind)?.add(c.id);
				this.index.put(c.id, c.kind, c.fields);
			}
		}
		this.current = position;
		return { ok: true, position };
	}

	private check(item: unknown, i: number, seen: ReadonlySet<string>, first: boolean): { ok: true; checked: Checked } | { ok: false; refusal: GraphRefusal } {
		const fault = (code: Parameters<typeof refuse>[0], subject: string) => ({ ok: false as const, refusal: refuse(code, subject, i) });
		if (!isObject(item)) return fault("invalid-change", `items.${i}`);
		const { kind, id } = item;
		const deleting = item["deleted"] === true && !first;
		const members = Object.keys(item).filter((k) => k !== "kind" && k !== "id");
		if (typeof kind !== "string" || typeof id !== "string" || id === "" || members.length !== 1 || (members[0] !== "record" && !deleting)) return fault("invalid-change", `items.${i}`);
		const subject = `${kind}:${id}`;
		const refs = this.declaration.kinds.get(kind);
		if (refs === undefined) return fault("undeclared-kind", subject);
		if (seen.has(id)) return fault("duplicate-item", subject);
		const held = this.entities.get(id);
		if (deleting) {
			if (held === undefined || held.kind !== kind) return fault("not-found", subject);
			return { ok: true, checked: { kind, id, record: null, fields: new Map() } };
		}
		if (held !== undefined && held.kind !== kind) return fault("identity-taken", subject);
		// the change or the opening was read as plain JSON whole, so a record is plain data already: an object, or refused
		const record = item["record"];
		if (!isObject(record)) return fault("not-plain", subject);
		deepFreeze(record);
		const fields = new Map<string, readonly string[]>();
		for (const ref of refs) {
			const targets = heldBy(record, ref);
			if (targets === undefined) return fault("invalid-reference", `${subject}.${ref.field}`);
			if (targets.length > 0) fields.set(ref.field, targets);
		}
		return { ok: true, checked: { kind, id, record, fields } };
	}
}
