// declaration - the declaration as M1 reads it (docs/DECISIONS.md D10): kinds, and each kind's references with the kinds
// they may target, how many targets they hold, and the rule options' values; a bad declaration is refused at creation in
// the shared refusal form, naming where it is wrong. The members later milestones read are accepted and not yet read.
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
const one = (references) => ({ kinds: { box: { references }, item: {} } });

test("a declaration of kinds and their references is accepted", () => {
	assert.equal(createEntityGraph(WORLD).ok, true);
	assert.equal(createEntityGraph({ kinds: { item: {} } }).ok, true, "a kind with no references");
});

test("a declaration that is not plain data, or holds no kinds, is refused", () => {
	assert.equal(refusedAt(null), "");
	assert.equal(refusedAt({}), "kinds");
	assert.equal(refusedAt({ kinds: {} }), "kinds");
	assert.equal(refusedAt({ kinds: { box: [] } }), "kinds.box");
	assert.equal(refusedAt({ kinds: { "": {} } }), "kinds.");
});

test("a reference must target declared kinds and say how many targets it holds", () => {
	assert.equal(refusedAt(one({ items: { holds: "many" } })), "kinds.box.references.items.targets");
	assert.equal(refusedAt(one({ items: { targets: [], holds: "many" } })), "kinds.box.references.items.targets");
	assert.equal(refusedAt(one({ items: { targets: ["crate"], holds: "many" } })), "kinds.box.references.items.targets", "an undeclared target kind");
	assert.equal(refusedAt(one({ items: { targets: ["item", "item"], holds: "many" } })), "kinds.box.references.items.targets", "a target kind twice");
	assert.equal(refusedAt(one({ items: { targets: ["item"] } })), "kinds.box.references.items.holds");
	assert.equal(refusedAt(one({ items: { targets: ["item"], holds: "several" } })), "kinds.box.references.items.holds");
});

test("each reference rule option takes only the contract's values", () => {
	const bad = [
		["onTargetDelete", "explode"], ["exclusivity", "share"], ["onBelowMin", "warn"], ["onUnreferenced", "archive"], ["min", -1], ["min", 1.5],
	];
	for (const [option, value] of bad) {
		assert.equal(refusedAt(one({ items: { targets: ["item"], holds: "many", [option]: value } })), `kinds.box.references.items.${option}`, `${option}: ${value}`);
	}
	const good = { targets: ["item"], holds: "many", onTargetDelete: "cascade-delete", exclusivity: "refuse", min: 1, onBelowMin: "cascade-delete", onUnreferenced: "delete" };
	assert.equal(createEntityGraph(one({ items: good })).ok, true);
	for (const value of ["refuse", "cascade-delete", "unlink"]) assert.equal(createEntityGraph(one({ items: { targets: ["item"], holds: "one", onTargetDelete: value } })).ok, true, value);
	assert.equal(refusedAt(one({ items: { targets: ["item"], holds: "one", min: 2 } })), "kinds.box.references.items.min", "a one-target reference cannot need two");
});

test("an unknown member is refused, naming it; the members later milestones read are accepted and not yet read", () => {
	assert.equal(refusedAt({ kinds: { item: { colour: "red" } } }), "kinds.item.colour");
	assert.equal(refusedAt({ kinds: { item: {} }, mood: 1 }), "mood");
	assert.equal(refusedAt(one({ items: { targets: ["item"], holds: "many", weight: 3 } })), "kinds.box.references.items.weight");
	const later = { phases: ["settle"], kinds: { item: { shape: { type: "object" }, conditions: [], consequences: [], intentResolver: null } } };
	assert.equal(createEntityGraph(later).ok, true);
});

test("a first fill is checked as a change is: a bad entity refuses the graph, naming it", () => {
	const made = createEntityGraph(WORLD, { position: 1, entities: [{ kind: "tag", id: "t1", record: {} }, { kind: "vase", id: "v1", record: {} }] });
	assert.equal(made.ok, false);
	assert.equal(made.refusal.code, "undeclared-kind");
	assert.equal(made.refusal.details.opIndex, 1);
	const at = createEntityGraph(WORLD, { position: -1 });
	assert.equal(at.refusal?.code, "invalid-change", "a position that is no whole number from 0");
});
