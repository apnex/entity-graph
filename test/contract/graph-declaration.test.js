// graph-declaration - CONTRACT.md's row: each kind the application declares states in one place, and as data wherever data can
// say it, the shape of its own records, the references it holds with the rules on each, any condition over its entities that a
// shape cannot state, any consequence of its own that the reference rules cannot express, each with a trigger stated as data
// and one of the phases the application declares, and optionally an intentResolver; every answer and every plan works from
// that one declaration, and no kind, rule or phase is built in. Served from M4 (docs/DECISIONS.md D26).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../../dist/index.js";

const DIALECT = "urn:apnex:shape-check:dialect:1";
const subject = (declaration) => {
	const r = createEntityGraph(declaration);
	assert.equal(r.ok, false, "accepted");
	assert.equal(r.refusal.code, "invalid-declaration");
	return r.refusal.details.subject;
};
const ITEM = {
	kind: "item",
	shape: { $schema: DIALECT, type: "object", properties: { box: { type: ["string", "null"] }, label: { type: "string" } } },
	references: [{ field: "box", targets: ["box"], holds: "one", onTargetDelete: "unlink" }],
	conditions: [{ id: "labelled", check: ({ graph }) => graph.all("item").filter((x) => x.record.label === undefined).map((x) => ({ subject: x.id, measure: 1, sentence: `item ${x.id} has no label` })) }],
	consequences: [{ id: "stamp", phase: "settle", trigger: { created: ["item"] }, run: ({ matches }) => matches.map((m) => ({ op: "set", kind: "item", id: m.id, patch: { label: m.after.label ?? "new" } })) }],
	intentResolver: ({ item }) => [item],
};

test("a kind states in one place its shape, its references and their rules, its conditions, its consequences with data triggers and declared phases, and an intent resolver", () => {
	const made = createEntityGraph({ phases: ["settle"], kinds: [ITEM, { kind: "box" }] }, { position: 1, entities: [{ kind: "box", id: "b", record: {} }] });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	const r = made.graph.plan({ items: [{ op: "create", kind: "item", id: "i", record: { box: "b" } }] });
	assert.equal(r.ok, true, JSON.stringify(r.refusal));
	assert.deepEqual(r.writes, [{ op: "put", kind: "item", id: "i", record: { box: "b", label: "new" } }], "its consequence ran in its phase, and its condition held after it");
	assert.deepEqual(made.graph.referrersOf("b").referrers, [], "a plan lands nothing");
});

test("each part is declared as data where data can say it, and a malformed part is refused at creation, named", () => {
	assert.equal(subject({ phases: ["settle"], kinds: [{ ...ITEM, shape: { type: "object" } }, { kind: "box" }] }), "item.shape: invalid");
	assert.equal(subject({ phases: ["settle"], kinds: [{ ...ITEM, consequences: [{ ...ITEM.consequences[0], trigger: () => true }] }, { kind: "box" }] }), "item.consequences.stamp.trigger: invalid", "a trigger is data");
	assert.equal(subject({ phases: ["settle"], kinds: [{ ...ITEM, intentResolver: { rewrite: true } }, { kind: "box" }] }), "item.intentResolver: invalid");
	assert.equal(subject({ phases: ["settle"], kinds: [{ ...ITEM, conditions: [{ id: "labelled" }] }, { kind: "box" }] }), "item.conditions.labelled.check: missing");
	assert.equal(subject({ phases: ["settle"], kinds: [ITEM] }), "item.box.targets: undeclared box");
});

test("no kind, rule or phase is built in: a phase, a kind or a field the declaration does not hold is refused, never assumed", () => {
	assert.equal(subject({ kinds: [ITEM, { kind: "box" }] }), "item.consequences.stamp.phase: undeclared settle", "no phase without the declaration's");
	const bare = createEntityGraph({ kinds: [{ kind: "box" }] });
	assert.equal(bare.ok, true);
	assert.equal(bare.graph.plan({ items: [{ op: "create", kind: "item", id: "i", record: {} }] }).refusal.code, "undeclared-kind");
	assert.equal(bare.graph.all("item").refusal.code, "invalid-query");
	assert.equal(bare.graph.referrersOf("x", { fields: ["box"] }).refusal.code, "invalid-query", "no reference field it does not declare");
	const plain = bare.graph.plan({ items: [{ op: "create", kind: "box", id: "b", record: { anything: [1, { goes: true }] } }] });
	assert.deepEqual(plain.writes, [{ op: "put", kind: "box", id: "b", record: { anything: [1, { goes: true }] } }], "no rule a kind does not declare");
});
