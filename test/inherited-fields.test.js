// inherited-fields - a reference field is read from a record's own members alone: a field named as a member every object
// inherits -- constructor, toString, valueOf, hasOwnProperty, __proto__ -- is absent from a record that does not hold it,
// whether the reference holds one target or many, and is held as written where the record holds it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";

const NAMES = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"];

for (const holds of ["one", "many"]) {
	test(`a reference holding ${holds} target(s), named for an inherited member, is absent from a record that does not hold it`, () => {
		const declaration = { kinds: [{ kind: "box", references: NAMES.map((field) => ({ field, targets: ["item"], holds, onTargetDelete: "unlink" })) }, { kind: "item" }] };
		const made = createEntityGraph(declaration);
		assert.equal(made.ok, true, JSON.stringify(made.refusal));
		const g = made.graph;
		const taken = g.applyChange({ position: 1, items: [{ kind: "item", id: "i1", record: {} }, { kind: "box", id: "x", record: { label: "empty" } }] });
		assert.equal(taken.ok, true, JSON.stringify(taken.refusal));
		assert.deepEqual(g.targetsOf("x").targets, []);
		for (const field of NAMES) {
			const record = JSON.parse(JSON.stringify({ label: field }).replace("}", `, ${JSON.stringify(field)}: ${JSON.stringify(holds === "one" ? "i1" : ["i1"])}}`));
			const r = g.applyChange({ position: g.position() + 1, items: [{ kind: "box", id: "x", record }] });
			assert.equal(r.ok, true, `${field} held: ${JSON.stringify(r.refusal)}`);
			assert.deepEqual(g.targetsOf("x").targets, [{ field, id: "i1", kind: "item" }], `${field}, held as written`);
			assert.deepEqual(g.referrersOf("i1").referrers, [{ kind: "box", id: "x", field }]);
		}
	});
}
