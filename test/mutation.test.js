// mutation - the checks can fail: faults planted, each in a copy of the built package, are caught. A stale reverse entry: a put
// that replaces an entity keeps the references it held before. A missed delete: a deleted entity's references stay in the
// index. Both are caught by the Exactness check. An entity answered under another kind: get drops its kind check, caught by
// asking for a book as a shelf. The rule engine's (M2): a rule value ignored, cascade-delete read as refuse; a cascade cut short,
// the rules expanded once; a worsening let through, only a new breach refused -- each caught by a scenario the contract answers.
// Each mutant must land, or its verdict would measure nothing.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkExactness } from "./support/exactness.js";
import { WORLD } from "./support/worlds.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// a kind's question answered under another kind's name: get finds an entity by identity, so it must check the kind asked
const getUnderOwnKind = (createEntityGraph) => {
	const g = createEntityGraph(WORLD, { position: 1, entities: [{ kind: "book", id: "b1", record: {} }] }).graph;
	return g.get("shelf", "b1").entity === null ? null : { what: "get answered a book under the kind shelf" };
};
// the rule engine's scenarios, each answered as the contract says by the built package: a cascade followed, a chain followed to
// its end, a worsening refused
const rule = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });
const planned = (createEntityGraph, kinds, entities, items) => createEntityGraph({ kinds }, { position: 1, entities }).graph.plan({ items });
const cascadeFollowed = (createEntityGraph) => {
	const r = planned(createEntityGraph, [{ kind: "shelf" }, { kind: "book", references: [rule("shelf", ["shelf"], "one", { onTargetDelete: "cascade-delete" })] }],
		[{ kind: "shelf", id: "s", record: {} }, { kind: "book", id: "b", record: { shelf: "s" } }], [{ op: "remove", kind: "shelf", id: "s" }]);
	return r.ok && r.writes.some((w) => w.op === "del" && w.id === "b") ? null : { what: "cascade-delete was not followed", got: r };
};
const chainFollowed = (createEntityGraph) => {
	const kinds = [{ kind: "ring", references: [rule("next", ["ring"], "one", { onTargetDelete: "cascade-delete" })] }];
	const r = planned(createEntityGraph, kinds, ["a", "b", "c", "d"].map((id, i, all) => ({ kind: "ring", id, record: { next: i === 0 ? null : all[i - 1] } })), [{ op: "remove", kind: "ring", id: "a" }]);
	return r.ok && r.writes.length === 4 ? null : { what: "the cascade stopped short of its end", got: r };
};
const worseningRefused = (createEntityGraph) => {
	const kinds = [{ kind: "crew", references: [rule("hands", ["sailor"], "many", { min: 3, onBelowMin: "refuse" })] }, { kind: "sailor" }];
	const r = planned(createEntityGraph, kinds, [{ kind: "sailor", id: "a", record: {} }, { kind: "crew", id: "k", record: { hands: ["a"] } }], [{ op: "set", kind: "crew", id: "k", patch: { hands: [] } }]);
	return r.ok === false && r.refusal.details.ruleKey === "crew.hands.min" ? null : { what: "a worsened breach was let through", got: r };
};
const MUTANTS = [
	{ name: "a stale reverse entry", file: "references.js", needle: "this.drop(id); // the references it held before this change" },
	{ name: "a missed delete", file: "references.js", needle: "this.drop(id); // a deleted entity refers to nothing" },
	{ name: "an entity answered under another kind", file: "entity-graph.js", needle: "e !== undefined && e.kind === kind ? e : null", replacement: "e !== undefined ? e : null", check: getUnderOwnKind },
	{ name: "a rule value ignored: cascade-delete read as refuse", file: "reference-rules.js", needle: "if (holder === undefined || ref === undefined || ref.onTargetDelete === \"refuse\")", replacement: "if (holder === undefined || ref === undefined || ref.onTargetDelete !== \"unlink\")", check: cascadeFollowed },
	{ name: "a cascade cut short: the rules expanded once", file: "reference-rules.js", needle: "if (!changed)", replacement: "if (true)", check: chainFollowed },
	{ name: "a worsening let through: only a new breach refuses", file: "reference-rules.js", needle: "if (b.measure > (before.get(b.key)?.measure ?? 0))", replacement: "if (!before.has(b.key))", check: worseningRefused },
];

for (const mutant of MUTANTS) {
	test(`the suite catches ${mutant.name}, planted in a copy of dist/`, async () => {
		// inside the repository, so the copy resolves its dependencies as dist/ does
		const dir = fs.mkdtempSync(path.join(root, ".mutants-"));
		try {
			fs.cpSync(path.join(root, "dist"), dir, { recursive: true });
			const file = path.join(dir, mutant.file);
			const before = fs.readFileSync(file, "utf8");
			assert.equal(before.split(mutant.needle).length, 2, `the needle is in ${mutant.file} exactly once, or the mutant does not land`);
			fs.writeFileSync(file, before.replace(mutant.needle, mutant.replacement ?? "/* removed by the mutant */"));
			const { createEntityGraph } = await import(pathToFileURL(path.join(dir, "index.js")).href);
			const found = mutant.check ? mutant.check(createEntityGraph) : checkExactness(createEntityGraph, { seed: 3, streams: 10, steps: 30 });
			assert.notEqual(found, null, `${mutant.name} was not caught`);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
}
