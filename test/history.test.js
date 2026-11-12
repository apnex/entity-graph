// history - undo and redo (CONTRACT.md *Undo and redo*, *The store port*, *Identity across undo*; docs/DECISIONS.md D8, D32 to
// D36): an edit is committed through the store port as one positioned change carrying its undo record in its note; undo replays
// the recorded reversal of the latest edit not yet undone, or of every such edit down to a named one, and redo the recorded
// writes of the latest undone, neither working consequences out again, each judged and landed as any edit is; the history is
// bounded by a count, a size and a pin, each yielding at its hard limit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph, createMemoryGraphPort } from "../dist/index.js";

const ref = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });
const create = (kind, id, record = {}) => ({ op: "create", kind, id, record });
const set = (kind, id, patch) => ({ op: "set", kind, id, patch });
const remove = (kind, id) => ({ op: "remove", kind, id });
const open = (declaration, { entities = [], position = 0, history, noteBound } = {}) => {
	const port = createMemoryGraphPort({ position, ...(noteBound === undefined ? {} : { noteBound }) });
	const made = createEntityGraph(declaration, { position, entities }, { port, ...(history === undefined ? {} : { history }) });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return { graph: made.graph, port };
};
const ok = (r) => {
	assert.equal(r.ok, true, JSON.stringify(r.refusal));
	return r;
};
const no = (r) => {
	assert.equal(r.ok, false, `accepted: ${JSON.stringify(r)}`);
	return r.refusal;
};
const records = (g, kind) => Object.fromEntries(g.all(kind).entities.map((x) => [x.id, x.record]));
const LIBRARY = [
	{ kind: "shelf" },
	{ kind: "book", references: [ref("shelf", ["shelf"], "one", { onTargetDelete: "cascade-delete" })] },
];

test("an edit is committed through the port as one change at the position it was planned from, its undo record in the note", () => {
	const { graph, port } = open({ kinds: LIBRARY }, { position: 4, entities: [{ kind: "shelf", id: "s", record: {} }, { kind: "book", id: "b", record: { shelf: "s" } }] });
	const r = ok(graph.commit({ items: [remove("shelf", "s")] }));
	assert.equal(r.position, 5);
	assert.deepEqual(r.writes.map((w) => `${w.op} ${w.id}`), ["del s", "del b"], "the cascade with it");
	assert.equal(graph.position(), 5);
	assert.deepEqual(records(graph, "book"), {});
	const landed = port.changes(4).changes;
	assert.equal(landed.length, 1);
	assert.deepEqual(landed[0].writes, [{ kind: "shelf", id: "s", deleted: true }, { kind: "book", id: "b", deleted: true }]);
	assert.deepEqual(landed[0].note, { "entity-graph": { v: 1, act: "edit", of: [], entities: [["shelf", "s", {}, null], ["book", "b", { shelf: "s" }, null]] } }, "each entity as it was before and as the edit leaves it");
	const nothing = ok(graph.commit({ items: [create("shelf", "s"), remove("shelf", "s")] }));
	assert.deepEqual([nothing.position, nothing.writes, port.position(), graph.history().edits.length], [5, [], 5, 1], "a plan that changes nothing lands nothing, and holds no place in the history");
});

test("a store that has moved refuses the commit by its expected position, and the answers stay as they were", () => {
	const { graph, port } = open({ kinds: LIBRARY });
	assert.equal(port.change({ writes: [{ kind: "shelf", id: "other", record: {} }], expectedPosition: 0 }).ok, true, "another writer");
	const r = no(graph.commit({ items: [create("shelf", "mine")] }));
	assert.deepEqual([r.code, r.details.ruleKey, r.details.subject, r.details.measure, r.details.opIndex], ["store-moved", "store-moved", "position", 1, -1]);
	assert.equal(graph.position(), 0);
	assert.deepEqual(records(graph, "shelf"), {});
	const theirs = port.changes(0).changes[0];
	ok(graph.applyChange({ position: theirs.position, items: theirs.writes }));
	assert.equal(ok(graph.commit({ items: [create("shelf", "mine")] })).position, 2, "planned again, from the store's position");
});

test("an edit whose undo record would not fit the store's note is refused before it lands, naming the bound", () => {
	const { graph, port } = open({ kinds: LIBRARY }, { noteBound: 400 });
	const r = no(graph.commit({ items: Array.from({ length: 20 }, (_, i) => create("shelf", `shelf-${i}`, { label: "x".repeat(10) })) }));
	assert.deepEqual([r.code, r.details.ruleKey, r.details.subject, r.details.opIndex], ["note-bound", "note-bound", "note", -1]);
	assert.ok(r.details.measure > 400, `measure ${r.details.measure}`);
	assert.equal(port.position(), 0, "nothing landed");
	assert.equal(ok(graph.commit({ items: [create("shelf", "s")] })).position, 1, "a record within it lands");
});

test("undo replays the recorded reversal of the latest edit, its rule and consequence writes included, without working them out again; redo replays its writes", () => {
	let calls = 0;
	const count = { id: "count", phase: "first", trigger: [{ created: ["book"] }, { deleted: ["book"] }], run: ({ graph }) => (calls++, [{ op: "change", kind: "tally", id: "t", record: { books: graph.all("book").length } }]) };
	const declaration = { phases: ["first"], kinds: [...LIBRARY.slice(0, 1), { ...LIBRARY[1], consequences: [count] }, { kind: "tally" }] };
	const { graph, port } = open(declaration, { entities: [{ kind: "shelf", id: "s", record: {} }, { kind: "book", id: "b1", record: { shelf: "s" } }, { kind: "tally", id: "t", record: { books: 1 } }] });
	ok(graph.commit({ items: [create("book", "b2", { shelf: "s" })] }));
	ok(graph.commit({ items: [remove("shelf", "s")] }));
	assert.deepEqual([records(graph, "book"), records(graph, "tally"), calls], [{}, { t: { books: 0 } }, 2]);
	const u = ok(graph.undo());
	assert.equal(u.position, 3);
	assert.deepEqual([records(graph, "shelf"), records(graph, "book"), records(graph, "tally")], [{ s: {} }, { b1: { shelf: "s" }, b2: { shelf: "s" } }, { t: { books: 2 } }]);
	assert.equal(calls, 2, "no consequence ran");
	assert.equal(port.changes(2).changes[0].note["entity-graph"].act, "undo");
	ok(graph.redo());
	assert.deepEqual([records(graph, "book"), records(graph, "tally"), calls], [{}, { t: { books: 0 } }, 2]);
	assert.equal(no(graph.redo()).code, "nothing-to-redo");
	ok(graph.undo());
	ok(graph.undo());
	assert.deepEqual([records(graph, "book"), records(graph, "tally"), calls], [{ b1: { shelf: "s" } }, { t: { books: 1 } }, 2]);
	assert.equal(no(graph.undo()).code, "nothing-to-undo");
});

test("undo down to a named edit is one change; a new edit discards what was undone", () => {
	const { graph, port } = open({ kinds: [{ kind: "note" }] });
	for (const id of ["a", "b", "c"]) ok(graph.commit({ items: [create("note", id)] }));
	const u = ok(graph.undo(2));
	assert.equal(u.position, 4);
	assert.deepEqual(Object.keys(records(graph, "note")), ["a"]);
	assert.deepEqual(port.changes(3).changes[0].note["entity-graph"].of, [3, 2], "one change undoing two edits, latest first");
	ok(graph.redo());
	assert.deepEqual(Object.keys(records(graph, "note")), ["a", "b"], "redo replays the latest undone edit");
	ok(graph.commit({ items: [create("note", "d")] }));
	assert.equal(no(graph.redo()).code, "nothing-to-redo", "the new edit discarded the undone one");
	assert.deepEqual(graph.history().edits.map((e) => [e.position, e.undone]), [[1, false], [2, false], [6, false]]);
	assert.equal(no(graph.undo(3)).code, "undo-target-unknown", "an edit not undoable now");
	assert.equal(no(graph.undo("2")).code, "undo-target-unknown");
});

test("an undo is judged as any edit is: one that would leave a rule more broken than it found it is refused", () => {
	const few = { id: "few", check: ({ graph }) => (graph.all("note").length > 2 ? [{ subject: "notes", measure: graph.all("note").length - 2, sentence: "too many notes" }] : []) };
	const { graph } = open({ kinds: [{ kind: "note", conditions: [few] }] }, { entities: ["a", "b", "c"].map((id) => ({ kind: "note", id, record: {} })) });
	ok(graph.commit({ items: [remove("note", "c")] }));
	const r = no(graph.undo());
	assert.deepEqual([r.code, r.details.ruleKey, r.details.measure, r.details.sentence], ["condition-broken", "note.few", 1, "too many notes"]);
	assert.equal(graph.position(), 1);
});

test("an undo or redo is refused where an entity it writes no longer stands as the edit left it, another writer's change taken in", () => {
	const { graph, port } = open({ kinds: [{ kind: "note" }] }, { entities: [{ kind: "note", id: "n", record: { title: "A" } }, { kind: "note", id: "m", record: {} }] });
	ok(graph.commit({ items: [set("note", "n", { title: "B" })] }));
	const theirs = ok(port.change({ writes: [{ kind: "note", id: "m", record: { seen: true } }], expectedPosition: 1 }));
	ok(graph.applyChange({ position: theirs.position, items: port.changes(1).changes[0].writes }));
	ok(graph.undo());
	assert.deepEqual(records(graph, "note"), { n: { title: "A" }, m: { seen: true } }, "a change to another entity is no obstacle");
	ok(graph.redo());
	const later = ok(port.change({ writes: [{ kind: "note", id: "n", record: { title: "C" } }], expectedPosition: 4 }));
	ok(graph.applyChange({ position: later.position, items: port.changes(4).changes[0].writes }));
	const r = no(graph.undo());
	assert.deepEqual([r.code, r.details.subject, r.details.opIndex], ["history-superseded", "n", -1]);
	assert.deepEqual(records(graph, "note").n, { title: "C" }, "their change stands");
});

test("undoing a deletion recreates the entity under its own identity", () => {
	const { graph } = open({ kinds: LIBRARY }, { entities: [{ kind: "shelf", id: "s", record: { label: "S" } }, { kind: "book", id: "b", record: { shelf: "s" } }] });
	ok(graph.commit({ items: [remove("shelf", "s")] }));
	ok(graph.undo());
	assert.deepEqual(graph.get("shelf", "s").entity, { kind: "shelf", id: "s", record: { label: "S" } });
	assert.deepEqual(graph.referrersOf("s").referrers, [{ kind: "book", id: "b", field: "shelf" }]);
});

test("the history is bounded by a count, a size and a pin, each yielding at its hard limit, the oldest evicted first and the newest never", () => {
	const notes = { kinds: [{ kind: "note" }] };
	const counted = open(notes, { history: { count: 2 } }).graph;
	for (const id of ["a", "b", "c", "d"]) ok(counted.commit({ items: [create("note", id)] }));
	assert.deepEqual(counted.history().edits.map((e) => e.position), [3, 4]);
	assert.equal(counted.history().evicted, 2);
	const pinned = open(notes, { history: { count: 2, hardCount: 4, pin: ({ writes }) => writes.some((w) => w.id === "a") } }).graph;
	ok(pinned.commit({ items: [create("note", "a")] }));
	for (const id of ["b", "c", "d"]) ok(pinned.commit({ items: [create("note", id)] }));
	assert.deepEqual(pinned.history().edits.map((e) => e.position), [1, 2, 3, 4], "the oldest is pinned, so nothing younger goes ahead of it");
	ok(pinned.commit({ items: [create("note", "e")] }));
	assert.deepEqual(pinned.history().edits.map((e) => e.position), [4, 5], "past the hard limit the pin yields, the oldest first");
	const sized = open(notes, { history: { bytes: 1 } }).graph;
	ok(sized.commit({ items: [create("note", "a")] }));
	ok(sized.commit({ items: [create("note", "b")] }));
	assert.deepEqual(sized.history().edits.map((e) => e.position), [2], "never the newest, however large");
	assert.deepEqual(Object.values(no(createEntityGraph(notes, undefined, { port: createMemoryGraphPort(), history: { count: 5, hardCount: 2 } }))).slice(1, 2), ["invalid-options"]);
	assert.equal(no(createEntityGraph(notes, undefined, { port: createMemoryGraphPort(), history: { count: 5, hardCount: 2 } })).details.subject, "history.hardCount: invalid");
});

test("a plan taking more steps than the step limit is refused before its record is built", () => {
	const rings = [{ kind: "ring", references: [ref("next", ["ring"], "one", { onTargetDelete: "cascade-delete" })], consequences: [{ id: "c", phase: "later", trigger: { created: ["ring"] }, run: () => [] }] }];
	const g = createEntityGraph({ phases: ["later"], kinds: rings }, { position: 1, entities: Array.from({ length: 30000 }, (_, i) => ({ kind: "ring", id: `r${i}`, record: { next: i === 0 ? null : `r${i - 1}` } })) }).graph;
	const r = no(g.plan({ items: [remove("ring", "r0")] }));
	assert.deepEqual([r.code, r.details.ruleKey], ["too-many-steps", "steps"]);
	assert.ok(r.details.measure > 20000, `measure ${r.details.measure}`);
});

test("without a port a graph plans and takes changes in, and refuses to commit, undo or redo", () => {
	const g = createEntityGraph({ kinds: [{ kind: "note" }] }).graph;
	for (const r of [g.commit({ items: [create("note", "a")] }), g.undo(), g.redo()]) assert.equal(no(r).code, "no-store");
});
