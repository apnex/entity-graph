// store-ports - the stores the corpus's batches 5 and 6 run over (corpus/README.md, *The port*): the in-memory port, and the
// ./entity-store adapter over entity-store in memory and on file. The corpus numbers a store's changes from its start step's
// position, so a port over entity-store, which gives the seeded start entities a position of their own, answers every position
// less that offset; its note bound is the case's where the case states one. Nothing of a case is changed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemoryStoragePort, openEntityStore } from "@apnex/entity-store";
import { createFileStoragePort } from "@apnex/entity-store/file-storage";
import { createMemoryGraphPort } from "../../dist/index.js";
import { createEntityStorePort } from "../../dist/entity-store-port.js";

const SHAPE = { $schema: "urn:apnex:shape-check:dialect:1", type: "object" };
export const STORES = ["memory", "entity-store in memory", "entity-store on file"];

/** A port over entity-store whose positions are the store's less `offset`. */
function relabel(port, offset, noteBound) {
	const less = (p) => (typeof p === "number" ? p - offset : p);
	return Object.freeze({
		noteBound: noteBound ?? port.noteBound,
		noteDepth: port.noteDepth,
		position: () => less(port.position()),
		change: (input) => {
			const answer = port.change({ ...input, expectedPosition: input.expectedPosition + offset });
			return { ...answer, position: less(answer.position) };
		},
		changes: (since) => {
			const answer = port.changes(since + offset);
			return { ...answer, position: less(answer.position), next: less(answer.next), changes: answer.changes.map((c) => ({ ...c, position: less(c.position) })) };
		},
		snapshot: (kinds) => {
			const answer = port.snapshot(kinds);
			return { ...answer, position: less(answer.position) };
		},
	});
}

/**
 * The store a case runs over, holding `entities` at `position`: `port` for the graph, `other()` for another writer, `reopen()` to
 * open the same store again as a restart does, and `close()` to remove what it made.
 */
export function storeFor(name, { position, entities, noteBound, kinds }) {
	if (name === "memory") {
		const port = createMemoryGraphPort({ position, entities, ...(noteBound === undefined ? {} : { noteBound }) });
		return { port, other: () => port, reopen: () => port, close: () => {} };
	}
	const dir = name === "entity-store on file" ? fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "entity-graph-corpus-")) : null;
	const memory = createMemoryStoragePort();
	const files = [];
	const storage = () => {
		if (dir === null) return memory;
		files.push(createFileStoragePort(path.join(dir, "store.log")));
		return files.at(-1);
	};
	const open = () => {
		const opened = openEntityStore({ storage: storage(), clock: { now: () => 1_700_000_000_000 }, historyMs: 3_600_000, maxEntityBytes: 262_144, kinds: Object.fromEntries(kinds.map((k) => [k, SHAPE])) });
		if (!opened.opened) throw new Error(JSON.stringify(opened.refusal));
		return opened.store;
	};
	let store;
	try {
		store = open();
		if (entities.length > 0) {
			const seeded = store.change({ writes: entities.map((e) => ({ operation: "create", input: { kind: e.kind, name: e.id, tags: [], body: e.record } })) }, { writer: "start", writeId: "start" });
			if (seeded.outcome !== "answered") throw new Error(JSON.stringify(seeded.refusal));
		}
	} catch (thrown) {
		for (const f of files) f.close();
		if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
		throw thrown;
	}
	const offset = store.historyBound().answer.position - position;
	const portOver = (writer) => relabel(createEntityStorePort(store, { writer }), offset, noteBound);
	let port = portOver("entity-graph");
	return {
		get port() { return port; },
		other: () => portOver("other"),
		reopen: () => {
			if (dir !== null) store = open();
			port = portOver("entity-graph");
			return port;
		},
		close: () => {
			for (const f of files) f.close();
			if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
		},
	};
}
