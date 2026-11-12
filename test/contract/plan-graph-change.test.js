// plan-graph-change - CONTRACT.md's row: given an edit - any set of creations, changes and removals asked for together, with an
// optional plain-JSON context - shows everything it would do, every consequence through a declared rule or an
// application-stated consequence included, under one stopping rule, or refuses it in the shared refusal form, naming the rule
// it would break, the entity concerned and the part of the edit that led there; every entity a consequence writes is held to
// the rules a requested write of it meets; the edit is judged on the state it would leave, no edit may leave a rule more broken
// than it found it, a partial repair is allowed, and planning changes no answer. Served from M4 (docs/DECISIONS.md D26).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../../dist/index.js";

const DIALECT = "urn:apnex:shape-check:dialect:1";
const ref = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });
// a folder holds files; removing a folder removes its files; a file's count of words is kept by a consequence, prefixed as the
// context says; a file created without an identity is named by its resolver; a folder holds at most `limit` files
const WORLD = {
	phases: ["count"],
	kinds: [
		{ kind: "folder" },
		{
			kind: "file",
			shape: { $schema: DIALECT, type: "object", properties: { in: { type: "string" }, text: { type: "string" }, words: { type: "string" } }, required: ["in", "text"], additionalProperties: false },
			references: [ref("in", ["folder"], "one", { onTargetDelete: "cascade-delete" })],
			intentResolver: ({ item, graph }) => (item.op === "create" && item.id === undefined ? [{ ...item, id: `file${graph.all("file").length + 1}` }] : [item]),
			consequences: [{ id: "words", phase: "count", trigger: [{ created: ["file"] }, { changed: { kind: "file", fields: ["text"] } }], run: ({ matches, context }) => matches.filter((m) => m.after !== null).map((m) => ({ op: "set", kind: "file", id: m.id, patch: { words: `${context?.prefix ?? ""}${m.after.text.split(" ").length}` } })) }],
			conditions: [{ id: "limit", check: ({ graph, context }) => { const by = new Map(); for (const f of graph.all("file")) by.set(f.record.in, (by.get(f.record.in) ?? 0) + 1); return [...by].filter(([, n]) => n > (context?.limit ?? 2)).map(([folder, n]) => ({ subject: folder, measure: n - (context?.limit ?? 2), sentence: `folder ${folder} holds ${n} files` })); } }],
		},
	],
};
const open = () => {
	const made = createEntityGraph(WORLD, { position: 4, entities: [{ kind: "folder", id: "d" }, { kind: "folder", id: "e" }, { kind: "file", id: "file1", record: { in: "d", text: "a b", words: "2" } }].map((x) => ({ record: {}, ...x })) });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return made.graph;
};
const all = (g) => JSON.stringify([g.position(), g.all("folder"), g.all("file"), g.referrersOf("d"), g.referrersOf("e")]);

test("an edit of creations, changes and removals, with a plain-JSON context, is shown whole: every write, requested or consequence, its reversal, the net writes and the position", () => {
	const g = open();
	const r = g.plan({ items: [{ op: "create", kind: "file", record: { in: "e", text: "x y z" } }, { op: "set", kind: "file", id: "file1", patch: { text: "one" } }, { op: "remove", kind: "folder", id: "d" }] }, { context: { prefix: "n=" } });
	assert.equal(r.ok, true, JSON.stringify(r.refusal));
	assert.equal(r.position, 4);
	assert.deepEqual(r.writes, [{ op: "put", kind: "file", id: "file2", record: { in: "e", text: "x y z", words: "n=3" } }, { op: "del", kind: "file", id: "file1" }, { op: "del", kind: "folder", id: "d" }], "named by its resolver, counted by its consequence with the context, and file1 gone with its folder");
	assert.deepEqual(r.steps.map((s) => `${s.op} ${s.id}`), ["put file2", "put file1", "del d", "del file1", "put file2"]);
	assert.equal(r.inverse.length, r.steps.length, "each step's reversal");
});

test("a refusal is in the shared form, naming the rule, the entity and the part of the edit that led there", () => {
	const g = open();
	const r = g.plan({ items: [{ op: "create", kind: "file", id: "f9", record: { in: "d", text: "q" } }, { op: "create", kind: "file", id: "f8", record: { in: "d", text: 7 } }] });
	assert.deepEqual(Object.keys(r.refusal).sort(), ["code", "details", "fix", "part", "what", "why"]);
	assert.deepEqual([r.refusal.part, r.refusal.code, r.refusal.details], ["entity-graph", "shape-misfit", { ruleKey: "file.shape", subject: "f8", measure: 1, opIndex: 1, sentence: null }]);
	const breach = g.plan({ items: [{ op: "create", kind: "file", id: "f9", record: { in: "d", text: "q" } }, { op: "create", kind: "file", id: "f8", record: { in: "d", text: "r" } }] });
	assert.deepEqual(breach.refusal.details, { ruleKey: "file.limit", subject: "d", measure: 1, opIndex: -1, sentence: "folder d holds 3 files" }, "a condition over the whole set, its own sentence carried");
	assert.equal(g.plan({ items: [{ op: "create", kind: "file", id: "f9", record: { in: "d", text: "q" } }, { op: "create", kind: "file", id: "f8", record: { in: "d", text: "r" } }] }, { context: { limit: 3 } }).ok, true, "the same edit under a context the condition reads");
});

test("every entity a consequence writes is held to the rules a requested write of it meets", () => {
	const spoiling = { ...WORLD, kinds: WORLD.kinds.map((k) => (k.kind === "file" ? { ...k, consequences: [{ ...k.consequences[0], run: ({ matches }) => matches.map((m) => ({ op: "set", kind: "file", id: m.id, patch: { words: 3 } })) }] } : k)) };
	const g = createEntityGraph(spoiling, { position: 4, entities: [{ kind: "folder", id: "d", record: {} }] }).graph;
	const r = g.plan({ items: [{ op: "create", kind: "file", id: "f", record: { in: "d", text: "a b c" } }] });
	assert.deepEqual([r.refusal.code, r.refusal.details.ruleKey, r.refusal.details.subject, r.refusal.details.opIndex, r.refusal.details.writers], ["shape-misfit", "file.shape", "f", 0, ["file.words"]]);
});

test("the edit is judged on the state it would leave: no rule left more broken, a partial repair allowed", () => {
	const g = createEntityGraph(WORLD, { position: 4, entities: [{ kind: "folder", id: "d", record: {} }, ...["f1", "f2", "f3", "f4"].map((id) => ({ kind: "file", id, record: { in: "d", text: "t", words: "1" } }))] }).graph;
	assert.equal(g.plan({ items: [{ op: "remove", kind: "file", id: "f4" }] }).ok, true, "four files where two are allowed, made three");
	assert.equal(g.plan({ items: [{ op: "set", kind: "file", id: "f1", patch: { text: "u" } }] }).ok, true, "a standing breach, no worse");
	assert.equal(g.plan({ items: [{ op: "create", kind: "file", id: "f5", record: { in: "d", text: "t" } }] }).refusal.details.measure, 3, "made worse");
	assert.equal(g.plan({ items: [{ op: "create", kind: "file", id: "f5", record: { in: "d", text: "t" } }, { op: "remove", kind: "file", id: "f5" }] }).ok, true, "passing through a worse state to none");
});

test("planning changes no answer, accepted or refused, whatever the resolver, consequences and conditions did", () => {
	const g = open();
	const before = all(g);
	g.plan({ items: [{ op: "create", kind: "file", record: { in: "e", text: "x" } }, { op: "remove", kind: "folder", id: "d" }] }, { context: { prefix: "#" } });
	g.plan({ items: [{ op: "create", kind: "file", id: "f9", record: { in: "d", text: 1 } }] });
	g.plan({ items: [{ op: "create", kind: "file", record: { in: "d", text: "q" } }] }, { context: { f() {} } });
	assert.equal(all(g), before);
});
