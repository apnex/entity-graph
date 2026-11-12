// declaration - the declaration as M1 reads it (docs/DECISIONS.md D10, D11): a list of kinds, each with a list of references,
// each naming its field, the declared kinds it may target, how many targets it holds and what becomes of the referrer when a
// target is deleted, with the other rule options as the contract allows them; a bad declaration is refused at creation in the
// shared refusal form, its subject naming the kind, the field and the member at fault. The members later milestones read are
// accepted and not yet read.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";
import { WORLD } from "./support/worlds.js";

const refusedAt = (declaration) => {
	const made = createEntityGraph(declaration);
	assert.equal(made.ok, false, `accepted: ${JSON.stringify(declaration)}`);
	assert.equal(made.refusal.part, "entity-graph");
	assert.equal(made.refusal.code, "invalid-declaration");
	assert.equal(made.refusal.details.opIndex, -1);
	assert.equal(made.refusal.details.ruleKey, "invalid-declaration");
	return made.refusal.details.subject;
};
const box = (reference) => ({ kinds: [{ kind: "box", references: [reference] }, { kind: "item" }] });
const items = (options = {}) => ({ field: "items", targets: ["item"], holds: "many", onTargetDelete: "unlink", ...options });
// a reference with one member left out, as a declaration that never wrote it
const without = (member) => Object.fromEntries(Object.entries(items()).filter(([k]) => k !== member));

test("a declaration of kinds and their references is accepted, a reference targeting a kind declared after it", () => {
	assert.equal(createEntityGraph(WORLD).ok, true);
	assert.equal(createEntityGraph({ kinds: [{ kind: "item" }] }).ok, true, "a kind with no references");
	assert.equal(createEntityGraph(box(items())).ok, true, "box targets item, declared after it");
});

test("a declaration that is not plain data, holds no kinds, or declares a kind twice, is refused", () => {
	assert.equal(refusedAt(null), "declaration: invalid");
	assert.equal(refusedAt({}), "kinds: missing");
	assert.equal(refusedAt({ kinds: [] }), "kinds: empty");
	assert.equal(refusedAt({ kinds: { item: {} } }), "kinds: invalid", "kinds as a list");
	assert.equal(refusedAt({ kinds: [{ kind: "" }] }), "kinds[0]: invalid");
	assert.equal(refusedAt({ kinds: [{ kind: "item" }, "box"] }), "kinds[1]: invalid");
	assert.equal(refusedAt({ kinds: [{ kind: "item" }, { kind: "item" }] }), "item: duplicate");
});

test("a reference names its field once, targets declared kinds, and says how many targets it holds and what a target's deletion does", () => {
	assert.equal(refusedAt(box(without("field"))), "box.references[0]: invalid");
	assert.equal(refusedAt({ kinds: [{ kind: "box", references: [items(), items()] }, { kind: "item" }] }), "box.items: duplicate");
	assert.equal(refusedAt(box(without("targets"))), "box.items.targets: missing");
	assert.equal(refusedAt(box(items({ targets: [] }))), "box.items.targets: empty");
	assert.equal(refusedAt(box(items({ targets: ["item", "item"] }))), "box.items.targets: invalid");
	assert.equal(refusedAt(box(items({ targets: ["crate"] }))), "box.items.targets: undeclared crate");
	assert.equal(refusedAt(box(without("holds"))), "box.items.holds: missing");
	assert.equal(refusedAt(box(items({ holds: "several" }))), "box.items.holds: invalid");
	assert.equal(refusedAt(box(without("onTargetDelete"))), "box.items.onTargetDelete: missing", "required: the contract gives it no default");
});

test("each rule option takes only the contract's values; min and onBelowMin come together", () => {
	for (const [option, value] of [["onTargetDelete", "explode"], ["exclusivity", "share"], ["onBelowMin", "warn"], ["onUnreferenced", "archive"]]) {
		assert.equal(refusedAt(box(items({ [option]: value, ...(option === "onBelowMin" ? { min: 1 } : {}) }))), `box.items.${option}: invalid`, `${option}: ${value}`);
	}
	for (const min of [-1, 1.5, "2"]) assert.equal(refusedAt(box(items({ min, onBelowMin: "refuse" }))), "box.items.min: invalid", `min ${min}`);
	assert.equal(refusedAt(box(items({ min: 1 }))), "box.items.min: unpaired", "min without onBelowMin");
	assert.equal(refusedAt(box(items({ onBelowMin: "refuse" }))), "box.items.onBelowMin: unpaired", "onBelowMin without min");
	assert.equal(refusedAt(box(items({ holds: "one", min: 2, onBelowMin: "refuse" }))), "box.items.min: invalid", "a one-target reference cannot need two");
	const every = items({ onTargetDelete: "cascade-delete", exclusivity: "refuse", min: 1, onBelowMin: "cascade-delete", onUnreferenced: "delete" });
	assert.equal(createEntityGraph(box(every)).ok, true);
	for (const value of ["refuse", "cascade-delete", "unlink"]) assert.equal(createEntityGraph(box(items({ holds: "one", onTargetDelete: value }))).ok, true, value);
});

test("an unknown member is refused, naming it -- a misspelt option before a missing one; the members later milestones read are accepted", () => {
	assert.equal(refusedAt({ kinds: [{ kind: "item", colour: "red" }] }), "item.colour: unknown");
	assert.equal(refusedAt({ kinds: [{ kind: "item" }], mood: 1 }), "mood: unknown");
	assert.equal(refusedAt(box(items({ weight: 3 }))), "box.items.weight: unknown");
	assert.equal(refusedAt(box({ field: "items", targets: ["item"], holds: "many", onDelete: "unlink" })), "box.items.onDelete: unknown", "named, not reported missing");
	// RESTATED at M3 (docs/DECISIONS.md D20): a shape is now handed to shape-check, so it names its dialect; and at M4 (D26): an
	// intent resolver is read, so it is a function
	const later = { phases: ["settle"], kinds: [{ kind: "item", shape: { $schema: "urn:apnex:shape-check:dialect:1", type: "object" }, conditions: [], consequences: [], intentResolver: ({ item }) => [item] }] };
	assert.equal(createEntityGraph(later).ok, true);
});

test("a first fill is checked as a change is: a bad entity refuses the graph, naming it", () => {
	const made = createEntityGraph(WORLD, { position: 1, entities: [{ kind: "tag", id: "t1", record: {} }, { kind: "vase", id: "v1", record: {} }] });
	assert.equal(made.ok, false);
	assert.equal(made.refusal.code, "undeclared-kind");
	assert.equal(made.refusal.details.opIndex, 1);
	assert.equal(createEntityGraph(WORLD, { position: -1 }).refusal?.code, "invalid-opening", "a position that is no whole number from 0: an opening is no change (D12)");
});
