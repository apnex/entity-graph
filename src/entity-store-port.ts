/**
 * The entity-store adapter (CONTRACT.md *The store port*; the build plan's module 10; docs/DECISIONS.md D43): a store port over an
 * entity-store store the application has opened, taken as an argument, importing only entity-store's types, so an application
 * supplying its own port needs no entity-store at run time.
 *
 * A graph's net writes become one `change`: a deletion a `delete`, a whole record a `create` where the store holds no entity of
 * that kind and name and an `update` where it does, each entity addressed by its kind and its identity as its name; the change
 * names the position it was planned from as its `expectedPosition` and carries the undo record as its `note`, written by the
 * adapter's `writer` under the write identity `<writer>@<expected position>`, unique since every change takes a new position.
 * The store's notes are bounded at 524,288 bytes and 16 levels, as entity-store bounds them. A store that has moved answers
 * `store-moved`, as does a write identity already used, which only a change this writer landed at that position can have taken.
 * `changes` is read a page at a time, each page's items grouped into changes by their position, the note on a change's first item;
 * a position the store no longer holds answers `held: false`. A snapshot reads every entity of each kind as of the store's
 * latest position, page by page. Every answer of the store is read once as plain data, and one that is not is a fault, every
 * promise in it observed (D30).
 */
import type { ChangeAnswer, ChangeItem, ChangesAnswer, ChangeWrite, EntityStore, FindAnswer, HistoryBoundAnswer, ReadAnswer, StoreOutcome } from "@apnex/entity-store";
import { readPlain } from "./plain-members.js";
import type { GraphStoreChange, GraphStoreEntity, GraphStorePort } from "./port.js";
import type { GraphChangeItem } from "./view.js";

/** The adapter's options: the writer its changes are made by, `entity-graph` when not given. */
export interface EntityStorePortOptions {
	writer?: string;
}

/**
 * What the store answered, read once as plain data (D30, D43); an answer that is not - a promise, a getter, a value holding one -
 * has every promise in it observed and is thrown as a fault, which the graph refuses as `store-failed`.
 */
function ask<A>(call: () => StoreOutcome<A>): StoreOutcome<A> {
	const read = readPlain(call());
	if (!read.ok) throw new TypeError("entity-store answered with what is not plain data");
	return read.value as unknown as StoreOutcome<A>;
}

/** Makes a store port over an opened entity-store store. */
export function createEntityStorePort(store: EntityStore, options: EntityStorePortOptions = {}): GraphStorePort {
	const writer = options.writer ?? "entity-graph";
	const latest = (): number => {
		const answer = ask<HistoryBoundAnswer>(() => store.historyBound());
		return answer.outcome === "answered" ? answer.answer.position : -1;
	};
	return Object.freeze({
		noteBound: 524_288,
		noteDepth: 16,
		position: latest,
		change(input: { writes: readonly GraphChangeItem[]; expectedPosition: number; note?: unknown }) {
			const writes: ChangeWrite[] = [];
			for (const w of input.writes) {
				const target = { kind: w.kind, name: w.id };
				if ("deleted" in w && w.deleted === true) {
					writes.push({ operation: "delete", input: { target } });
					continue;
				}
				const record = (w as { record: unknown }).record as never;
				const held = ask<ReadAnswer>(() => store.read({ target }));
				const present = held.outcome === "answered" && held.answer.entity !== null;
				writes.push(present ? { operation: "update", input: { target, body: record } } : { operation: "create", input: { kind: w.kind, name: w.id, tags: [], body: record } });
			}
			const answer = ask<ChangeAnswer>(() => store.change({ writes, expectedPosition: input.expectedPosition, ...(input.note === undefined ? {} : { note: input.note as never }) }, { writer, writeId: `${writer}@${input.expectedPosition}` }));
			if (answer.outcome === "answered") return { ok: true as const, position: answer.answer.position };
			const code = answer.refusal.code;
			return { ok: false as const, code: code === "position-moved" || code === "identity-reused" ? "store-moved" : code, position: latest() };
		},
		changes(since: number) {
			const answer = ask<ChangesAnswer>(() => store.changes({ since }));
			if (answer.outcome === "refused") return { position: latest(), changes: [], next: null, held: answer.refusal.code !== "position-not-held" };
			const changes: { position: number; writes: GraphChangeItem[]; note?: unknown }[] = [];
			for (const item of answer.answer.changes as ChangeItem[]) {
				const position = "deleted" in item ? item.position : item.changed.position;
				const write: GraphChangeItem = "deleted" in item ? { kind: item.deleted.kind, id: item.deleted.name, deleted: true } : { kind: item.kind, id: item.name, record: item.body };
				const last = changes[changes.length - 1];
				if (last !== undefined && last.position === position) last.writes.push(write);
				else changes.push({ position, writes: [write], ...(item.note === undefined ? {} : { note: item.note }) });
			}
			return { position: answer.answer.position, changes: changes as GraphStoreChange[], next: answer.answer.next };
		},
		snapshot(kinds: readonly string[]) {
			const position = latest();
			const entities: GraphStoreEntity[] = [];
			for (const kind of kinds) {
				for (let after: string | undefined; ;) {
					const answer = ask<FindAnswer>(() => store.find({ kind, asOf: position, ...(after === undefined ? {} : { after }) }));
					if (answer.outcome === "refused") break; // a kind the store does not hold has no entity in it
					for (const e of answer.answer.entries) entities.push({ kind: e.kind, id: e.name, record: e.body });
					if (answer.answer.next === null) break;
					after = answer.answer.next;
				}
			}
			return { position, entities };
		},
	});
}
