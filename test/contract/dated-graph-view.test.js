// dated-graph-view - CONTRACT.md's row: answers what an entity refers to, what refers to it, and what can be reached
// from it by following references, each answer stating the store position it reflects and true of the entities as
// they stood at that position; asking changes nothing. M1 (docs/DECISIONS.md D10): changes are taken in, in position
// order, whole or not at all; the view is first filled from entities stated with their position (D12).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../../dist/index.js";
import { WORLD, del, put } from "../support/worlds.js";

const open = (options) => {
	const made = createEntityGraph(WORLD, options);
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return made.graph;
};
const ids = (list) => list.map((x) => x.id);

test("an empty view stands at position 0, and a first fill stands at the position it was stated with", () => {
	const empty = open();
	assert.equal(empty.position(), 0);
	assert.deepEqual(empty.all("book"), { ok: true, position: 0, entities: [] });
	const filled = open({ position: 7, entities: [put("shelf", "s1", { books: ["b1"] }), put("book", "b1", { shelf: "s1", tags: [] })] });
	assert.equal(filled.position(), 7);
	assert.deepEqual(filled.get("book", "b1"), { ok: true, position: 7, entity: { kind: "book", id: "b1", record: { shelf: "s1", tags: [] } } });
	assert.deepEqual(filled.referrersOf("b1"), { ok: true, position: 7, referrers: [{ kind: "shelf", id: "s1", field: "books" }] });
});

test("each answer states its position and is true of the entities at that position, before and after a change", () => {
	const g = open();
	assert.deepEqual(g.applyChange({ position: 3, items: [put("tag", "t1"), put("book", "b1", { tags: ["t1"] }), put("book", "b2", { tags: ["t1"] })] }), { ok: true, position: 3 });
	const before = g.referrersOf("t1");
	assert.deepEqual(before, { ok: true, position: 3, referrers: [{ kind: "book", id: "b1", field: "tags" }, { kind: "book", id: "b2", field: "tags" }] });
	assert.deepEqual(g.applyChange({ position: 5, items: [put("book", "b1", { tags: [] })] }), { ok: true, position: 5 });
	assert.deepEqual(g.referrersOf("t1"), { ok: true, position: 5, referrers: [{ kind: "book", id: "b2", field: "tags" }] });
	assert.deepEqual(before.referrers.map((r) => r.id), ["b1", "b2"], "an answer already given is not changed by a later change");
});

test("targetsOf answers each declared reference in declaration order and its targets in the order held, each with its kind, or null when absent", () => {
	const g = open({ position: 1, entities: [put("shelf", "s1"), put("tag", "t2"), put("book", "b1", { shelf: "s1", tags: ["t2", "t9"] })] });
	assert.deepEqual(g.targetsOf("b1"), { ok: true, position: 1, found: true, targets: [
		{ field: "shelf", id: "s1", kind: "shelf" }, { field: "tags", id: "t2", kind: "tag" }, { field: "tags", id: "t9", kind: null },
	] });
	assert.deepEqual(g.targetsOf("b1", "tags").targets.map((t) => t.id), ["t2", "t9"], "one field asked");
	assert.deepEqual(g.targetsOf("b404"), { ok: true, position: 1, found: false, targets: [] });
	assert.deepEqual(g.targetsOf("s1"), { ok: true, position: 1, found: true, targets: [] }, "a shelf holding no books");
});

test("referrersOf answers every referrer by kind, id and field, in id order, filtered by kinds and fields; a reference to an absent target is still answered", () => {
	const g = open({ position: 2, entities: [put("shelf", "s1", { books: ["b2"] }), put("book", "b2", { shelf: "s1", tags: [] }), put("book", "b1", { shelf: "s1", tags: [] })] });
	assert.deepEqual(ids(g.referrersOf("s1").referrers), ["b1", "b2"]);
	assert.deepEqual(g.referrersOf("b2", { kinds: ["book"] }).referrers, []);
	assert.deepEqual(g.referrersOf("b2", { fields: ["books"] }).referrers, [{ kind: "shelf", id: "s1", field: "books" }]);
	g.applyChange({ position: 3, items: [del("shelf", "s1")] });
	assert.deepEqual(ids(g.referrersOf("s1").referrers), ["b1", "b2"], "the books still hold s1 as the store does");
	assert.deepEqual(g.targetsOf("b1").targets[0], { field: "shelf", id: "s1", kind: null });
});

test("ownerOf answers every entity of the container kind holding the member, in id order", () => {
	const g = open({ position: 1, entities: [put("member", "m1"), put("member", "m2"), put("team", "red", { members: ["m1", "m2"] }), put("team", "blue", { members: ["m2"] })] });
	assert.deepEqual(g.ownerOf("m1", "team"), { ok: true, position: 1, owners: ["red"] });
	assert.deepEqual(g.ownerOf("m2", "team"), { ok: true, position: 1, owners: ["blue", "red"] }, "two containers: both answered (D13)");
	assert.deepEqual(g.ownerOf("m3", "team").owners, []);
});

test("reachable follows references outward, transitively, each identity once, the start only through a cycle, an absent target leading nowhere (D13)", () => {
	const g = open({ position: 4, entities: [
		put("task", "a", { waitsOn: ["b"], team: "t" }), put("task", "b", { waitsOn: ["c"] }), put("task", "c", { waitsOn: ["a", "gone"] }), put("team", "t", { members: [] }),
		put("task", "d", { waitsOn: ["b"] }),
	] });
	assert.deepEqual(g.reachable("a"), { ok: true, position: 4, reached: [
		{ kind: "task", id: "a" }, { kind: "task", id: "b" }, { kind: "task", id: "c" }, { kind: null, id: "gone" }, { kind: "team", id: "t" },
	] }, "the start, through the cycle; gone, held and absent");
	assert.deepEqual(ids(g.reachable("d").reached), ["a", "b", "c", "gone", "t"], "no cycle returns to d");
	assert.deepEqual(ids(g.reachable("a", { fields: ["waitsOn"] }).reached), ["a", "b", "c", "gone"], "following one field");
	assert.deepEqual(ids(g.reachable("a", { kinds: ["team"] }).reached), ["t"], "entering one kind; an absent target is of no kind");
	assert.deepEqual(g.reachable("gone").reached, [], "an absent entity holds nothing");
});

test("a change lands whole or not at all: one bad item refuses the change, naming it, and every answer stays as it was", () => {
	const g = open({ position: 1, entities: [put("tag", "t1")] });
	const r = g.applyChange({ position: 2, items: [put("book", "b1", { tags: ["t1"] }), put("vase", "v1")] });
	assert.equal(r.ok, false);
	assert.equal(r.refusal.part, "entity-graph");
	assert.equal(r.refusal.code, "undeclared-kind");
	assert.deepEqual(r.refusal.details, { ruleKey: "undeclared-kind", subject: "vase:v1", measure: 1, opIndex: 1, sentence: null });
	for (const k of ["what", "why", "fix"]) assert.equal(typeof r.refusal[k], "string");
	assert.equal(g.position(), 1);
	assert.deepEqual(g.referrersOf("t1").referrers, [], "the first item did not land either");
	assert.deepEqual(g.get("book", "b1").entity, null);
});

test("changes are taken in position order: a change at or before the view's position is refused", () => {
	const g = open({ position: 5 });
	for (const position of [5, 4, 0]) {
		const r = g.applyChange({ position, items: [put("tag", "t1")] });
		assert.equal(r.refusal?.code, "stale-position", `position ${position}`);
	}
	assert.equal(g.applyChange({ position: 9, items: [put("tag", "t1")] }).ok, true, "a later position, gaps allowed (D12)");
});

test("a change's items are checked: references held as declared, an identity in one kind, a delete of what exists, one item per entity", () => {
	const g = open({ position: 1, entities: [put("tag", "t1")] });
	const code = (items) => g.applyChange({ position: 2, items }).refusal?.code;
	assert.equal(code([put("book", "b1", { shelf: ["s1"] })]), "invalid-reference", "a one-reference holding a list");
	assert.equal(code([put("book", "b1", { tags: "t1" })]), "invalid-reference", "a many-reference holding a string");
	assert.equal(code([put("book", "b1", { tags: ["t1", "t1"] })]), "invalid-reference", "a many-reference holding one target twice");
	assert.equal(code([put("shelf", "t1")]), "identity-taken", "t1 is a tag");
	assert.equal(code([del("book", "b9")]), "not-found");
	assert.equal(code([put("tag", "t2"), del("tag", "t2")]), "duplicate-item");
	assert.equal(code([]), "empty-change");
	assert.equal(code([put("book", "b1", [1, 2])]), "not-plain", "a record that is no object");
	assert.equal(code([{ kind: "book", id: "", record: {} }]), "invalid-change", "an empty identity");
	assert.equal(g.position(), 1, "nothing landed");
});

test("a reference field the record leaves out, or sets to null where it holds one target, holds no target", () => {
	const g = open({ position: 1, entities: [put("shelf", "s1"), put("book", "b1", { shelf: null })] });
	assert.deepEqual(g.targetsOf("b1").targets, []);
	assert.deepEqual(g.referrersOf("s1").referrers, []);
});

test("asking changes nothing: an answer's record cannot be changed through it, and repeated asking answers the same", () => {
	const g = open({ position: 1, entities: [put("book", "b1", { tags: ["t1"] })] });
	const first = g.get("book", "b1");
	assert.throws(() => { first.entity.record.tags.push("t2"); }, TypeError, "a frozen record");
	assert.deepEqual(g.get("book", "b1"), first);
	assert.deepEqual(g.referrersOf("t1").referrers, [{ kind: "book", id: "b1", field: "tags" }]);
});

test("a record taken in is copied: changing the caller's object afterwards changes no answer", () => {
	const record = { tags: ["t1"] };
	const g = open();
	g.applyChange({ position: 1, items: [put("book", "b1", record)] });
	record.tags.push("t2");
	assert.deepEqual(g.targetsOf("b1").targets.map((t) => t.id), ["t1"]);
});

test("a question about an undeclared kind or field is refused in the shared form, not answered empty", () => {
	const g = open();
	for (const r of [g.get("vase", "v1"), g.all("vase"), g.ownerOf("m1", "vase"), g.targetsOf("b1", "colour"), g.referrersOf("t1", { kinds: ["vase"] }), g.reachable("a", { fields: ["colour"] })]) {
		assert.equal(r.ok, false);
		assert.equal(r.refusal.code, "invalid-query");
		assert.equal(r.refusal.details.opIndex, -1);
	}
});

test("all answers a kind's entities in id order", () => {
	const g = open({ position: 1, entities: [put("tag", "t2"), put("tag", "t1"), put("book", "b1")] });
	assert.deepEqual(ids(g.all("tag").entities), ["t1", "t2"]);
});

test("a change holds at most GRAPH_LIMITS.maxChangeItems items, entity-store's bound on a change's writes", async () => {
	const { GRAPH_LIMITS } = await import("../../dist/index.js");
	assert.equal(GRAPH_LIMITS.maxChangeItems, 2000);
	const g = open();
	const items = (n) => Array.from({ length: n }, (_, i) => put("tag", `t${i}`));
	assert.equal(g.applyChange({ position: 1, items: items(2001) }).refusal?.code, "too-many-items");
	assert.equal(g.applyChange({ position: 1, items: items(2000) }).ok, true);
	assert.equal(g.all("tag").entities.length, 2000);
});

test("an opening is not a change: a graph opens from more than GRAPH_LIMITS.maxChangeItems entities (D12)", () => {
	const entities = Array.from({ length: 5001 }, (_, i) => put("tag", `t${i}`));
	const made = createEntityGraph(WORLD, { position: 3, entities });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	assert.equal(made.graph.all("tag").entities.length, 5001);
	assert.equal(made.graph.position(), 3);
});

test("get answers an entity only under its own kind", () => {
	const g = open({ position: 1, entities: [put("book", "b1", { tags: [] })] });
	assert.deepEqual(g.get("shelf", "b1"), { ok: true, position: 1, entity: null }, "b1 is a book, not a shelf");
	assert.equal(g.get("book", "b1").entity?.id, "b1");
});
