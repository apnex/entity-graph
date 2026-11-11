// plain-inputs - every input is read once, as plain data, through shape-check's plain-JSON reading, before anything of it is
// used (docs/DECISIONS.md D10): a change, an opening, a declaration's data and a filter holding a getter, or a Proxy whose
// trap throws, are refused in the shared form, never thrown; a value read twice cannot answer differently; an array whose
// own methods are replaced is refused rather than read through them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";
import { WORLD } from "./support/worlds.js";

const open = () => createEntityGraph(WORLD).graph;
const throwing = () => new Proxy({}, { ownKeys() { throw new Error("trap"); }, get() { throw new Error("trap"); }, getOwnPropertyDescriptor() { throw new Error("trap"); } });
const refusedWith = (r, code) => {
	assert.equal(r.ok, false, "accepted");
	assert.equal(r.refusal.part, "entity-graph");
	assert.equal(r.refusal.code, code);
	return r.refusal;
};

test("a change holding a getter, or a Proxy whose trap throws, is refused and lands nothing", () => {
	const g = open();
	refusedWith(g.applyChange({ get position() { throw new Error("boom"); }, items: [{ kind: "tag", id: "t1", record: {} }] }), "invalid-change");
	refusedWith(g.applyChange(throwing()), "invalid-change");
	assert.equal(refusedWith(g.applyChange({ position: 1, items: [{ kind: "tag", id: "t1", get record() { return {}; } }] }), "not-plain").details.opIndex, 0);
	assert.equal(g.position(), 0);
	assert.deepEqual(g.all("tag").entities, []);
});

test("a position is read once: a getter answering 1 and then 1.5 cannot slip past the check", () => {
	const g = open();
	let reads = 0;
	const change = { get position() { reads++; return reads === 1 ? 1 : 1.5; }, items: [{ kind: "tag", id: "t1", record: {} }] };
	refusedWith(g.applyChange(change), "invalid-change");
	assert.equal(g.position(), 0, "no position of 1.5, or of Infinity, is taken");
	const infinite = { get position() { return Infinity; }, items: [{ kind: "tag", id: "t2", record: {} }] };
	refusedWith(g.applyChange(infinite), "invalid-change");
	assert.equal(g.position(), 0);
});

test("an items list whose own entries method is replaced is refused, not read through it: no 3,000 items land past the bound", () => {
	const g = open();
	const items = [{ kind: "tag", id: "t0", record: {} }];
	items.entries = function* () { for (let i = 0; i < 3000; i++) yield [i, { kind: "tag", id: `t${i}`, record: {} }]; };
	refusedWith(g.applyChange({ position: 1, items }), "invalid-change");
	assert.deepEqual(g.all("tag").entities, []);
});

test("an opening that is null, holds a getter, or is a Proxy whose trap throws, is refused", () => {
	refusedWith(createEntityGraph(WORLD, null), "invalid-opening");
	refusedWith(createEntityGraph(WORLD, { get entities() { throw new Error("boom"); } }), "invalid-opening");
	refusedWith(createEntityGraph(WORLD, throwing()), "invalid-opening");
	assert.deepEqual(refusedWith(createEntityGraph(WORLD, { position: 1, entities: [{ kind: "tag", id: "t1", get record() { return {}; } }] }), "invalid-opening").details, { ruleKey: "invalid-opening", subject: "opening.entities[0]", measure: 1, opIndex: 0, sentence: null });
	assert.equal(createEntityGraph(WORLD, undefined).ok, true, "no opening at all opens an empty graph at 0");
});

test("a declaration holding a getter, or a Proxy whose trap throws, is refused, not thrown", () => {
	refusedWith(createEntityGraph({ get kinds() { throw new Error("boom"); } }), "invalid-declaration");
	refusedWith(createEntityGraph(throwing()), "invalid-declaration");
	refusedWith(createEntityGraph({ kinds: [{ kind: "box", get references() { throw new Error("boom"); } }] }), "invalid-declaration");
	refusedWith(createEntityGraph({ kinds: [{ kind: "box", references: [{ field: "items", get targets() { return ["box"]; }, holds: "many", onTargetDelete: "unlink" }] }] }), "invalid-declaration");
	refusedWith(createEntityGraph({ kinds: [throwing()] }), "invalid-declaration");
});

test("a filter holding a getter, or a Proxy whose trap throws, is refused as a question", () => {
	const g = open();
	for (const filter of [{ get kinds() { throw new Error("boom"); } }, throwing(), { fields: Object.defineProperty([], "0", { get() { return "books"; }, enumerable: true }) }]) {
		refusedWith(g.referrersOf("t1", filter), "invalid-query");
		refusedWith(g.reachable("a", filter), "invalid-query");
	}
});

/*
Where the plain-data reading failed is said: the input is read once, part by part -- a change's own members, its list of items,
then each item as plain JSON -- so the first part that is not plain data is the one named, the item's index as `opIndex`, the
reference's index in a declaration (the build plan's vision: a refusal says which part of the edit led there).
*/
test("a value that is not plain data in the fourth item of a change is refused at that item, as not-plain", () => {
	const g = open();
	const items = [0, 1, 2].map((i) => ({ kind: "tag", id: `t${i}`, record: {} }));
	items.push({ kind: "tag", id: "t3", record: { get label() { return "x"; } } });
	const refusal = refusedWith(g.applyChange({ position: 1, items }), "not-plain");
	assert.deepEqual(refusal.details, { ruleKey: "not-plain", subject: "items[3]", measure: 1, opIndex: 3, sentence: null });
	assert.deepEqual(g.all("tag").entities, [], "nothing landed");
});

test("a reference that is not plain data in a declaration is refused naming its kind and its index among the references", () => {
	const references = [{ field: "first", targets: ["b"], holds: "one", onTargetDelete: "unlink" }, { field: "second", get targets() { return ["b"]; }, holds: "one", onTargetDelete: "unlink" }];
	const made = createEntityGraph({ kinds: [{ kind: "a", references }, { kind: "b" }] });
	assert.equal(refusedWith(made, "invalid-declaration").details.subject, "a.references[1]: invalid");
});

test("an opening's entity that is not plain data is refused at its index", () => {
	const entities = [{ kind: "tag", id: "t0", record: {} }, { kind: "tag", id: "t1", record: {} }, { kind: "tag", id: "t2", record: { get label() { return "x"; } } }];
	const refusal = refusedWith(createEntityGraph(WORLD, { position: 1, entities }), "invalid-opening");
	assert.deepEqual([refusal.details.subject, refusal.details.opIndex], ["opening.entities[2]", 2]);
});

test("a change holding a member other than position and items -- an extra field, an own __proto__ -- is refused, as an opening is", () => {
	const g = open();
	const extra = refusedWith(g.applyChange({ position: 1, items: [{ kind: "tag", id: "t1", record: {} }], extra: true }), "invalid-change");
	assert.equal(extra.details.subject, "change.extra");
	const proto = JSON.parse('{"position": 1, "items": [{"kind": "tag", "id": "t1", "record": {}}], "__proto__": {"x": 1}}');
	assert.equal(refusedWith(g.applyChange(proto), "invalid-change").details.subject, "change.__proto__");
	assert.equal(refusedWith(createEntityGraph(WORLD, { position: 1, extra: true }), "invalid-opening").details.subject, "opening.extra", "the opening, as before");
	assert.deepEqual(g.all("tag").entities, []);
});
