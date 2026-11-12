// resolvers - intent resolvers and the edit context (CONTRACT.md *Intent resolvers*, *Edit context*; docs/DECISIONS.md D26 to
// D28): a kind's resolver rewrites each requested item of its kind into the writes it stands for, against the edit as the items
// before it left it, its writes checked as items are and carrying the item's index; the context is read once as plain JSON and
// handed to consequences, conditions and resolvers alike, never interpreted; and an edit whose every item resolves to nothing
// is a plan that changes nothing (Q8).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";

const DIALECT = "urn:apnex:shape-check:dialect:1";
const make = (declaration, entities = []) => {
	const made = createEntityGraph(declaration, { position: 1, entities });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return made.graph;
};
const e = (kind, id, record = {}) => ({ kind, id, record });
const create = (kind, id, record = {}) => (id === undefined ? { op: "create", kind, record } : { op: "create", kind, id, record });
const set = (kind, id, patch) => ({ op: "set", kind, id, patch });
const remove = (kind, id) => ({ op: "remove", kind, id });
const accepted = (r) => {
	assert.equal(r.ok, true, JSON.stringify(r.refusal));
	return r;
};
const refused = (r) => {
	assert.equal(r.ok, false, `accepted: ${JSON.stringify(r.writes)}`);
	assert.equal(r.refusal.part, "entity-graph");
	return r.refusal;
};
const facts = (refusal) => ({ code: refusal.code, ...refusal.details });
const puts = (r) => Object.fromEntries(r.writes.filter((w) => w.op === "put").map((w) => [w.id, w.record]));
const everything = (g, kinds) => JSON.stringify([g.position(), ...kinds.map((k) => g.all(k))]);
const SHAPE = { $schema: DIALECT, type: "object", properties: { title: { type: "string" }, place: { type: "string" } }, required: ["title"], additionalProperties: false };

// a created note without an identity is named n<k>, one past the highest in use, and placed where the context says, else the inbox
const name = ({ item, graph, context }) => {
	if (item.op !== "create" || item.id !== undefined) return [item];
	const used = graph.all("note").map((x) => Number(/^n(\d+)$/.exec(x.id)?.[1] ?? 0));
	return [{ op: "create", kind: "note", id: `n${Math.max(0, ...used) + 1}`, record: { place: context?.place ?? "inbox", ...item.record } }];
};

test("a resolver rewrites each item of its kind against the edit as the items before it left it, its writes applied in its place", () => {
	const g = make({ kinds: [{ kind: "note", shape: SHAPE, intentResolver: name }, { kind: "tag" }] }, [e("note", "n1", { title: "Old" })]);
	const r = accepted(g.plan({ items: [create("note", undefined, { title: "A" }), create("tag", "t1"), create("note", undefined, { title: "B" })] }, { context: { place: "desk" } }));
	assert.deepEqual(puts(r), { n2: { place: "desk", title: "A" }, t1: {}, n3: { place: "desk", title: "B" } }, "n3 named after n2, which the item before it made");
	assert.deepEqual(r.steps.map((x) => `${x.op} ${x.id}`), ["put n2", "put t1", "put n3"]);
	assert.deepEqual(puts(accepted(g.plan({ items: [create("note", undefined, { title: "C" })] }))), { n2: { place: "inbox", title: "C" } }, "no context: undefined to the resolver");
	assert.equal(g.get("note", "n2").entity, null, "planning changed nothing");
});

test("a resolver is called once per item of its kind, in item order, before the item is checked; an item of another kind is applied as given", () => {
	const calls = [];
	const record = ({ item }) => (calls.push(`${item.op} ${item.id ?? "?"}`), [item]);
	const g = make({ kinds: [{ kind: "note", intentResolver: record }, { kind: "tag" }] }, [e("note", "a")]);
	accepted(g.plan({ items: [create("tag", "t"), set("note", "a", { x: 1 }), create("note", "b"), remove("note", "b")] }));
	assert.deepEqual(calls, ["set a", "create b", "remove b"]);
	calls.length = 0;
	assert.equal(refused(g.plan({ items: [set("note", "ghost", { x: 1 })] })).code, "entity-absent", "handed the item first, then its writes checked");
	assert.deepEqual(calls, ["set ghost"]);
});

test("a resolver's writes are checked as items are and carry the item's index; they may write another declared kind", () => {
	const spoil = ({ item }) => (item.id === "bad" ? [{ ...item, record: { title: 7 } }] : [item, create("tag", `tag-${item.id}`)]);
	const g = make({ kinds: [{ kind: "note", shape: SHAPE, intentResolver: spoil }, { kind: "tag" }] }, [e("note", "a", { title: "A" })]);
	assert.deepEqual(facts(refused(g.plan({ items: [create("note", "ok", { title: "T" }), create("note", "bad", { title: "T" })] }))), { code: "shape-misfit", ruleKey: "note.shape", subject: "bad", measure: 1, opIndex: 1, sentence: null }, "refused at item 1, as a requested write would be");
	assert.deepEqual(Object.keys(puts(accepted(g.plan({ items: [create("note", "ok", { title: "T" })] })))), ["ok", "tag-ok"]);
	assert.deepEqual(facts(refused(g.plan({ items: [create("note", "x", { title: "T" }), create("note", "a", { title: "T" })] }))), { code: "entity-present", ruleKey: "entity-present", subject: "a", measure: 1, opIndex: 1, sentence: null }, "a fault of the edit's state, as the item's");
	const to = make({ kinds: [{ kind: "note", references: [{ field: "to", targets: ["note"], holds: "one", onTargetDelete: "unlink" }], intentResolver: name }] });
	assert.deepEqual(facts(refused(to.plan({ items: [create("note", undefined, { title: "A" }), create("note", undefined, { title: "B", to: "ghost" })] }))), { code: "rule-broken", ruleKey: "note.to.targets", subject: "n2", measure: 1, opIndex: 1, sentence: null }, "a breach judged on the result names the item its write carries");
});

test("a resolver that throws, answers what is not plain data, writes malformed items or an undeclared kind is refused naming it, and the view is as it was", () => {
	const outcome = (resolver, items = [create("note", "b", { title: "B" })]) => {
		const g = make({ kinds: [{ kind: "note", intentResolver: resolver }, { kind: "tag" }] }, [e("note", "a", { title: "A" })]);
		const before = everything(g, ["note", "tag"]);
		const r = g.plan({ items });
		assert.equal(everything(g, ["note", "tag"]), before);
		return r.ok ? "accepted" : facts(r.refusal);
	};
	assert.deepEqual(outcome(() => { throw new Error("no"); }), { code: "resolver-failed", ruleKey: "note.intentResolver", subject: "b", measure: 1, opIndex: 0, sentence: null });
	assert.deepEqual(outcome(() => { throw new Error("no"); }, [create("tag", "t"), create("note", undefined, {})]), { code: "resolver-failed", ruleKey: "note.intentResolver", subject: "items[1]", measure: 1, opIndex: 1, sentence: null }, "an item without an identity, named by its place");
	for (const [what, answer] of [["a function", () => 1], ["a class's instance", new Map()], ["a promise", Promise.resolve([])], ["one write, not a list", create("note", "b")]]) assert.equal(outcome(() => answer).code, "resolver-failed", what);
	assert.equal(outcome(({ item }) => { item.record.title = "Z"; return [item]; }).code, "resolver-failed", "the item it was handed");
	assert.equal(outcome(({ graph }) => { graph.all("note").push(1); return []; }).code, "resolver-failed", "a list it read");
	assert.deepEqual(outcome(() => [{ op: "move", kind: "note", id: "b" }]), { code: "unknown-operation", ruleKey: "note.intentResolver", subject: "b", measure: 1, opIndex: 0, sentence: null });
	assert.deepEqual(outcome(() => [{ op: "create", kind: "note", record: {} }]), { code: "invalid-edit", ruleKey: "note.intentResolver", subject: "items[0].writes[0]", measure: 1, opIndex: 0, sentence: null }, "a write it left unnamed");
	assert.deepEqual(outcome(() => [create("vase", "v")]), { code: "undeclared-kind", ruleKey: "note.intentResolver", subject: "v", measure: 1, opIndex: 0, sentence: null });
	let kept = null;
	assert.equal(outcome(({ graph, item }) => { kept = graph; return [item]; }), "accepted");
	assert.throws(() => kept.all("note"), /no longer/);
	assert.equal(createEntityGraph({ kinds: [{ kind: "note", intentResolver: "name" }] }).refusal.details.subject, "note.intentResolver: invalid");
});

test("Q8: an edit whose every item resolves to nothing is a plan that changes nothing; an edit of no items is still refused", () => {
	// a removal of an absent note, and a creation of one already as asked, resolve to nothing
	const tidy = ({ item, graph }) => {
		const held = graph.get("note", item.id);
		if (item.op === "remove" && held === null) return [];
		if (item.op === "create" && held !== null && JSON.stringify(held.record) === JSON.stringify(item.record)) return [];
		return [item];
	};
	const g = make({ kinds: [{ kind: "note", intentResolver: tidy }] }, [e("note", "a", { title: "A" })]);
	assert.deepEqual(accepted(g.plan({ items: [remove("note", "ghost"), create("note", "a", { title: "A" })] })), { ok: true, position: 1, steps: [], inverse: [], writes: [] });
	assert.deepEqual(accepted(g.plan({ items: [remove("note", "ghost"), create("note", "b", { title: "B" })] })).writes.map((w) => w.id), ["b"]);
	assert.equal(refused(g.plan({ items: [] })).code, "empty-edit");
});

test("the context is read once as plain JSON before any item and handed, frozen and as given, to every consequence, condition and resolver", () => {
	const seen = [];
	const look = (who) => (input) => (seen.push([who, input.context]), who === "resolver" ? [input.item] : []);
	const g = make({
		phases: ["first"],
		kinds: [{ kind: "note", intentResolver: look("resolver"), consequences: [{ id: "c", phase: "first", trigger: { created: ["note"] }, run: look("consequence") }], conditions: [{ id: "k", check: look("condition") }] }],
	});
	const context = { place: "desk", marks: ["a", { b: null }], ratio: 1.5, draft: true };
	accepted(g.plan({ items: [create("note", "x")] }, { context }));
	assert.deepEqual(seen.map(([who]) => who), ["resolver", "consequence", "condition", "condition"], "the condition on the state the edit found and on the one it would leave");
	for (const [who, got] of seen) assert.deepEqual(got, context, who);
	assert.ok(seen.every(([, got]) => got === seen[0][1] && Object.isFrozen(got) && Object.isFrozen(got.marks[1])), "one frozen copy, read once");
	seen.length = 0;
	accepted(g.plan({ items: [create("note", "x")] }, { context: null }));
	assert.deepEqual(seen.map(([, got]) => got), [null, null, null, null], "null is a context");
	const spoil = make({ kinds: [{ kind: "note", intentResolver: ({ item, context: c }) => { c.place = "x"; return [item]; } }] });
	assert.equal(refused(spoil.plan({ items: [create("note", "x")] }, { context: { place: "desk" } })).code, "resolver-failed", "a context cannot be changed");
});

test("a context that is not plain JSON is refused, of the edit as a whole, before any item; another option is refused by name", () => {
	const g = make({ kinds: [{ kind: "note" }] });
	const cycle = { a: 1 };
	cycle.self = cycle;
	const expected = { code: "invalid-context", ruleKey: "invalid-context", subject: "context", measure: 1, opIndex: -1, sentence: null };
	assert.deepEqual(facts(refused(g.plan({ items: [create("note", "x")] }, { context: { f() {} } }))), expected);
	assert.deepEqual(facts(refused(g.plan({ items: [create("note", "x")] }, { context: cycle }))), expected);
	assert.deepEqual(facts(refused(g.plan({ items: [remove("note", "ghost")] }, { context: new Map() }))), expected, "before the item that faults");
	assert.deepEqual(facts(refused(g.plan({ items: [create("note", "x")] }, { context: 1, mode: "fast" }))).subject, "options.mode");
});

test("a condition is judged with the plan's context on the state the edit found and on the one it would leave", () => {
	const crowd = { id: "crowd", check: ({ graph, context }) => { const n = graph.all("note").length, limit = context?.limit ?? 1; return n > limit ? [{ subject: "all", measure: n - limit, sentence: `${n} notes, at most ${limit}` }] : []; } };
	const g = make({ kinds: [{ kind: "note", conditions: [crowd] }] }, [e("note", "a"), e("note", "b")]);
	const add = (context) => g.plan({ items: [create("note", "c")] }, context === undefined ? undefined : { context });
	assert.equal(accepted(add({ limit: 3 })).ok, true, "three notes, at most three");
	assert.deepEqual(facts(refused(add({ limit: 1 }))), { code: "condition-broken", ruleKey: "note.crowd", subject: "all", measure: 2, opIndex: -1, sentence: "3 notes, at most 1" }, "two too many where it found one");
	assert.equal(accepted(add({ limit: 3 })).ok, true, "and the reading of the state it found is not carried from one context to another");
	assert.equal(refused(add()).details.sentence, "3 notes, at most 1");
});

test("two contexts that differ only in the order of their keys are two contexts to a condition (D31)", () => {
	const first = { id: "first", check: ({ context }) => (context === undefined ? [] : [{ subject: Object.keys(context)[0], measure: 1, sentence: `first key ${Object.keys(context)[0]}` }]) };
	const g = make({ kinds: [{ kind: "note", conditions: [first] }] });
	assert.equal(accepted(g.plan({ items: [create("note", "a")] }, { context: { x: 1, y: 2 } })).ok, true, "the same breach before and after: none new");
	assert.equal(accepted(g.plan({ items: [create("note", "a")] }, { context: { y: 2, x: 1 } })).ok, true, "and with its keys reordered, read anew on the state the edit found");
});

