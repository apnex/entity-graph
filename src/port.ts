/**
 * The store port (CONTRACT.md *The store port*; docs/DECISIONS.md D33): the structural port a graph lands its edits through,
 * shaped by entity-store's capabilities - a change of one or more writes landing whole or not at all, a guard naming the store
 * position the change expects, an optional note on a change, and every change after a held position, in order - and the bound
 * the store places on a note. M5 builds what undo and redo need; M6 adds the entity-store adapter, the first fill from the store
 * and following its changes, completing this shape rather than replacing it.
 *
 * `createMemoryGraphPort` is an in-memory port: it numbers its changes one after another from its starting position, whoever
 * writes them, refuses a change whose expected position is not its latest, keeps each change's note, and answers every change
 * after a position.
 */
import { nestingDepth, toCanonicalJson, utf8ByteLength } from "@apnex/shape-check";
import { readPlain } from "./plain-members.js";
import type { GraphChangeItem } from "./view.js";

/** One change a store holds: the position it landed at, its writes in order, and its note, if it carried one. */
export interface GraphStoreChange {
	readonly position: number;
	readonly writes: readonly GraphChangeItem[];
	readonly note?: unknown;
}

/** One entity a store holds, as a snapshot reads it. */
export interface GraphStoreEntity {
	readonly kind: string;
	readonly id: string;
	readonly record: unknown;
}

/** The structural store port (D33, D41). */
export interface GraphStorePort {
	/** The bound on a change's note, in bytes of its canonical UTF-8 JSON. */
	readonly noteBound: number;
	/** The bound on a change's note in levels of nesting, where the store has one (entity-store: 16). */
	readonly noteDepth?: number;
	/** The store's latest position. */
	position(): number;
	/** Lands a change whole, or refuses it: `store-moved` when its expected position is not the store's latest. */
	change(input: { writes: readonly GraphChangeItem[]; expectedPosition: number; note?: unknown }): { ok: true; position: number } | { ok: false; code: string; position: number };
	/**
	 * The changes after a position, in order, a page at a time as entity-store answers them: the store's latest position, the page's
	 * changes, and the position to ask from for the next page, or null where none remain; or, with `held: false` and no changes,
	 * that the store no longer holds that position.
	 */
	changes(since: number): { position: number; changes: readonly GraphStoreChange[]; next?: number | null; held?: boolean };
	/**
	 * Every entity of the named kinds the store holds at its latest position, with that position (D42): what a graph made with no
	 * opening fills its view from, and what fills it again where the store no longer holds the view's position. A port without it
	 * serves a graph given an opening, which refuses those two moves.
	 */
	snapshot?(kinds: readonly string[]): { position: number; entities: readonly GraphStoreEntity[] };
}

/** The note bound of the reference store, entity-store: 512 KiB of canonical UTF-8 JSON. */
export const NOTE_BOUND = 524_288;

/** The size a note takes against a store's bound: the bytes of its canonical UTF-8 JSON (as entity-store measures it). */
export const noteBytes = (note: unknown): number => utf8ByteLength(toCanonicalJson(note as never));

/** An in-memory port as `createMemoryGraphPort` makes it: a store port, and a way to forget the changes up to a position. */
export interface MemoryGraphPort extends GraphStorePort {
	/** Forgets every change at or before `through`, as a store passing its history bound does; the entities stay. */
	forget(through: number): void;
}

/**
 * Makes an in-memory port holding `entities` at `position`, its first change landing after it; its note bound `noteBound` bytes,
 * and `noteDepth` levels where given; its pages `pageSize` changes.
 */
export function createMemoryGraphPort(options: { position?: number; entities?: readonly GraphStoreEntity[]; noteBound?: number; noteDepth?: number; pageSize?: number } = {}): MemoryGraphPort {
	const start = options.position ?? 0;
	const bound = options.noteBound ?? NOTE_BOUND;
	const depth = options.noteDepth;
	const page = options.pageSize ?? 100;
	if (!Number.isSafeInteger(start) || start < 0) throw new RangeError("createMemoryGraphPort: position is a whole number from 0");
	if (!Number.isSafeInteger(bound) || bound < 1) throw new RangeError("createMemoryGraphPort: noteBound is a whole number of bytes from 1");
	if (depth !== undefined && (!Number.isSafeInteger(depth) || depth < 1)) throw new RangeError("createMemoryGraphPort: noteDepth is a whole number of levels from 1");
	if (!Number.isSafeInteger(page) || page < 1) throw new RangeError("createMemoryGraphPort: pageSize is a whole number of changes from 1");
	const read = readPlain(options.entities ?? []);
	if (!read.ok || !Array.isArray(read.value)) throw new TypeError("createMemoryGraphPort: entities is a list of plain { kind, id, record }");
	const entities = new Map<string, GraphStoreEntity>();
	for (const e of read.value as unknown as GraphStoreEntity[]) entities.set(e.id, e);
	const held: GraphStoreChange[] = [];
	let forgotten = start; // every change at or before this position is forgotten
	let latest = start;
	return Object.freeze({
		noteBound: bound,
		...(depth === undefined ? {} : { noteDepth: depth }),
		position: () => latest,
		change(input: { writes: readonly GraphChangeItem[]; expectedPosition: number; note?: unknown }) {
			const given = readPlain(input);
			if (!given.ok) return { ok: false as const, code: "change-not-plain", position: latest };
			const { writes, expectedPosition, note } = given.value as { writes?: unknown; expectedPosition?: unknown; note?: unknown };
			if (!Array.isArray(writes) || writes.length === 0) return { ok: false as const, code: "empty-change", position: latest };
			if (expectedPosition !== latest) return { ok: false as const, code: "store-moved", position: latest };
			if (note !== undefined && (noteBytes(note) > bound || (depth !== undefined && nestingDepth(note as never) > depth))) return { ok: false as const, code: "note-too-large", position: latest };
			latest += 1;
			for (const w of writes as (GraphChangeItem & { deleted?: true; record?: unknown })[]) {
				if (w.deleted === true) entities.delete(w.id);
				else entities.set(w.id, { kind: w.kind, id: w.id, record: w.record });
			}
			held.push(Object.freeze({ position: latest, writes: writes as GraphChangeItem[], ...(note === undefined ? {} : { note }) }));
			return { ok: true as const, position: latest };
		},
		changes(since: number) {
			if (since < forgotten) return { position: latest, changes: Object.freeze([]), next: null, held: false };
			const from = held.findIndex((c) => c.position > since);
			const changes = Object.freeze(from < 0 ? [] : held.slice(from, from + page));
			const last = changes.length === 0 ? null : changes[changes.length - 1]!.position;
			return { position: latest, changes, next: last !== null && last < latest ? last : null };
		},
		snapshot(kinds: readonly string[]) {
			const wanted = new Set(kinds);
			const list = [...entities.values()].filter((e) => wanted.has(e.kind)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
			return { position: latest, entities: Object.freeze(list) };
		},
		forget(through: number) {
			if (through > forgotten) forgotten = Math.min(through, latest);
			const keep = held.filter((c) => c.position > forgotten);
			held.length = 0;
			held.push(...keep);
		},
	});
}
