// store-port - the store port completed (CONTRACT.md *The store port*, `positioned-graph-sync`; docs/DECISIONS.md D40 to D43): a
// graph made over a store fills its view from it; sync takes in every change after its position, in order, never one it
// committed; a restart fills from the store and reads its history back from the notes; a store that no longer holds the
// view's position refills it; an undo record nesting past the store's bound is refused before it lands; and the
// ./entity-store adapter lands, reads and restarts over entity-store, in memory and on file, two writers over one store.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { openEntityStore, createMemoryStoragePort } from "@apnex/entity-store";
import { createFileStoragePort } from "@apnex/entity-store/file-storage";
import { createEntityGraph, createMemoryGraphPort } from "../dist/index.js";
import { createEntityStorePort } from "../dist/entity-store-port.js";

const create = (kind, id, record = {}) => ({ op: "create", kind, id, record });
const set = (kind, id, patch) => ({ op: "set", kind, id, patch });
const ok = (r) => {
	assert.equal(r.ok, true, JSON.stringify(r.refusal));
	return r;
};
const no = (r) => {
	assert.equal(r.ok, false, `accepted: ${JSON.stringify(r)}`);
	return r.refusal;
};
const NOTES = { kinds: [{ kind: "note" }, { kind: "tag" }] };
const over = (port, options = {}) => {
	const made = createEntityGraph(NOTES, undefined, { port, ...options });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return made.graph;
};
const records = (g, kind = "note") => Object.fromEntries(g.all(kind).entities.map((x) => [x.id, x.record]));

test("a graph made over a store fills its view from the store at its latest position", () => {
	const port = createMemoryGraphPort({ position: 3, entities: [{ kind: "note", id: "a", record: { t: 1 } }, { kind: "tag", id: "x", record: {} }] });
	const g = over(port);
	assert.equal(g.position(), 3);
	assert.deepEqual([records(g), records(g, "tag")], [{ a: { t: 1 } }, { x: {} }]);
});

test("sync takes in every change after the view's position, in order, and never a change this graph committed", () => {
	const port = createMemoryGraphPort();
	const g = over(port);
	assert.equal(ok(g.commit({ items: [create("note", "mine")] })).position, 1);
	port.change({ writes: [{ kind: "note", id: "theirs", record: {} }], expectedPosition: 1 });
	port.change({ writes: [{ kind: "note", id: "theirs", deleted: true }, { kind: "tag", id: "t", record: {} }], expectedPosition: 2 });
	assert.deepEqual(ok(g.sync(2)), { ok: true, position: 2 });
	assert.deepEqual(Object.keys(records(g)), ["mine", "theirs"]);
	assert.deepEqual(ok(g.sync()), { ok: true, position: 3 });
	assert.deepEqual([Object.keys(records(g)), Object.keys(records(g, "tag"))], [["mine"], ["t"]]);
	assert.deepEqual(ok(g.sync()), { ok: true, position: 3 }, "nothing more");
});

test("a restart fills from the store and reads the history back from the notes, so undo and redo go on; another writer's edits are not its own", () => {
	const port = createMemoryGraphPort();
	const first = over(port, { writer: "alice" });
	ok(first.commit({ items: [create("note", "a")] }));
	ok(first.commit({ items: [create("note", "b")] }));
	ok(first.commit({ items: [create("note", "c")] }));
	ok(first.undo());
	const bob = over(port, { writer: "bob" });
	ok(bob.commit({ items: [create("note", "z")] }));
	const again = over(port, { writer: "alice" });
	assert.deepEqual(again.history().edits.map((e) => [e.position, e.undone]), [[1, false], [2, false], [3, true]]);
	assert.deepEqual(Object.keys(records(again)), ["a", "b", "z"]);
	ok(again.redo());
	ok(again.undo(2));
	assert.deepEqual(Object.keys(records(again)), ["a", "z"]);
	assert.deepEqual(over(port, { writer: "alice" }).history(), again.history(), "an undo of two edits read back as two undone");
	assert.deepEqual(over(port, { writer: "bob" }).history().edits.map((e) => e.position), [5]);
});

test("a store that no longer holds the view's position: sync refills the view from the store, and the history from the notes it still holds", () => {
	const port = createMemoryGraphPort();
	const g = over(port);
	ok(g.commit({ items: [create("note", "a")] }));
	ok(g.commit({ items: [create("note", "b")] }));
	const other = over(port, { writer: "other" });
	ok(other.commit({ items: [create("note", "c")] }));
	port.forget(3);
	ok(other.commit({ items: [set("note", "c", { t: 2 })] }));
	assert.deepEqual(ok(g.sync()), { ok: true, position: 4 });
	assert.deepEqual(records(g), { a: {}, b: {}, c: { t: 2 } });
	assert.deepEqual(g.history().edits.map((e) => e.position), [], "the notes of its edits are forgotten with their changes");
	assert.equal(no(g.undo()).code, "nothing-to-undo");
});

// a port with only what CONTRACT.md's *The store port* names: changes landing whole under an expected position, a note, and the
// changes after a held position; no snapshot
const withoutSnapshot = (port) => ({ noteBound: port.noteBound, position: () => port.position(), change: (input) => port.change(input), changes: (since) => port.changes(since) });

test("a port without a snapshot serves a graph given an opening; a graph made over it with none is refused, naming the snapshot", () => {
	const inner = createMemoryGraphPort({ position: 2, entities: [{ kind: "note", id: "a", record: {} }] });
	const port = withoutSnapshot(inner);
	const refused = createEntityGraph(NOTES, undefined, { port });
	assert.deepEqual([refused.ok, refused.refusal?.code, refused.refusal?.details.subject.startsWith("port.snapshot")], [false, "invalid-options", true]);
	const made = createEntityGraph(NOTES, { position: 2, entities: [{ kind: "note", id: "a", record: {} }] }, { port });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	const g = made.graph;
	assert.equal(ok(g.commit({ items: [create("note", "b")] })).position, 3);
	inner.change({ writes: [{ kind: "note", id: "c", record: {} }], expectedPosition: 3 });
	assert.deepEqual(ok(g.sync()), { ok: true, position: 4 });
	assert.equal(ok(g.undo()).position, 5);
	assert.deepEqual(Object.keys(records(g)), ["a", "c"]);
});

test("a store that no longer holds the view's position, over a port without a snapshot: sync refused, the view as it was", () => {
	const inner = createMemoryGraphPort();
	const g = createEntityGraph(NOTES, { position: 0 }, { port: withoutSnapshot(inner) }).graph;
	ok(g.commit({ items: [create("note", "a")] }));
	inner.change({ writes: [{ kind: "note", id: "b", record: {} }], expectedPosition: 1 });
	inner.change({ writes: [{ kind: "note", id: "c", record: {} }], expectedPosition: 2 });
	inner.forget(2);
	const r = no(g.sync());
	assert.deepEqual([r.code, r.details.subject.startsWith("changes: the store no longer holds position 1")], ["store-failed", true]);
	assert.deepEqual([g.position(), Object.keys(records(g))], [1, ["a"]]);
});

test("an undo record nesting past the store's bound is refused before it lands", () => {
	const port = createMemoryGraphPort({ noteDepth: 6 });
	const g = over(port);
	const r = no(g.commit({ items: [create("note", "deep", { a: { b: { c: 1 } } })] }));
	assert.deepEqual([r.code, r.details.ruleKey, r.details.subject, r.details.opIndex], ["note-bound", "note-depth", "note", -1]);
	assert.ok(r.details.measure > 6);
	assert.equal(port.position(), 0);
	assert.equal(ok(g.commit({ items: [create("note", "flat", { a: 1 })] })).position, 1);
});

// entity-store, opened over memory or a file, every kind of the declaration holding any object
const SHAPE = { $schema: "urn:apnex:shape-check:dialect:1", type: "object" };
const openStore = (storage) => {
	const opened = openEntityStore({ storage, clock: { now: () => 1_700_000_000_000 }, historyMs: 3_600_000, maxEntityBytes: 65536, kinds: { note: SHAPE, tag: SHAPE } });
	assert.equal(opened.opened, true, JSON.stringify(opened.refusal));
	return opened.store;
};

test("over entity-store in memory: a commit lands as one change with its note, an identity as a name, a moved store refusing", () => {
	const store = openStore(createMemoryStoragePort());
	const port = createEntityStorePort(store, { writer: "alice" });
	const g = over(port, { writer: "alice" });
	assert.equal(g.position(), 0);
	assert.equal(ok(g.commit({ items: [create("note", "a", { t: 1 }), create("tag", "x")] })).position, 1);
	const read = store.read({ target: { kind: "note", name: "a" } });
	assert.deepEqual([read.outcome, read.answer.entity.body], ["answered", { t: 1 }]);
	const page = store.changes({ since: 0 });
	assert.deepEqual(page.answer.changes[0].note, { "entity-graph": { v: 1, act: "edit", of: [], by: "alice", entities: [["note", "a", null, { t: 1 }], ["tag", "x", null, {}]] } });
	const theirs = createEntityStorePort(store, { writer: "bob" });
	assert.equal(theirs.change({ writes: [{ kind: "note", id: "b", record: {} }], expectedPosition: 1 }).ok, true);
	assert.equal(no(g.commit({ items: [set("note", "a", { t: 2 })] })).code, "store-moved");
	ok(g.sync());
	assert.equal(ok(g.commit({ items: [set("note", "a", { t: 2 })] })).position, 3);
	assert.equal(ok(g.undo()).position, 4);
	assert.deepEqual(store.read({ target: { kind: "note", name: "a" } }).answer.entity.body, { t: 1 });
});

test("over entity-store on file: a restart refills the view and reads the history back from the notes", () => {
	const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "entity-graph-"));
	try {
		const file = path.join(dir, "store.log");
		const files = [];
		const storage = () => (files.push(createFileStoragePort(file)), files.at(-1));
		const before = (() => {
			const port = createEntityStorePort(openStore(storage()), { writer: "alice" });
			const g = over(port, { writer: "alice" });
			ok(g.commit({ items: [create("note", "a", { t: 1 })] }));
			ok(g.commit({ items: [set("note", "a", { t: 2 }), create("note", "b")] }));
			ok(g.undo());
			return { view: JSON.stringify([g.position(), g.all("note")]), history: g.history() };
		})();
		const g = over(createEntityStorePort(openStore(storage()), { writer: "alice" }), { writer: "alice" });
		assert.equal(JSON.stringify([g.position(), g.all("note")]), before.view, "the view a fresh reading of the store");
		assert.deepEqual(g.history().edits.map((e) => [e.position, e.undone]), before.history.edits.map((e) => [e.position, e.undone]));
		ok(g.redo());
		assert.deepEqual(records(g), { a: { t: 2 }, b: {} });
		for (const f of files) f.close();
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("two graphs over one store: each's edit refused when the other has landed since, and landing once planned again", () => {
	const store = openStore(createMemoryStoragePort());
	const a = over(createEntityStorePort(store, { writer: "alice" }), { writer: "alice" });
	const b = over(createEntityStorePort(store, { writer: "bob" }), { writer: "bob" });
	ok(a.commit({ items: [create("note", "n", { by: "a" })] }));
	assert.equal(no(b.commit({ items: [create("note", "m")] })).code, "store-moved");
	ok(b.sync());
	ok(b.commit({ items: [create("note", "m")] }));
	assert.equal(no(a.undo()).code, "store-moved");
	ok(a.sync());
	ok(a.undo());
	ok(b.sync());
	assert.equal(JSON.stringify(a.all("note")), JSON.stringify(b.all("note")));
	assert.deepEqual(Object.keys(records(b)), ["m"]);
});

test("sync refused: with no store, for a limit that is not a whole number, and when called back while the graph plans; the view as it was", () => {
	const bare = createEntityGraph(NOTES).graph;
	assert.equal(no(bare.sync()).code, "no-store");
	const port = createMemoryGraphPort();
	let graph = null;
	const inner = [];
	const run = () => {
		inner.push(graph.sync());
		return [];
	};
	graph = over(port, {});
	assert.deepEqual([no(graph.sync(1.5)).code, no(graph.sync("2")).code], ["invalid-query", "invalid-query"]);
	const calling = createEntityGraph({ phases: ["after"], kinds: [{ kind: "note", consequences: [{ id: "c", phase: "after", trigger: { created: ["note"] }, run }] }, { kind: "tag" }] }, undefined, { port });
	assert.equal(calling.ok, true, JSON.stringify(calling.refusal));
	graph = calling.graph;
	port.change({ writes: [{ kind: "tag", id: "t", record: {} }], expectedPosition: 0 });
	ok(graph.plan({ items: [create("note", "a")] }));
	assert.deepEqual(inner.map((r) => [r.ok, r.refusal?.code, r.refusal?.details.subject]), [[false, "reentrant", "sync"]]);
	assert.equal(graph.position(), 0, "nothing taken in while it planned");
	assert.deepEqual(ok(graph.sync()), { ok: true, position: 1 });
});

test("a graph's writer is a name of 1 to 1,024 characters, or its options are refused", () => {
	for (const writer of ["", 7, "x".repeat(1025)]) assert.equal(createEntityGraph(NOTES, undefined, { port: createMemoryGraphPort(), writer }).refusal?.code, "invalid-options", JSON.stringify(writer));
	assert.equal(createEntityGraph(NOTES, undefined, { port: createMemoryGraphPort(), writer: "x".repeat(1024) }).ok, true);
});

// --- the gaps the independent check of 6e9ce7e found: each kills a fault that survived the suite ---

test("two adapters under one writer: the second graph's edit at a position the first's already used is refused store-moved, not store-failed", () => {
	const store = openStore(createMemoryStoragePort());
	const first = over(createEntityStorePort(store, { writer: "shared" }), { writer: "g1" });
	const second = over(createEntityStorePort(store, { writer: "shared" }), { writer: "g2" });
	ok(first.commit({ items: [create("note", "a")] }));
	const r = no(second.commit({ items: [create("note", "b")] }));
	assert.equal(r.code, "store-moved", "the write identity shared@0 already taken by a different change");
	ok(second.sync());
	assert.equal(ok(second.commit({ items: [create("note", "b")] })).position, 2);
});

test("over entity-store, a kind larger than one page of find is read whole by the first fill", () => {
	const store = openStore(createMemoryStoragePort());
	const body = { text: "x".repeat(600) };
	for (let batch = 0; batch < 2; batch++) {
		const writes = Array.from({ length: 600 }, (_, i) => ({ operation: "create", input: { kind: "note", name: `n${batch}-${String(i).padStart(4, "0")}`, tags: [], body } }));
		assert.equal(store.change({ writes }, { writer: "seed", writeId: `seed-${batch}` }).outcome, "answered");
	}
	const firstPage = store.find({ kind: "note" }).answer;
	assert.ok(firstPage.next !== null && firstPage.entries.length < 1200, `one page holds ${firstPage.entries.length} of 1,200`);
	const g = over(createEntityStorePort(store, { writer: "reader" }), { writer: "reader" });
	assert.deepEqual([g.position(), g.all("note").entities.length], [2, 1200]);
});

test("over entity-store, a view's position past the store's history window is refilled by sync, answering that it refilled", () => {
	let now = 1_700_000_000_000;
	const opened = openEntityStore({ storage: createMemoryStoragePort(), clock: { now: () => now }, historyMs: 1000, maxEntityBytes: 65536, kinds: { note: SHAPE, tag: SHAPE } });
	const store = opened.store;
	const g = over(createEntityStorePort(store, { writer: "mine" }), { writer: "mine" });
	ok(g.commit({ items: [create("note", "a")] }));
	const theirs = createEntityStorePort(store, { writer: "theirs" });
	assert.equal(theirs.change({ writes: [{ kind: "note", id: "b", record: {} }], expectedPosition: 1 }).ok, true);
	now += 5000;
	assert.equal(theirs.change({ writes: [{ kind: "note", id: "c", record: {} }], expectedPosition: 2 }).ok, true);
	assert.equal(theirs.changes(1).held, false, "the adapter answers that position 1 is no longer held");
	const r = ok(g.sync());
	assert.equal(r.position, 3);
	assert.deepEqual(Object.keys(records(g)), ["a", "b", "c"]);
});

test("a restart after the store forgot its changes through 1, 3, 5 or 6 reads back exactly the edits whose notes it still holds", () => {
	for (const forgotten of [1, 3, 5, 6]) {
		const port = createMemoryGraphPort();
		const g = over(port, { writer: "w" });
		for (let i = 0; i < 8; i++) ok(g.commit({ items: [create("note", `n${i}`)] }));
		port.forget(forgotten);
		const again = over(port, { writer: "w" });
		const want = Array.from({ length: 8 - forgotten }, (_, i) => forgotten + 1 + i);
		assert.deepEqual(again.history().edits.map((e) => e.position), want, `forgotten through ${forgotten}`);
	}
});
