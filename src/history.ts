/**
 * The history the graph keeps for undo (CONTRACT.md *Undo and redo*; docs/DECISIONS.md D34, D35): which landed edits can be
 * undone and which redone, each by the position of the change that landed it, with the bytes of its undo record; the records
 * themselves are kept in the store, in the note on each change, so the component keeps no record of its own.
 *
 * The undo record (D34) is a note `{ "entity-graph": { v: 1, act, of, entities } }`: `act` is `edit`, `undo` or `redo`; `of` the
 * positions of the edits an undo or a redo replays, latest first; and `entities` one `[kind, id, before, after]` for each entity
 * the change writes, its record before and after the change, null where it is absent. An undo writes each entity's `before` and
 * a redo its `after`, so neither works a consequence out again.
 *
 * The bounds (D35): a count of edits and a size in bytes of their records, and a pin; after each commit or redo lands, the
 * oldest held edit is evicted while either bound is passed, a pinned oldest only while a hard limit is passed, and the edit just
 * landed never, so what is held is always a run of edits each of which can be undone in turn.
 */
import { isObject, type GraphRecord } from "./view.js";

/** One entity a change writes: its kind and identity, and its record before and after the change, null where absent. */
export type RecordedEntity = readonly [kind: string, id: string, before: GraphRecord | null, after: GraphRecord | null];

/** An undo record as read from a note: what it records, of which edits, by which writer (D42), and the entities it wrote. */
export interface UndoRecord {
	readonly act: "edit" | "undo" | "redo";
	readonly of: readonly number[];
	readonly by?: string;
	readonly entities: readonly RecordedEntity[];
}

/** The note a change carries for an undo record. */
export function noteOf(record: UndoRecord): { "entity-graph": { v: 1; act: string; of: readonly number[]; by?: string; entities: readonly RecordedEntity[] } } {
	return { "entity-graph": { v: 1, act: record.act, of: record.of, ...(record.by === undefined ? {} : { by: record.by }), entities: record.entities } };
}

/** The undo record a note holds, or null where it holds none this component can read. */
export function recordOf(note: unknown): UndoRecord | null {
	if (!isObject(note) || !isObject(note["entity-graph"])) return null;
	const { v, act, of, by, entities } = note["entity-graph"];
	if (by !== undefined && typeof by !== "string") return null;
	if (v !== 1 || (act !== "edit" && act !== "undo" && act !== "redo") || !Array.isArray(of) || !of.every((p) => Number.isSafeInteger(p)) || !Array.isArray(entities)) return null;
	const record = (x: unknown) => x === null || isObject(x);
	if (!entities.every((e) => Array.isArray(e) && e.length === 4 && typeof e[0] === "string" && typeof e[1] === "string" && record(e[2]) && record(e[3]))) return null;
	return { act, of: of as number[], ...(by === undefined ? {} : { by }), entities: entities as RecordedEntity[] };
}

/** The history's bounds as the application states them (D35). */
export interface HistoryBounds {
	count?: number;
	bytes?: number;
	hardCount?: number;
	hardBytes?: number;
	pin?: (edit: { readonly position: number; readonly writes: readonly unknown[] }) => unknown;
}

/** One edit the history holds: where it landed, its record's bytes, and whether it is pinned. */
export interface HistoryEdit {
	readonly position: number;
	readonly bytes: number;
	readonly pinned: boolean;
}

export class History {
	/** The edits held, oldest first; the first `cursor` are landed and not undone, the rest undone and redoable, latest undone first. */
	private edits: HistoryEdit[] = [];
	private cursor = 0;
	private evictedCount = 0;

	constructor(private readonly bounds: { count: number; bytes: number; hardCount: number; hardBytes: number }) {}

	/** An edit just landed: every undone edit is discarded, and the oldest evicted as the bounds say. */
	landed(edit: HistoryEdit): void {
		this.edits = this.edits.slice(0, this.cursor);
		this.edits.push(edit);
		this.cursor = this.edits.length;
		this.evict();
	}

	/** The held edits an undo replays, latest first: the latest alone, or down to the one that landed at `to`; null where none is held. */
	toUndo(to?: number): HistoryEdit[] | null {
		const held = this.edits.slice(0, this.cursor);
		if (held.length === 0) return null;
		if (to === undefined) return [held[held.length - 1]!];
		const at = held.findIndex((e) => e.position === to);
		return at < 0 ? null : held.slice(at).reverse();
	}

	/** Whether an edit the graph could undo is held at all. */
	holdsAny(): boolean {
		return this.cursor > 0;
	}

	/** `n` edits undone. */
	undone(n: number): void {
		this.cursor -= n;
	}

	/** The undone edit a redo replays: the earliest of the latest undo's edits, so after an undo of several the oldest goes first. */
	toRedo(): HistoryEdit | null {
		return this.cursor < this.edits.length ? this.edits[this.cursor]! : null;
	}

	/** Undo records read back from the store (D42): the latest held edits undone while their positions are those `of` names. */
	undoneAt(of: readonly number[]): void {
		for (const position of of) {
			if (this.cursor === 0 || this.edits[this.cursor - 1]!.position !== position) return;
			this.cursor -= 1;
		}
	}

	/** One edit redone, held again, and the oldest evicted as the bounds say. */
	redone(): void {
		this.cursor += 1;
		this.evict();
	}

	/** What the history holds: every edit, oldest first, whether undone, and how many it has evicted. */
	read(): { edits: { position: number; bytes: number; pinned: boolean; undone: boolean }[]; evicted: number } {
		return { edits: this.edits.map((e, i) => ({ ...e, undone: i >= this.cursor })), evicted: this.evictedCount };
	}

	/**
	 * Evicts the oldest held edit while more than `count` edits or `bytes` bytes are held, a pinned one only while more than
	 * `hardCount` or `hardBytes` are, and never the latest held edit, just landed (the corpus's R47).
	 */
	private evict(): void {
		const { count, bytes, hardCount, hardBytes } = this.bounds;
		let size = 0;
		for (let i = 0; i < this.cursor; i++) size += this.edits[i]!.bytes;
		// how many of the oldest go, read by a moving index, then dropped at once
		let gone = 0;
		for (; this.cursor - gone > 1; gone++) {
			const held = this.cursor - gone;
			if (held <= count && size <= bytes) break;
			const oldest = this.edits[gone]!;
			if (oldest.pinned && held <= hardCount && size <= hardBytes) break; // the pin holds
			size -= oldest.bytes;
		}
		if (gone === 0) return;
		this.edits = this.edits.slice(gone);
		this.cursor -= gone;
		this.evictedCount += gone;
	}
}
