// plan - planning an edit with the declared reference rules to a fixed point (CONTRACT.md `plan-graph-change`, *Reference
// rules*, *Judging and refusals*; docs/DECISIONS.md D15 to D18): an edit of creations, replacements, changes and removals is
// applied to a scratch layer over the view, the rules expanded until nothing more follows, the result judged by key and
// measure against the state the edit found, and answered as the steps applied, their reversal and the net writes -- or
// refused in the shared form, naming the rule, the entity concerned and the requested item that led there. Planning changes
// no answer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";

const ref = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });
const graph = (kinds, entities = [], position = 1) => {
	const made = createEntityGraph({ kinds }, { position, entities });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return made.graph;
};
const e = (kind, id, record = {}) => ({ kind, id, record });
// the requested items (D18): create one absent, change one present to a whole record, set its named fields, remove it
const create = (kind, id, record = {}) => ({ op: "create", kind, id, record });
const change = (kind, id, record = {}) => ({ op: "change", kind, id, record });
const set = (kind, id, patch) => ({ op: "set", kind, id, patch });
const remove = (kind, id) => ({ op: "remove", kind, id });
const accepted = (r) => {
	assert.equal(r.ok, true, JSON.stringify(r.refusal));
	return r;
};
const refused = (r) => {
	assert.equal(r.ok, false, `accepted: ${JSON.stringify(r.writes)}`);
	assert.equal(r.refusal.part, "entity-graph");
	for (const k of ["what", "why", "fix"]) assert.equal(typeof r.refusal[k], "string");
	return r.refusal;
};
// the net writes as `op kind:id`, and the records they put, by id
const net = (r) => r.writes.map((w) => `${w.op} ${w.kind}:${w.id}`);
const putOf = (r, id) => r.writes.find((w) => w.id === id && w.op === "put")?.record;
// every answer the view gives about these identities, to show planning changed none
const answers = (g, ids, kinds) => JSON.stringify([g.position(), ...kinds.map((k) => g.all(k)), ...ids.flatMap((id) => [g.referrersOf(id), g.targetsOf(id), g.reachable(id)])]);

const LIBRARY = [
	{ kind: "shelf", references: [ref("books", ["book"], "many")] },
	{ kind: "book", references: [ref("shelf", ["shelf"], "one", { onTargetDelete: "cascade-delete" }), ref("tags", ["tag"], "many", { onUnreferenced: "delete" })] },
	{ kind: "tag" },
];
const library = () => graph(LIBRARY, [
	e("shelf", "s1", { books: ["b1", "b2"] }), e("book", "b1", { shelf: "s1", tags: ["t1"] }), e("book", "b2", { shelf: "s1", tags: ["t1", "t2"] }),
	e("tag", "t1"), e("tag", "t2"), e("tag", "t3"),
]);

test("a plain edit is answered as its steps, their reversal and its net writes, at the view's position; planning changes no answer", () => {
	const g = library();
	const before = answers(g, ["s1", "b1", "b2", "t1", "t3"], ["shelf", "book", "tag"]);
	const r = accepted(g.plan({ items: [create("tag", "t4", { label: "new" }), set("book", "b1", { title: "One" })] }));
	assert.equal(r.position, 1);
	assert.deepEqual(r.steps, [
		{ op: "put", kind: "tag", id: "t4", record: { label: "new" } },
		{ op: "put", kind: "book", id: "b1", record: { shelf: "s1", tags: ["t1"], title: "One" } },
	]);
	assert.deepEqual(r.inverse, [
		{ op: "put", kind: "book", id: "b1", record: { shelf: "s1", tags: ["t1"] } },
		{ op: "del", kind: "tag", id: "t4" },
	], "the reversal, step by step, in the order that undoes them");
	assert.deepEqual(net(r), ["put tag:t4", "put book:b1"]);
	assert.equal(answers(g, ["s1", "b1", "b2", "t1", "t3"], ["shelf", "book", "tag"]), before, "planning changed no answer");
	assert.equal(g.get("book", "b1").entity.record.title, undefined);
});

test("onTargetDelete: cascade-delete removes each referrer, to a fixed point; unlink removes the target from a list", () => {
	const g = library();
	const r = accepted(g.plan({ items: [remove("shelf", "s1")] }));
	assert.deepEqual(net(r).sort(), ["del book:b1", "del book:b2", "del shelf:s1", "del tag:t1", "del tag:t2"].sort(), "the books go with their shelf, and the tags they alone held");
	const u = accepted(g.plan({ items: [remove("book", "b2")] }));
	assert.deepEqual(putOf(u, "s1"), { books: ["b1"] }, "the shelf's list loses b2");
	assert.ok(net(u).includes("del tag:t2"), "t2, held by b2 alone, left unreferenced and deleted");
	assert.ok(!net(u).includes("del tag:t1"), "t1 is still held by b1");
});

test("onTargetDelete: unlink of the only target of a one-target reference leaves null (D16)", () => {
	const g = graph([{ kind: "pin", references: [ref("on", ["board"], "one")] }, { kind: "board" }], [e("board", "x"), e("pin", "p", { on: "x", label: "kept" })]);
	const r = accepted(g.plan({ items: [remove("board", "x")] }));
	assert.deepEqual(putOf(r, "p"), { on: null, label: "kept" });
});

test("onTargetDelete: refuse refuses the deletion, naming the rule, the referrer the caller never named, and the item", () => {
	const g = graph([{ kind: "note", references: [ref("about", ["topic"], "one", { onTargetDelete: "refuse" })] }, { kind: "topic" }], [e("topic", "x"), e("topic", "y"), e("note", "n1", { about: "x" })]);
	const refusal = refused(g.plan({ items: [create("topic", "z"), remove("topic", "x")] }));
	assert.equal(refusal.code, "rule-broken");
	assert.deepEqual(refusal.details, { ruleKey: "note.about.onTargetDelete", subject: "n1", measure: 1, opIndex: 1, sentence: null });
	assert.equal(accepted(g.plan({ items: [set("note", "n1", { about: "y" }), remove("topic", "x")] })).ok, true, "repointed first in the same edit: judged on the state it leaves");
});

test("a cascade through a cycle ends: each entity is deleted once", () => {
	const kinds = [{ kind: "ring", references: [ref("next", ["ring"], "one", { onTargetDelete: "cascade-delete" })] }];
	const g = graph(kinds, [e("ring", "a", { next: "b" }), e("ring", "b", { next: "c" }), e("ring", "c", { next: "a" }), e("ring", "d", { next: "d" })]);
	const r = accepted(g.plan({ items: [remove("ring", "a")] }));
	assert.deepEqual(net(r).sort(), ["del ring:a", "del ring:b", "del ring:c"]);
	assert.deepEqual(accepted(g.plan({ items: [remove("ring", "d")] })).writes.length, 1, "a self-reference ends too");
});

test("deleting a target and creating it again in one edit cascades nothing: the edit is judged on the state it leaves", () => {
	const g = library();
	const r = accepted(g.plan({ items: [remove("shelf", "s1"), create("shelf", "s1", { books: ["b1", "b2"] })] }));
	assert.deepEqual(net(r), [], "the shelf stands as it was");
	assert.equal(r.steps.length, 2, "both requested steps applied");
});

const PROJECT = [
	{ kind: "team", references: [ref("members", ["member"], "many", { exclusivity: "steal", min: 2, onBelowMin: "cascade-delete" })] },
	{ kind: "member" },
];
const project = () => graph(PROJECT, [e("member", "m1"), e("member", "m2"), e("member", "m3"), e("member", "m4"), e("team", "red", { members: ["m1", "m2"] }), e("team", "blue", { members: ["m3", "m4"] })]);

test("exclusivity: steal takes the target from the referrer that held it; onBelowMin: cascade-delete deletes one left below its minimum", () => {
	const g = project();
	const r = accepted(g.plan({ items: [set("team", "blue", { members: ["m3", "m4", "m1"] })] }));
	assert.deepEqual(net(r), ["put team:blue", "del team:red"], "red loses m1, falls below two, and is deleted");
	const g2 = graph(PROJECT, [e("member", "m1"), e("member", "m2"), e("member", "m3"), e("member", "m4"), e("member", "m5"), e("team", "red", { members: ["m1", "m2", "m5"] }), e("team", "blue", { members: ["m3", "m4"] })]);
	const s = accepted(g2.plan({ items: [set("team", "blue", { members: ["m3", "m4", "m1"] })] }));
	assert.deepEqual(putOf(s, "red"), { members: ["m2", "m5"] }, "red keeps two");
});

test("exclusivity: refuse refuses a second holder, naming the target; two new holders of one target cannot steal from each other", () => {
	const kinds = [{ kind: "desk", references: [ref("seat", ["chair"], "one", { exclusivity: "refuse" })] }, { kind: "chair" }];
	const g = graph(kinds, [e("chair", "c1"), e("desk", "d1", { seat: "c1" })]);
	const refusal = refused(g.plan({ items: [create("desk", "d2", { seat: "c1" })] }));
	assert.deepEqual(refusal.details, { ruleKey: "desk.seat.exclusivity", subject: "c1", measure: 1, opIndex: 0, sentence: null });
	const g2 = project();
	const both = refused(g2.plan({ items: [create("team", "green", { members: ["m1", "m3"] }), create("team", "gold", { members: ["m1", "m4"] })] }));
	assert.equal(both.details.ruleKey, "team.members.exclusivity");
	assert.equal(both.details.subject, "m1");
	assert.equal(both.details.opIndex, 1, "the item that made the second new holder");
});

test("min with onBelowMin: refuse refuses an entity left below it; a partial repair is allowed, a worsening is not", () => {
	const kinds = [{ kind: "crew", references: [ref("hands", ["sailor"], "many", { min: 3, onBelowMin: "refuse" })] }, { kind: "sailor" }];
	const g = graph(kinds, [e("sailor", "a"), e("sailor", "b"), e("sailor", "c"), e("crew", "k", { hands: ["a"] }), e("crew", "full", { hands: ["a", "b", "c"] })]);
	assert.equal(accepted(g.plan({ items: [set("crew", "k", { hands: ["a", "b"] })] })).ok, true, "k was two short, now one: a partial repair");
	assert.equal(accepted(g.plan({ items: [create("sailor", "d")] })).ok, true, "an edit elsewhere is not refused for k's standing breach");
	const worse = refused(g.plan({ items: [set("crew", "k", { hands: [] })] }));
	assert.deepEqual(worse.details, { ruleKey: "crew.hands.min", subject: "k", measure: 3, opIndex: 0, sentence: null });
	const unlinked = refused(g.plan({ items: [remove("sailor", "c")] }));
	assert.deepEqual([unlinked.details.ruleKey, unlinked.details.subject, unlinked.details.opIndex], ["crew.hands.min", "full", 0], "full falls below three when c is unlinked");
});

test("onUnreferenced: delete removes a target the edit left unreferenced, not one that never had a referrer; keep is the default", () => {
	const g = library();
	const r = accepted(g.plan({ items: [set("book", "b2", { tags: ["t1"] })] }));
	assert.deepEqual(net(r), ["put book:b2", "del tag:t2"]);
	assert.ok(!net(accepted(g.plan({ items: [create("tag", "t5")] }))).includes("del tag:t5"), "a new tag no one holds is not deleted");
	assert.ok(net(accepted(g.plan({ items: [create("book", "b3", { shelf: "s1", tags: ["t3"] }), set("book", "b3", { tags: [] })] }))).includes("del tag:t3"), "t3 had a referrer within the edit, then none: deleted");
	const keep = graph([{ kind: "box", references: [ref("items", ["item"], "many")] }, { kind: "item" }], [e("item", "i"), e("box", "x", { items: ["i"] })]);
	assert.deepEqual(net(accepted(keep.plan({ items: [set("box", "x", { items: [] })] }))), ["put box:x"]);
});

test("a reference to an absent identity, or to a kind it may not target, is refused when the edit introduces it, and stands when it was there before", () => {
	const kinds = [{ kind: "pointer", references: [ref("to", ["end"], "one")] }, { kind: "end" }, { kind: "other" }];
	const g = graph(kinds, [e("end", "x"), e("other", "o"), e("pointer", "old", { to: "gone" })]);
	assert.deepEqual(refused(g.plan({ items: [create("pointer", "n", { to: "nowhere" })] })).details, { ruleKey: "pointer.to.targets", subject: "n", measure: 1, opIndex: 0, sentence: null });
	assert.equal(refused(g.plan({ items: [create("pointer", "n", { to: "o" })] })).details.ruleKey, "pointer.to.targets", "o is of a kind the reference may not target");
	assert.equal(accepted(g.plan({ items: [create("end", "y")] })).ok, true, "old's dangling reference was there before");
	assert.equal(accepted(g.plan({ items: [set("pointer", "old", { to: "x" })] })).ok, true, "and repairing it is allowed");
});

test("a fault in the request is refused at the item that faults", () => {
	const g = library();
	const at = (items) => { const r = refused(g.plan({ items })); return [r.code, r.details.opIndex]; };
	assert.deepEqual(at([create("tag", "t9"), { op: "move", kind: "tag", id: "t1" }]), ["unknown-operation", 1]);
	assert.deepEqual(at([set("tag", "t9", { label: "x" })]), ["entity-absent", 0], "a change to an entity absent at that point");
	assert.deepEqual(at([remove("tag", "t1"), remove("tag", "t1")]), ["entity-absent", 1], "absent at that point in the edit");
	assert.deepEqual(at([create("vase", "v1")]), ["undeclared-kind", 0]);
	assert.deepEqual(at([create("tag", "t9"), create("tag", "t9")]), ["entity-present", 1], "a create of an entity present at that point");
	assert.deepEqual(at([change("tag", "t9", {})]), ["entity-absent", 0], "a change of one absent");
	const fault = refused(g.plan({ items: [create("tag", "t9"), create("shelf", "t9")] })).details;
	assert.deepEqual(fault, { ruleKey: "identity-taken", subject: "t9", measure: 1, opIndex: 1, sentence: null }, "a fault keyed by its code, naming the item's identity");
	assert.equal(refused(g.plan({ items: [create("book", "b9", { tags: "t1" })] })).details.ruleKey, "book.tags.holds", "a reference in the wrong form keyed by its field's holds");
	assert.deepEqual(at([create("shelf", "t1")]), ["identity-taken", 0]);
	assert.deepEqual(at([create("book", "b9", { tags: "t1" })]), ["invalid-reference", 0]);
	assert.deepEqual(at([create("tag", "t9"), create("tag", "t8", [1])]), ["not-plain", 1]);
	assert.deepEqual(at([{ op: "create", kind: "tag", id: "" }]), ["invalid-edit", 0], "no identity, and no record");
	assert.deepEqual(at([{ op: "put", kind: "tag", id: "t9", record: {} }]), ["unknown-operation", 0], "put is no operation of an edit (D18)");
	assert.equal(refused(g.plan({ items: [] })).code, "empty-edit");
	assert.equal(refused(g.plan({ items: [create("tag", "t9")], extra: 1 })).code, "invalid-edit");
	assert.equal(refused(g.plan(null)).code, "invalid-edit");
});

test("bounds: at most 2,000 requested items, and at most 2,000 net writes after the rules, refused naming the bound", () => {
	const g = library();
	const many = Array.from({ length: 2001 }, (_, i) => create("tag", `x${i}`));
	assert.equal(refused(g.plan({ items: many })).code, "too-many-items");
	const kinds = [{ kind: "hub" }, { kind: "spoke", references: [ref("hub", ["hub"], "one", { onTargetDelete: "cascade-delete" })] }];
	const wide = graph(kinds, [e("hub", "h"), ...Array.from({ length: 2000 }, (_, i) => e("spoke", `s${i}`, { hub: "h" }))]);
	const r = refused(wide.plan({ items: [remove("hub", "h")] }));
	assert.equal(r.code, "too-many-writes");
	assert.deepEqual(r.details, { ruleKey: "net-writes", subject: "bound 2000", measure: 2001, opIndex: -1, sentence: null });
	assert.equal(accepted(wide.plan({ items: [remove("spoke", "s0")] })).writes.length, 1);
});

test("an entity written more than once is one net write; the steps keep each, and the reversal undoes them in order", () => {
	const g = library();
	const r = accepted(g.plan({ items: [set("book", "b1", { title: "A" }), set("book", "b1", { title: "B" }), remove("tag", "t3")] }));
	assert.equal(r.steps.length, 3);
	assert.deepEqual(r.writes, [{ op: "put", kind: "book", id: "b1", record: { shelf: "s1", tags: ["t1"], title: "B" } }, { op: "del", kind: "tag", id: "t3" }]);
	assert.deepEqual(r.inverse.map((s) => `${s.op} ${s.id} ${s.record?.title ?? ""}`), ["put t3 ", "put b1 A", "put b1 "]);
});

test("the same edit planned twice is answered alike", () => {
	const g = project();
	const edit = { items: [set("team", "blue", { members: ["m3", "m4", "m1"] }), create("member", "m9")] };
	assert.deepEqual(g.plan(edit), g.plan(edit));
});
