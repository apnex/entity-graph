// phases - application consequences in declared phases under the stopping rule, the conflict fault, consequence and rule
// writes held to request rules, conditions over the whole set, and shapes judged through shape-check (CONTRACT.md
// *Consequences and the stopping rule*, *Consequence writes held to request rules*, *Judging and refusals*; docs/DECISIONS.md
// D20 to D24).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";

const DIALECT = "urn:apnex:shape-check:dialect:1";
const ref = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });
const make = (declaration, entities = []) => {
	const made = createEntityGraph(declaration, { position: 1, entities });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return made.graph;
};
const e = (kind, id, record = {}) => ({ kind, id, record });
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
	return r.refusal;
};
const facts = (refusal) => ({ code: refusal.code, ...refusal.details });
const net = (r) => r.writes.map((w) => `${w.op} ${w.kind}:${w.id}`);
const putOf = (r, id) => r.writes.find((w) => w.id === id && w.op === "put")?.record;
const consequence = (id, phase, trigger, run) => ({ id, phase, trigger, run });
const everything = (g, kinds, ids) => JSON.stringify([g.position(), ...kinds.map((k) => g.all(k)), ...ids.map((id) => [g.referrersOf(id), g.targetsOf(id)])]);

test("a declaration's phases, consequences, conditions and shapes are checked at creation, a fault named by its part", () => {
	const run = () => [];
	const check = () => [];
	const subject = (declaration) => {
		const r = createEntityGraph(declaration);
		assert.equal(r.ok, false, `accepted: ${JSON.stringify(declaration)}`);
		assert.equal(r.refusal.code, "invalid-declaration");
		return r.refusal.details.subject;
	};
	const task = (members) => ({ phases: ["first", "second"], kinds: [{ kind: "task", ...members }, { kind: "tag" }] });
	const stamp = (over = {}) => ({ id: "stamp", phase: "first", trigger: { created: ["task"] }, run, ...over });
	assert.equal(createEntityGraph(task({ consequences: [stamp()], conditions: [{ id: "few", check }], shape: { $schema: DIALECT, type: "object" } })).ok, true);
	assert.equal(subject({ phases: "first", kinds: [{ kind: "task" }] }), "phases: invalid");
	assert.equal(subject({ phases: [], kinds: [{ kind: "task" }] }), "phases: empty");
	assert.equal(subject({ phases: ["first", "first"], kinds: [{ kind: "task" }] }), "phases.first: duplicate");
	assert.equal(subject({ kinds: [{ kind: "task", consequences: [stamp()] }] }), "task.consequences.stamp.phase: undeclared first");
	assert.equal(subject(task({ consequences: [stamp({ phase: "later" })] })), "task.consequences.stamp.phase: undeclared later");
	assert.equal(subject(task({ consequences: [stamp({ run: undefined })] })), "task.consequences.stamp.run: missing");
	assert.equal(subject(task({ consequences: [stamp({ run: "go" })] })), "task.consequences.stamp.run: invalid");
	assert.equal(subject(task({ consequences: [stamp({ trigger: undefined })] })), "task.consequences.stamp.trigger: missing");
	assert.equal(subject(task({ consequences: [stamp({ trigger: { made: ["task"] } })] })), "task.consequences.stamp.trigger: invalid");
	assert.equal(subject(task({ consequences: [stamp({ trigger: [{ created: [] }] })] })), "task.consequences.stamp.trigger: invalid");
	assert.equal(subject(task({ consequences: [stamp({ trigger: { changed: { kind: "task", fields: [] } } })] })), "task.consequences.stamp.trigger: invalid");
	assert.equal(subject(task({ consequences: [stamp({ trigger: { deleted: ["vase"] } })] })), "task.consequences.stamp.trigger: undeclared vase");
	assert.equal(subject(task({ consequences: [stamp(), stamp()] })), "task.consequences.stamp: duplicate");
	assert.equal(subject(task({ consequences: [stamp({ when: 1 })] })), "task.consequences.stamp.when: unknown");
	assert.equal(subject(task({ consequences: [{ phase: "first" }] })), "task.consequences[0]: invalid");
	assert.equal(subject(task({ consequences: stamp() })), "task.consequences: invalid");
	assert.equal(subject(task({ conditions: [{ id: "few" }] })), "task.conditions.few.check: missing");
	assert.equal(subject(task({ conditions: [{ id: "few", check: 1 }] })), "task.conditions.few.check: invalid");
	assert.equal(subject(task({ conditions: [{ id: "few", check }, { id: "few", check }] })), "task.conditions.few: duplicate");
	assert.equal(subject(task({ shape: { type: "object" } })), "task.shape: invalid", "shape-check refuses a shape naming no dialect");
	assert.equal(subject(task({ shape: { $schema: DIALECT, type: "object", properties: { n: { type: "integer", least: 1 } } } })), "task.shape/properties/n: invalid");
	assert.equal(createEntityGraph(task({ shape: { $schema: "urn:apnex:shape-check:dialect:2", type: "object", properties: { n: { type: "integer", minimum: 1 } } } })).ok, true, "shape-check 0.2.0's dialect 2");
});

test("within a phase the consequences that hear a change run in declared order, each seeing the writes before it", () => {
	const number = consequence("number", "first", { created: ["task"] }, ({ matches }) => matches.map((m) => set("task", m.id, { n: 1 })));
	const count = consequence("count", "first", { created: ["task"] }, ({ graph }) => [change("tally", "t", { seen: graph.all("task").map((x) => x.record.n ?? null) })]);
	const taskFirst = make({ phases: ["first"], kinds: [{ kind: "task", consequences: [number] }, { kind: "tally", consequences: [count] }] }, [e("tally", "t")]);
	assert.deepEqual(putOf(accepted(taskFirst.plan({ items: [create("task", "a")] })), "t"), { seen: [1] }, "count, declared after number, saw its write");
	const tallyFirst = make({ phases: ["first"], kinds: [{ kind: "tally", consequences: [count] }, { kind: "task", consequences: [number] }] }, [e("tally", "t")]);
	assert.deepEqual(putOf(accepted(tallyFirst.plan({ items: [create("task", "a")] })), "t"), { seen: [null] }, "declared first, count ran first");
});

test("each phase runs once, in declared order, and a completed phase is never entered again", () => {
	const calls = [];
	const echo = consequence("echo", "first", { changed: { kind: "task", fields: ["v"] } }, () => (calls.push("echo"), []));
	const bump = consequence("bump", "second", { changed: { kind: "task", fields: ["v"] } }, ({ matches }) => (calls.push("bump"), matches.map((m) => set("task", m.id, { v: m.after.v + 1 }))));
	const g = make({ phases: ["first", "second"], kinds: [{ kind: "task", consequences: [echo, bump] }] }, [e("task", "a", { v: 0 })]);
	const r = accepted(g.plan({ items: [set("task", "a", { v: 1 })] }));
	assert.deepEqual(calls, ["echo", "bump"], "bump's write is heard by no phase run again");
	assert.deepEqual(putOf(r, "a"), { v: 2 });
	calls.length = 0;
	const flipped = make({ phases: ["second", "first"], kinds: [{ kind: "task", consequences: [echo, bump] }] }, [e("task", "a", { v: 0 })]);
	accepted(flipped.plan({ items: [set("task", "a", { v: 1 })] }));
	assert.deepEqual(calls, ["bump", "echo"], "the phases run in the order the declaration gives them");
});

test("the reference rules are expanded after each phase, before the next begins", () => {
	const close = consequence("close", "first", { changed: { kind: "folder", fields: ["closed"] } }, ({ matches }) => matches.map((m) => remove("folder", m.id)));
	const note = consequence("note", "second", { deleted: ["item"] }, ({ matches }) => [change("tally", "t", { gone: matches.map((m) => m.id) })]);
	const g = make({
		phases: ["first", "second"],
		kinds: [{ kind: "folder", consequences: [close] }, { kind: "item", references: [ref("in", ["folder"], "one", { onTargetDelete: "cascade-delete" })] }, { kind: "tally", consequences: [note] }],
	}, [e("folder", "f"), e("item", "i1", { in: "f" }), e("item", "i2", { in: "f" }), e("tally", "t")]);
	const r = accepted(g.plan({ items: [set("folder", "f", { closed: true })] }));
	assert.deepEqual(net(r).sort(), ["del folder:f", "del item:i1", "del item:i2", "put tally:t"]);
	assert.deepEqual(putOf(r, "t"), { gone: ["i1", "i2"] }, "the second phase heard the cascade the first phase's removal set off");
});

test("a trigger hears what it names: an entity of its kinds created or deleted, or a named field changed", () => {
	const heard = [];
	const listen = consequence("listen", "first", [{ changed: { kind: "task", fields: ["title"] } }, { deleted: ["task"] }], ({ matches }) => (heard.push(matches.map((m) => ({ ...m }))), []));
	const g = make({ phases: ["first"], kinds: [{ kind: "task", consequences: [listen] }] }, [e("task", "a", { title: "x", n: 1 })]);
	const hears = (items) => {
		heard.length = 0;
		accepted(g.plan({ items }));
		return heard.length === 0 ? null : heard[0];
	};
	assert.equal(hears([set("task", "a", { n: 2 })]), null, "a field the trigger does not name");
	assert.equal(hears([set("task", "a", { title: "x" })]), null, "a named field set to the value it had");
	assert.equal(hears([create("task", "b", { title: "y" })]), null, "a creation, which the trigger does not name");
	assert.equal(hears([create("task", "b"), remove("task", "b")]), null, "an entity created and removed in one edit is no change");
	assert.deepEqual(hears([set("task", "a", { title: "z" })]), [{ kind: "task", id: "a", before: { title: "x", n: 1 }, after: { title: "z", n: 1 }, fields: ["title"] }]);
	assert.deepEqual(hears([remove("task", "a")]), [{ kind: "task", id: "a", before: { title: "x", n: 1 }, after: null, fields: ["n", "title"] }]);
});

test("two consequences writing one entity in one run of a phase is a fault, reported as such", () => {
	const one = consequence("one", "first", { created: ["task"] }, () => [set("tally", "t", { by: "one" })]);
	const two = consequence("two", "first", { created: ["task"] }, () => [set("tally", "t", { by: "two" })]);
	const later = consequence("later", "second", { created: ["task"] }, () => [set("tally", "t", { by: "later" })]);
	const kinds = (list) => ({ phases: ["first", "second"], kinds: [{ kind: "task", consequences: list }, { kind: "tally" }] });
	const g = make(kinds([one, two]), [e("tally", "t")]);
	assert.deepEqual(facts(refused(g.plan({ items: [create("task", "x"), create("task", "y")] }))), { code: "consequence-conflict", ruleKey: "consequence-conflict", subject: "t", measure: 2, opIndex: -1, sentence: null, writers: ["task.one", "task.two"] }, "a fault between two consequences, of the edit as a whole (the corpus's R29)");
	assert.deepEqual(putOf(accepted(make(kinds([one, later]), [e("tally", "t")]).plan({ items: [create("task", "x")] })), "t"), { by: "later" }, "one entity written by two phases");
	const twice = consequence("twice", "first", { created: ["task"] }, () => [set("tally", "t", { n: 1 }), set("tally", "t", { n: 2 })]);
	assert.deepEqual(putOf(accepted(make(kinds([twice]), [e("tally", "t")]).plan({ items: [create("task", "x")] })), "t"), { n: 2 }, "one consequence writing an entity twice");
	assert.equal(accepted(make(kinds([one]), [e("tally", "t")]).plan({ items: [create("task", "x"), set("tally", "t", { mine: 1 })] })).ok, true, "a consequence writing what the request wrote");
});

const SHAPED = { $schema: DIALECT, type: "object", properties: { title: { type: "string", minLength: 1 }, n: { type: "integer" }, owner: { type: "string" } }, additionalProperties: false };

test("a consequence's write is held to the rules a requested write of it would meet, refused naming its writers; an entity that already failed is not", () => {
	const kinds = (run, extra = {}) => ({
		phases: ["first"],
		kinds: [
			{ kind: "person" },
			{ kind: "task", shape: SHAPED, references: [ref("owner", ["person"], "one")], consequences: [consequence("fill", "first", { changed: { kind: "task", fields: ["n"] } }, run)], ...extra },
		],
	});
	const opening = [e("person", "p"), e("task", "a", { title: "A", n: 1 }), e("task", "b", { title: "B", n: 1 }), e("task", "old", { title: "", n: 1 })];
	const misfit = make(kinds(({ matches }) => matches.map((m) => set("task", m.id, { title: "" }))), opening);
	assert.deepEqual(facts(refused(misfit.plan({ items: [set("task", "a", { n: 3 })] }))), { code: "shape-misfit", ruleKey: "task.shape", subject: "a", measure: 1, opIndex: 0, sentence: null, writers: ["task.fill"] });
	assert.deepEqual(facts(refused(misfit.plan({ items: [set("task", "b", { title: "B2" }), set("task", "a", { n: 3 })] }))).opIndex, 1, "the item whose change the consequence heard");
	const onto = make(kinds(() => [set("task", "old", { n: 5 })]), opening);
	assert.equal(accepted(onto.plan({ items: [set("task", "a", { n: 3 })] })).ok, true, "old misfit before the edit, and no worse after the consequence wrote it");
	const dangling = make(kinds(({ matches }) => matches.map((m) => set("task", m.id, { owner: "nobody" }))), opening);
	assert.deepEqual(facts(refused(dangling.plan({ items: [set("task", "a", { n: 3 })] }))), { code: "rule-broken", ruleKey: "task.owner.targets", subject: "a", measure: 1, opIndex: 0, sentence: null, writers: ["task.fill"] });
	const otherwise = make(kinds(() => [set("task", "old", { title: "", n: "many" })]), opening);
	assert.equal(accepted(otherwise.plan({ items: [set("task", "a", { n: 3 })] })).ok, true, "a shape is fitted or misfitted, a breach of measure 1, so old misfitting otherwise is no worse (the corpus's R30)");
	const condition = { id: "titled", check: (graph) => graph.all("task").filter((t) => t.record.title === "X").map((t) => ({ subject: t.id, measure: 1, sentence: `task ${t.id} is titled X` })) };
	const named = make(kinds(({ matches }) => matches.map((m) => set("task", m.id, { title: "X" })), { conditions: [condition] }), opening);
	assert.deepEqual(facts(refused(named.plan({ items: [set("task", "a", { n: 3 })] }))), { code: "condition-broken", ruleKey: "task.titled", subject: "a", measure: 1, opIndex: -1, sentence: "task a is titled X", writers: ["task.fill"] });
	const absent = make(kinds(() => [set("task", "ghost", { n: 1 })]), opening);
	assert.deepEqual(facts(refused(absent.plan({ items: [set("task", "a", { n: 3 })] }))), { code: "entity-absent", ruleKey: "task.fill", subject: "ghost", measure: 1, opIndex: 0, sentence: null }, "a write no requested item could make, named by its fault and its consequence");
});

test("a reference rule's write is held to the shape a requested write of it would meet, named by the rule it breaks", () => {
	const g = make({ kinds: [{ kind: "person" }, { kind: "task", shape: SHAPED, references: [ref("owner", ["person"], "one")] }] }, [e("person", "p"), e("task", "a", { title: "A", owner: "p" })]);
	assert.deepEqual(facts(refused(g.plan({ items: [remove("person", "p")] }))), { code: "shape-misfit", ruleKey: "task.shape", subject: "a", measure: 1, opIndex: 0, sentence: null }, "unlinking left owner null, which the shape does not allow");
});

test("a requested write whose record misfits its kind's shape is refused at its item, whether or not the entity fit before (the corpus's R31)", () => {
	const g = make({ kinds: [{ kind: "task", shape: SHAPED }] }, [e("task", "old", { title: "", n: "x" })]);
	assert.deepEqual(facts(refused(g.plan({ items: [create("task", "t1", { title: "T" }), create("task", "t2", { title: "", n: 1.5 })] }))), { code: "shape-misfit", ruleKey: "task.shape", subject: "t2", measure: 1, opIndex: 1, sentence: null });
	assert.equal(refused(g.plan({ items: [create("task", "t2", { title: "" }), set("task", "t2", { title: "T" })] })).details.opIndex, 0, "refused at its item, before a later one repairs it");
	assert.equal(refused(g.plan({ items: [set("task", "old", { n: 2 })] })).details.opIndex, 0, "an entity that misfit before, still misfitting");
	assert.equal(accepted(g.plan({ items: [change("task", "old", { title: "Old", n: 2 })] })).ok, true, "and one made to fit");
	assert.equal(refused(make({ kinds: [{ kind: "task", shape: SHAPED, references: [ref("owner", ["task"], "one")] }] }).plan({ items: [create("task", "t", { title: "T", owner: 1 })] })).code, "invalid-reference", "a reference's form before its shape");
});

test("a condition over the whole set is judged by key and measure, its sentence carried verbatim, a standing breach and a partial repair allowed", () => {
	const unique = {
		id: "unique-label",
		check: (graph) => {
			const by = new Map();
			for (const t of graph.all("tag")) by.set(t.record.label, (by.get(t.record.label) ?? 0) + 1);
			return [...by].filter(([, n]) => n > 1).map(([label, n]) => ({ subject: label, measure: n - 1, sentence: `${n} tags are labelled ${label}` }));
		},
	};
	const g = make({ kinds: [{ kind: "tag", conditions: [unique] }] }, [e("tag", "a", { label: "red" }), e("tag", "b", { label: "blue" }), e("tag", "c", { label: "blue" }), e("tag", "d", { label: "blue" })]);
	assert.deepEqual(facts(refused(g.plan({ items: [create("tag", "e", { label: "red" })] }))), { code: "condition-broken", ruleKey: "tag.unique-label", subject: "red", measure: 1, opIndex: -1, sentence: "2 tags are labelled red" });
	assert.equal(accepted(g.plan({ items: [create("tag", "e", { label: "green" })] })).ok, true, "blue's standing breach");
	assert.equal(accepted(g.plan({ items: [remove("tag", "d")] })).ok, true, "blue's breach made smaller");
	assert.equal(refused(g.plan({ items: [create("tag", "e", { label: "blue" })] })).details.measure, 3, "blue's breach made larger");
	const failing = (check) => facts(refused(make({ kinds: [{ kind: "tag", conditions: [{ id: "bad", check }] }] }, [e("tag", "a")]).plan({ items: [create("tag", "b")] })));
	assert.deepEqual(failing(() => { throw new Error("no"); }), { code: "condition-failed", ruleKey: "tag.bad", subject: "tag.bad", measure: 1, opIndex: -1, sentence: null });
	assert.equal(failing(() => [{ subject: "x", measure: 0, sentence: "s" }]).code, "condition-failed", "a breach measures more than nothing");
	assert.equal(failing(() => [{ subject: "x", measure: 1 }]).code, "condition-failed", "a breach carries its sentence");
	assert.equal(failing(() => [{ subject: "x", measure: 1, sentence: "s" }, { subject: "x", measure: 2, sentence: "t" }]).code, "condition-failed", "one subject reported twice");
	assert.equal(failing(() => new Map()).code, "condition-failed", "not a list of breaches");
});

test("a consequence or condition that throws, answers what is not plain data, or reaches for what it was given cannot change the view", () => {
	const kinds = (run) => ({ phases: ["first"], kinds: [{ kind: "task", consequences: [consequence("act", "first", { created: ["task"] }, run)] }, { kind: "tally" }] });
	const opening = [e("tally", "t", { n: 0 }), e("task", "a", { title: "A" })];
	const outcome = (run) => {
		const g = make(kinds(run), opening);
		const before = everything(g, ["task", "tally"], ["a", "t"]);
		const r = g.plan({ items: [create("task", "b", { title: "B" })] });
		assert.equal(everything(g, ["task", "tally"], ["a", "t"]), before, "the view is as it was");
		return r.ok ? "accepted" : facts(r.refusal);
	};
	assert.deepEqual(outcome(() => { throw new Error("no"); }), { code: "consequence-failed", ruleKey: "task.act", subject: "b", measure: 1, opIndex: 0, sentence: null });
	assert.equal(outcome(() => () => 1).code, "consequence-failed", "a function");
	assert.equal(outcome(() => new Map()).code, "consequence-failed", "a class's instance");
	assert.equal(outcome(() => Promise.resolve([])).code, "consequence-failed", "a promise");
	assert.equal(outcome(() => ({ op: "set", kind: "tally", id: "t", patch: {} })).code, "consequence-failed", "a write, not a list of them");
	assert.equal(outcome(() => [Object.defineProperty({}, "op", { get: () => "set", enumerable: true })]).code, "consequence-failed", "a getter, never run");
	assert.equal(outcome(({ matches }) => { matches[0].after.title = "Z"; return []; }).code, "consequence-failed", "the record it was handed");
	assert.equal(outcome(({ graph }) => { graph.get("tally", "t").record.n = 5; return []; }).code, "consequence-failed", "an entity it read");
	assert.equal(outcome(({ graph }) => { graph.all("task").push({}); return []; }).code, "consequence-failed", "a list it read");
	assert.equal(outcome(({ graph }) => { graph.all("vase"); return []; }).code, "consequence-failed", "a kind the declaration does not hold");
	let kept = null;
	assert.equal(outcome(({ graph }) => { kept = graph; return []; }), "accepted");
	assert.throws(() => kept.get("tally", "t"), /no longer/, "the reader answers only while it is called");
});

test("a consequence or condition calling back into the graph while it plans is refused there, and the view is as it was", () => {
	let graph = null;
	const inner = [];
	const act = consequence("act", "first", { created: ["task"] }, () => {
		inner.push(graph.applyChange({ position: 9, items: [{ kind: "tally", id: "t", record: { n: 9 } }] }));
		inner.push(graph.plan({ items: [create("tally", "u")] }));
		return [];
	});
	graph = make({ phases: ["first"], kinds: [{ kind: "task", consequences: [act] }, { kind: "tally" }] }, [e("tally", "t", { n: 0 })]);
	accepted(graph.plan({ items: [create("task", "b")] }));
	assert.deepEqual(inner.map((r) => [r.ok, r.refusal?.code, r.refusal?.details.subject]), [[false, "reentrant", "applyChange"], [false, "reentrant", "plan"]]);
	assert.equal(graph.position(), 1);
	assert.deepEqual(graph.get("tally", "t").entity.record, { n: 0 });
	assert.equal(graph.applyChange({ position: 2, items: [{ kind: "tally", id: "t", record: { n: 1 } }] }).ok, true, "and taken in once the plan has answered");
});

test("an edit's cost follows the kinds it touched: a consequence listening to kinds the edit did not touch is never called", () => {
	let calls = 0;
	const others = Array.from({ length: 300 }, (_, i) => consequence(`c${i}`, i % 2 ? "first" : "second", [{ created: ["other"] }, { changed: { kind: "other", fields: ["v"] } }], () => (calls++, [])));
	const g = make({ phases: ["first", "second"], kinds: [{ kind: "task" }, { kind: "other", consequences: others }] }, [e("other", "o", { v: 0 })]);
	accepted(g.plan({ items: [create("task", "a"), set("task", "a", { v: 1 })] }));
	assert.equal(calls, 0);
	accepted(g.plan({ items: [set("other", "o", { v: 1 })] }));
	assert.equal(calls, 300, "each called once when its kind is touched");
});

test("the net-write bound holds after consequences, and a consequence's writes carry the item that led to them", () => {
	const flood = consequence("flood", "first", { created: ["task"] }, () => Array.from({ length: 2001 }, (_, i) => create("mark", `m${i}`)));
	const g = make({ phases: ["first"], kinds: [{ kind: "task", consequences: [flood] }, { kind: "mark" }] });
	assert.deepEqual([refused(g.plan({ items: [create("task", "a")] })).code], ["too-many-writes"]);
	const owned = consequence("own", "first", { changed: { kind: "task", fields: ["owner"] } }, ({ matches }) => matches.map((m) => create("claim", `c-${m.id}`, { of: m.after.owner })));
	const h = make({ phases: ["first"], kinds: [{ kind: "person" }, { kind: "task", consequences: [owned] }, { kind: "claim", references: [ref("of", ["person"], "one", { exclusivity: "refuse" })] }] }, [e("person", "p"), e("task", "a"), e("task", "b"), e("claim", "c0", { of: "p" })]);
	assert.deepEqual(facts(refused(h.plan({ items: [set("task", "a", { title: "x" }), set("task", "b", { owner: "p" })] }))), { code: "rule-broken", ruleKey: "claim.of.exclusivity", subject: "p", measure: 1, opIndex: 1, sentence: null, writers: ["task.own"] }, "c-b, a second claim on p, made from item 1's change");
});
