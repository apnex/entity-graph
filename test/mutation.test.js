// mutation - the checks can fail: faults planted, each in a copy of the built package, are caught. A stale reverse entry: a put
// that replaces an entity keeps the references it held before. A missed delete: a deleted entity's references stay in the
// index. Both are caught by the Exactness check. An entity answered under another kind: get drops its kind check, caught by
// asking for a book as a shelf. The rule engine's (M2): a rule value ignored, cascade-delete read as refuse; a cascade cut short,
// the rules expanded once; a worsening let through, only a new breach refused -- each caught by a scenario the contract answers.
// M3's: a phase re-entered, the conflict let through, a held write not judged, a condition's worsening let through.
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
// M3's scenarios: a phase run once, a conflict reported, a consequence's misfit held, a condition's worsening refused
const tally = (calls) => ({ id: "tally", phase: "first", trigger: { changed: { kind: "task", fields: ["v"] } }, run: () => (calls.push(1), []) });
const phaseOnce = (createEntityGraph) => {
	const calls = [];
	const bump = { id: "bump", phase: "second", trigger: { changed: { kind: "task", fields: ["v"] } }, run: ({ matches }) => matches.map((m) => ({ op: "set", kind: "task", id: m.id, patch: { v: m.after.v + 1 } })) };
	const g = createEntityGraph({ phases: ["first", "second"], kinds: [{ kind: "task", consequences: [tally(calls), bump] }] }, { position: 1, entities: [{ kind: "task", id: "a", record: { v: 0 } }] }).graph;
	const r = g.plan({ items: [{ op: "set", kind: "task", id: "a", patch: { v: 1 } }] });
	return r.ok && calls.length === 1 && r.writes[0].record.v === 2 ? null : { what: "a completed phase was entered again", calls: calls.length, got: r };
};
const conflictReported = (createEntityGraph) => {
	const writer = (id) => ({ id, phase: "first", trigger: { created: ["task"] }, run: () => [{ op: "set", kind: "box", id: "x", patch: { by: id } }] });
	const g = createEntityGraph({ phases: ["first"], kinds: [{ kind: "task", consequences: [writer("one"), writer("two")] }, { kind: "box" }] }, { position: 1, entities: [{ kind: "box", id: "x", record: {} }] }).graph;
	const r = g.plan({ items: [{ op: "create", kind: "task", id: "t", record: {} }] });
	return r.ok === false && r.refusal.code === "consequence-conflict" ? null : { what: "two consequences wrote one entity in one run of a phase", got: r };
};
const heldWriteJudged = (createEntityGraph) => {
	const shape = { $schema: "urn:apnex:shape-check:dialect:1", type: "object", properties: { v: { type: "integer" } } };
	const spoil = { id: "spoil", phase: "first", trigger: { created: ["task"] }, run: ({ matches }) => matches.map((m) => ({ op: "set", kind: "task", id: m.id, patch: { v: "x" } })) };
	const g = createEntityGraph({ phases: ["first"], kinds: [{ kind: "task", shape, consequences: [spoil] }] }).graph;
	const r = g.plan({ items: [{ op: "create", kind: "task", id: "t", record: { v: 1 } }] });
	return r.ok === false && r.refusal.code === "shape-misfit" && r.refusal.details.writers?.[0] === "task.spoil" ? null : { what: "a consequence's write was not held to its kind's shape", got: r };
};
const conditionWorseningRefused = (createEntityGraph) => {
	const crowded = { id: "crowded", check: (graph) => (graph.all("task").length > 1 ? [{ subject: "all", measure: graph.all("task").length - 1, sentence: "too many" }] : []) };
	const g = createEntityGraph({ kinds: [{ kind: "task", conditions: [crowded] }] }, { position: 1, entities: [{ kind: "task", id: "a", record: {} }, { kind: "task", id: "b", record: {} }] }).graph;
	const r = g.plan({ items: [{ op: "create", kind: "task", id: "c", record: {} }] });
	return r.ok === false && r.refusal.code === "condition-broken" ? null : { what: "a condition's worsened breach was let through", got: r };
};
// a shared match list refreshed after a write: a consequence sharing an earlier one's trigger hears what that one created
const sharedRefreshed = (createEntityGraph) => {
	const copy = { id: "copy", phase: "first", trigger: { created: ["note"] }, run: ({ matches }) => matches.filter((m) => !m.id.startsWith("copy-")).map((m) => ({ op: "create", kind: "note", id: `copy-${m.id}`, record: {} })) };
	const seen = { id: "seen", phase: "first", trigger: { created: ["note"] }, run: ({ matches }) => [{ op: "change", kind: "tally", id: "t", record: { seen: matches.map((m) => m.id) } }] };
	const g = createEntityGraph({ phases: ["first"], kinds: [{ kind: "note", consequences: [copy, seen] }, { kind: "tally" }] }, { position: 1, entities: [{ kind: "tally", id: "t", record: {} }] }).graph;
	const r = g.plan({ items: [{ op: "create", kind: "note", id: "a", record: {} }] });
	return r.ok && JSON.stringify(r.writes.find((w) => w.id === "t")?.record.seen) === JSON.stringify(["a", "copy-a"]) ? null : { what: "a shared match list was kept after a write", got: r };
};
const MUTANTS = [
	{ name: "a stale reverse entry", file: "references.js", needle: "this.drop(id); // the references it held before this change" },
	{ name: "a missed delete", file: "references.js", needle: "this.drop(id); // a deleted entity refers to nothing" },
	{ name: "an entity answered under another kind", file: "entity-graph.js", needle: "e !== undefined && e.kind === kind ? e : null", replacement: "e !== undefined ? e : null", check: getUnderOwnKind },
	{ name: "a rule value ignored: cascade-delete read as refuse", file: "reference-rules.js", needle: "if (holder === undefined || ref === undefined || ref.onTargetDelete === \"refuse\")", replacement: "if (holder === undefined || ref === undefined || ref.onTargetDelete !== \"unlink\")", check: cascadeFollowed },
	{ name: "a cascade cut short: the rules expanded once", file: "reference-rules.js", needle: "if (!changed)", replacement: "if (true)", check: chainFollowed },
	{ name: "a worsening let through: only a new breach refuses", file: "reference-rules.js", needle: "if (b.measure <= (was?.measure ?? 0))", replacement: "if (was !== undefined)", check: worseningRefused },
	{ name: "a phase re-entered: each phase run twice", file: "planner.js", needle: "for (const [p, phase] of d.phases.entries()) {", replacement: "for (const [p, phase] of [...d.phases, ...d.phases].entries()) {", check: phaseOnce },
	{ name: "the conflict let through", file: "phases.js", needle: "if (holder !== undefined && holder !== c.key)", replacement: "if (false)", check: conflictReported },
	{ name: "a held write not judged: a consequence's writes spared their shape", file: "reference-rules.js", needle: "touched.has(id) ? shapeBreach(d, entity) : null", replacement: "touched.has(id) && s.lastWrite.get(id)?.by === null ? shapeBreach(d, entity) : null", check: heldWriteJudged },
	{ name: "a shared match list kept after a write", file: "phases.js", needle: "if (found === undefined || found.steps !== s.steps.length)", replacement: "if (found === undefined)", check: sharedRefreshed },
	{ name: "a condition's worsening let through: only a new breach refuses", file: "reference-rules.js", needle: "if (c.measure <= (conditionsBefore.get(key)?.measure ?? 0))", replacement: "if (conditionsBefore.has(key))", check: conditionWorseningRefused },
];

test("each scenario a mutant is caught by answers as the contract says on the built package", async () => {
	const { createEntityGraph } = await import(pathToFileURL(path.join(root, "dist", "index.js")).href);
	for (const mutant of MUTANTS) if (mutant.check) assert.equal(mutant.check(createEntityGraph), null, `${mutant.name}: the scenario fails unmutated`);
});

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
