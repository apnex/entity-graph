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
import { toCanonicalJson, utf8ByteLength } from "@apnex/shape-check";
import { readPlain } from "./plain-members.js";
import type { GraphChangeItem } from "./view.js";

/** One change a store holds: the position it landed at, its writes in order, and its note, if it carried one. */
export interface GraphStoreChange {
	readonly position: number;
	readonly writes: readonly GraphChangeItem[];
	readonly note?: unknown;
}

/** The structural store port (D33). */
export interface GraphStorePort {
	/** The bound on a change's note, in bytes of its canonical UTF-8 JSON. */
	readonly noteBound: number;
	/** The store's latest position. */
	position(): number;
	/** Lands a change whole, or refuses it: `store-moved` when its expected position is not the store's latest. */
	change(input: { writes: readonly GraphChangeItem[]; expectedPosition: number; note?: unknown }): { ok: true; position: number } | { ok: false; code: string; position: number };
	/**
	 * The changes after a position, in order, a page at a time as entity-store answers them: the store's latest position, the page's
	 * changes, and the position to ask from for the next page, or null where none remain.
	 */
	changes(since: number): { position: number; changes: readonly GraphStoreChange[]; next?: number | null };
}

/** The note bound of the reference store, entity-store: 512 KiB of canonical UTF-8 JSON. */
export const NOTE_BOUND = 524_288;

/** The size a note takes against a store's bound: the bytes of its canonical UTF-8 JSON (as entity-store measures it). */
export const noteBytes = (note: unknown): number => utf8ByteLength(toCanonicalJson(note as never));

/** Makes an in-memory port, its first change landing after `position`, its note bound `noteBound` bytes, its pages `pageSize` changes. */
export function createMemoryGraphPort(options: { position?: number; noteBound?: number; pageSize?: number } = {}): GraphStorePort {
	const start = options.position ?? 0;
	const bound = options.noteBound ?? NOTE_BOUND;
	const page = options.pageSize ?? 100;
	if (!Number.isSafeInteger(page) || page < 1) throw new RangeError("createMemoryGraphPort: pageSize is a whole number of changes from 1");
	if (!Number.isSafeInteger(start) || start < 0) throw new RangeError("createMemoryGraphPort: position is a whole number from 0");
	if (!Number.isSafeInteger(bound) || bound < 1) throw new RangeError("createMemoryGraphPort: noteBound is a whole number of bytes from 1");
	const held: GraphStoreChange[] = [];
	const latest = () => (held.length === 0 ? start : held[held.length - 1]!.position);
	return Object.freeze({
		noteBound: bound,
		position: latest,
		change(input: { writes: readonly GraphChangeItem[]; expectedPosition: number; note?: unknown }) {
			const read = readPlain(input);
			if (!read.ok) return { ok: false as const, code: "change-not-plain", position: latest() };
			const { writes, expectedPosition, note } = read.value as { writes?: unknown; expectedPosition?: unknown; note?: unknown };
			if (!Array.isArray(writes) || writes.length === 0) return { ok: false as const, code: "empty-change", position: latest() };
			if (expectedPosition !== latest()) return { ok: false as const, code: "store-moved", position: latest() };
			if (note !== undefined && noteBytes(note) > bound) return { ok: false as const, code: "note-too-large", position: latest() };
			const position = latest() + 1;
			held.push(Object.freeze({ position, writes: writes as GraphChangeItem[], ...(note === undefined ? {} : { note }) }));
			return { ok: true as const, position };
		},
		changes(since: number) {
			// the changes are numbered one after another from `start`, so the first after `since` is at index since - start
			const from = Math.max(0, since - start);
			const changes = Object.freeze(held.slice(from, from + page));
			const last = changes.length === 0 ? null : changes[changes.length - 1]!.position;
			return { position: latest(), changes, next: last !== null && last < latest() ? last : null };
		},
	});
}
