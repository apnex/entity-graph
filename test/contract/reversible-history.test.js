// reversible-history - CONTRACT.md's row: an edit that has landed can be undone by a later edit that restores every entity it
// changed, its consequences included, as it was before; undo and redo replay the reversal recorded when the edit landed, without
// working its consequences out again, and are judged and land like any other edit (D8); the history is bounded as the
// application states; whether restoring includes an entity's identity after undoing its deletion is design owed (D6), and an
// application naming its own entities keeps it (*Identity across undo*). Served from M5 (docs/DECISIONS.md D32).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph, createMemoryGraphPort } from "../../dist/index.js";

// a folder holds files and removing it removes them; a file's size is kept by a consequence; a folder holds at most three files
let ran = 0;
const size = { id: "size", phase: "measure", trigger: [{ created: ["file"] }, { changed: { kind: "file", fields: ["text"] } }], run: ({ matches }) => (ran++, matches.filter((m) => m.after).map((m) => ({ op: "set", kind: "file", id: m.id, patch: { size: m.after.text.length } }))) };
const roomy = { id: "roomy", check: ({ graph }) => (graph.all("file").length > 3 ? [{ subject: "files", measure: graph.all("file").length - 3, sentence: "more than three files" }] : []) };
const WORLD = {
	phases: ["measure"],
	kinds: [{ kind: "folder" }, { kind: "file", references: [{ field: "in", targets: ["folder"], holds: "one", onTargetDelete: "cascade-delete" }], consequences: [size], conditions: [roomy] }],
};
const open = (history) => {
	const port = createMemoryGraphPort({ position: 10 });
	const entities = [{ kind: "folder", id: "d", record: { name: "docs" } }, { kind: "file", id: "f1", record: { in: "d", text: "ab", size: 2 } }];
	const made = createEntityGraph(WORLD, { position: 10, entities }, { port, ...(history ? { history } : {}) });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return { graph: made.graph, port };
};
const files = (g) => Object.fromEntries(g.all("file").entities.map((x) => [x.id, x.record]));

test("an edit that has landed is undone by a later edit restoring every entity it changed, its consequences included, as it was before", () => {
	const { graph, port } = open();
	assert.equal(graph.commit({ items: [{ op: "create", kind: "file", id: "f2", record: { in: "d", text: "hello" } }, { op: "set", kind: "file", id: "f1", patch: { text: "abc" } }] }).ok, true);
	assert.deepEqual(files(graph), { f1: { in: "d", text: "abc", size: 3 }, f2: { in: "d", text: "hello", size: 5 } });
	const u = graph.undo();
	assert.equal(u.ok, true, JSON.stringify(u.refusal));
	assert.deepEqual(files(graph), { f1: { in: "d", text: "ab", size: 2 } }, "the consequence's writes reversed with the edit's");
	assert.equal(port.position(), 12, "the undo landed as a later change");
});

test("undo and redo replay the reversal recorded when the edit landed, working no consequence out again", () => {
	const { graph } = open();
	graph.commit({ items: [{ op: "create", kind: "file", id: "f2", record: { in: "d", text: "hello" } }] });
	const before = ran;
	assert.equal(graph.undo().ok, true);
	assert.equal(graph.redo().ok, true);
	assert.equal(ran, before, "no consequence ran in the undo or the redo");
	assert.deepEqual(files(graph).f2, { in: "d", text: "hello", size: 5 });
});

test("undo and redo are judged and land like any other edit: by the rules, the conditions and the expected position", () => {
	const { graph, port } = open();
	const take = () => {
		const change = port.changes(graph.position()).changes[0];
		assert.equal(graph.applyChange({ position: change.position, items: change.writes }).ok, true);
	};
	assert.equal(graph.commit({ items: [{ op: "create", kind: "file", id: "f2", record: { in: "d", text: "x" } }, { op: "create", kind: "file", id: "f3", record: { in: "d", text: "y" } }] }).position, 11);
	assert.equal(graph.commit({ items: [{ op: "remove", kind: "file", id: "f3" }] }).position, 12);
	port.change({ writes: [{ kind: "file", id: "f9", record: { in: "d", text: "q", size: 1 } }], expectedPosition: 12 });
	take();
	assert.equal(graph.undo().refusal?.code, "condition-broken", "restoring f3 beside another writer's f9 makes four files where three are allowed");
	assert.equal(graph.commit({ items: [{ op: "remove", kind: "file", id: "f9" }] }).position, 14);
	assert.equal(graph.undo().position, 15, "f9 back");
	assert.equal(graph.commit({ items: [{ op: "remove", kind: "file", id: "f2" }] }).position, 16);
	assert.equal(graph.undo(14).refusal?.code, "undo-target-unknown", "the edit at 14 was undone, then discarded by the commit after it");
	port.change({ writes: [{ kind: "folder", id: "e", record: {} }], expectedPosition: 16 });
	assert.equal(graph.undo().refusal?.code, "store-moved", "the store has moved since the view's position");
	take();
	assert.equal(graph.undo().position, 18, "planned again once the change is taken in");
});

test("the history is bounded as the application states, and an application naming its entities keeps one across undoing its deletion", () => {
	const { graph } = open({ count: 1 });
	graph.commit({ items: [{ op: "create", kind: "file", id: "f2", record: { in: "d", text: "a" } }] });
	graph.commit({ items: [{ op: "remove", kind: "folder", id: "d" }] });
	assert.deepEqual(graph.history().edits.map((e) => e.position), [12]);
	assert.equal(graph.undo().ok, true);
	assert.deepEqual([graph.get("folder", "d").entity?.id, graph.referrersOf("d").referrers.map((r) => r.id)], ["d", ["f1", "f2"]], "d stands under its own name, held by its files again");
	assert.equal(graph.undo().refusal?.code, "nothing-to-undo", "the first edit was evicted");
});
