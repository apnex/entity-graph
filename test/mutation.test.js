// mutation - the checks can fail: faults planted, each in a copy of the built package, are caught. A stale reverse entry: a put
// that replaces an entity keeps the references it held before. A missed delete: a deleted entity's references stay in the
// index. Both are caught by the Exactness check. An entity answered under another kind: get drops its kind check, caught by
// asking for a book as a shelf. The rule engine's (M2): a rule value ignored, cascade-delete read as refuse; a cascade cut short,
// the rules expanded once; a worsening let through, only a new breach refused -- each caught by a scenario the contract answers.
// M3's: a phase re-entered, the conflict let through, a held write not judged, a condition's worsening let through.
// M4's: a resolver called against the edit as it was found, its writes given the wrong index, the context not handed to a
// resolver, a consequence or a condition. M5's: a consequence run on undo, a reversal recorded after its write, a pinned edit
// evicted below the hard limit, the note's bound left unchecked. Each mutant must land, or its verdict would measure nothing.
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
	const crowded = { id: "crowded", check: ({ graph }) => (graph.all("task").length > 1 ? [{ subject: "all", measure: graph.all("task").length - 1, sentence: "too many" }] : []) };
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
// M4's scenarios: a resolver sees the edit as the items before it left it; its writes carry the item's index; the context
// reaches each of a consequence, a condition and a resolver
const naming = ({ item, graph, context }) => (item.op === "create" && item.id === undefined ? [{ op: "create", kind: "note", id: `n${graph.all("note").length + 1}`, record: { place: context?.place ?? "inbox", ...item.record } }] : [item]);
const noteWorld = (extra = {}) => ({ kinds: [{ kind: "note", intentResolver: naming, ...extra }] });
const resolvedAgainstTheEdit = (createEntityGraph) => {
	const r = createEntityGraph(noteWorld()).graph.plan({ items: [{ op: "create", kind: "note", record: {} }, { op: "create", kind: "note", record: {} }] });
	return r.ok && r.writes.map((w) => w.id).join() === "n1,n2" ? null : { what: "a resolver did not see the item before it", got: r };
};
// a breach judged on the result names the item its write carries: item 1's note refers to a note that is not there
const resolvedWritesIndexed = (createEntityGraph) => {
	const to = [{ field: "to", targets: ["note"], holds: "one", onTargetDelete: "unlink" }];
	const r = createEntityGraph(noteWorld({ references: to })).graph.plan({ items: [{ op: "create", kind: "note", record: {} }, { op: "create", kind: "note", record: { to: "ghost" } }] });
	return r.ok === false && r.refusal.details.ruleKey === "note.to.targets" && r.refusal.details.opIndex === 1 ? null : { what: "a resolver's write was given another item's index", got: r };
};
const contextToResolver = (createEntityGraph) => {
	const r = createEntityGraph(noteWorld()).graph.plan({ items: [{ op: "create", kind: "note", record: {} }] }, { context: { place: "desk" } });
	return r.ok && r.writes[0].record.place === "desk" ? null : { what: "the context did not reach a resolver", got: r };
};
const contextToConsequence = (createEntityGraph) => {
	const stamp = { id: "stamp", phase: "first", trigger: { created: ["note"] }, run: ({ matches, context }) => matches.map((m) => ({ op: "set", kind: "note", id: m.id, patch: { by: context?.who ?? null } })) };
	const r = createEntityGraph({ phases: ["first"], kinds: [{ kind: "note", consequences: [stamp] }] }).graph.plan({ items: [{ op: "create", kind: "note", id: "a", record: {} }] }, { context: { who: "me" } });
	return r.ok && r.writes[0].record.by === "me" ? null : { what: "the context did not reach a consequence", got: r };
};
const contextToCondition = (createEntityGraph) => {
	const roomy = { id: "roomy", check: ({ graph, context }) => (graph.all("note").length > (context?.limit ?? 1) ? [{ subject: "all", measure: 1, sentence: "too many" }] : []) };
	const g = createEntityGraph({ kinds: [{ kind: "note", conditions: [roomy] }] }, { position: 1, entities: [{ kind: "note", id: "a", record: {} }] }).graph;
	const r = g.plan({ items: [{ op: "create", kind: "note", id: "b", record: {} }] }, { context: { limit: 2 } });
	return r.ok ? null : { what: "the context did not reach a condition", got: r };
};
// M5's scenarios: an undo runs no consequence and restores the state before the edit; a pinned oldest edit holds below the hard
// limit; an undo record past the note's bound is refused by the graph, before the store sees it
const overPort = (mod, declaration, entities, options = {}) => mod.createEntityGraph(declaration, { position: 0, entities }, { port: mod.createMemoryGraphPort(options.port ?? {}), ...(options.history ? { history: options.history } : {}) }).graph;
const undoRunsNothing = (createEntityGraph, mod) => {
	let ran = 0;
	const count = { id: "count", phase: "first", trigger: [{ created: ["item"] }, { deleted: ["item"] }], run: () => (ran++, []) };
	const g = overPort(mod, { phases: ["first"], kinds: [{ kind: "item", consequences: [count] }] }, []);
	g.commit({ items: [{ op: "create", kind: "item", id: "a", record: {} }] });
	const r = g.undo();
	return r.ok && ran === 1 && g.all("item").entities.length === 0 ? null : { what: "a consequence ran on undo", ran, got: r };
};
const undoRestoresBefore = (createEntityGraph, mod) => {
	const g = overPort(mod, { kinds: [{ kind: "item" }] }, [{ kind: "item", id: "a", record: { v: 1 } }]);
	g.commit({ items: [{ op: "set", kind: "item", id: "a", patch: { v: 2 } }] });
	const r = g.undo();
	return r.ok && g.get("item", "a").entity?.record.v === 1 ? null : { what: "the reversal was read after its write", got: r };
};
const pinHolds = (createEntityGraph, mod) => {
	const g = overPort(mod, { kinds: [{ kind: "item" }] }, [], { history: { count: 1, hardCount: 3, pin: ({ writes }) => writes.some((w) => w.id === "a") } });
	for (const id of ["a", "b", "c"]) g.commit({ items: [{ op: "create", kind: "item", id, record: {} }] });
	return g.history().edits.length === 3 ? null : { what: "a pinned edit was evicted below the hard limit", got: g.history() };
};
const noteBoundChecked = (createEntityGraph, mod) => {
	const g = overPort(mod, { kinds: [{ kind: "item" }] }, [], { port: { noteBound: 100 } });
	const r = g.commit({ items: [{ op: "create", kind: "item", id: "a", record: { text: "x".repeat(200) } }] });
	return r.ok === false && r.refusal.code === "note-bound" ? null : { what: "the note's bound was not checked before the store", got: r };
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
	{ name: "a resolver called against the edit as it was found, not as the items before it left it", file: "planner.js", needle: "resolveItem(s, d, resolver, item, context)", replacement: "resolveItem(new Scratch(view, d), d, resolver, item, context)", check: resolvedAgainstTheEdit },
	{ name: "a resolver's writes given the first item's index", file: "planner.js", needle: "applyItem(s, d, write, `items[${i}].writes[${j}]`, i, null)", replacement: "applyItem(s, d, write, `items[${i}].writes[${j}]`, 0, null)", check: resolvedWritesIndexed },
	{ name: "the context not handed to a resolver", file: "resolvers.js", needle: "freeze({ item, graph: reader, context })", replacement: "freeze({ item, graph: reader, context: undefined })", check: contextToResolver },
	{ name: "the context not handed to a consequence", file: "phases.js", needle: "freeze({ matches: heard, graph: reader, context })", replacement: "freeze({ matches: heard, graph: reader, context: undefined })", check: contextToConsequence },
	{ name: "the context not handed to a condition", file: "phases.js", needle: "freeze({ graph: reader, context })", replacement: "freeze({ graph: reader, context: undefined })", check: contextToCondition },
	{ name: "a consequence run on undo", file: "replay.js", needle: "const writes = s.netWrites();", replacement: "for (const phase of d.phases) runPhase(s, d, phase, context); const writes = s.netWrites();", also: [["import { readConditions } from \"./phases.js\";", "import { readConditions, runPhase } from \"./phases.js\";"]], check: undoRunsNothing },
	{ name: "a reversal recorded after its write", file: "entity-graph.js", needle: "[w.kind, w.id, view.get(w.id)?.record ?? null, w.op === \"put\" ? w.record : null]", replacement: "[w.kind, w.id, w.op === \"put\" ? w.record : null, w.op === \"put\" ? w.record : null]", check: undoRestoresBefore },
	{ name: "a pinned edit evicted below the hard limit", file: "history.js", needle: "if (oldest.pinned && held <= hardCount && size <= hardBytes)", replacement: "if (false)", check: pinHolds },
	{ name: "the note's bound left unchecked", file: "entity-graph.js", needle: "if (bytes > port.noteBound)", replacement: "if (false)", check: noteBoundChecked },
	{ name: "a condition's worsening let through: only a new breach refuses", file: "reference-rules.js", needle: "if (c.measure <= (conditionsBefore.get(key)?.measure ?? 0))", replacement: "if (conditionsBefore.has(key))", check: conditionWorseningRefused },
];

test("each scenario a mutant is caught by answers as the contract says on the built package", async () => {
	const mod = await import(pathToFileURL(path.join(root, "dist", "index.js")).href);
	for (const mutant of MUTANTS) if (mutant.check) assert.equal(mutant.check(mod.createEntityGraph, mod), null, `${mutant.name}: the scenario fails unmutated`);
});

// B1 at 27276b1 (docs/DECISIONS.md D38): an undo carrying an identity across kinds is refused twice over - by the replay, and by
// land's check of the change against the view before the store sees it - so with the replay's guard planted out, land's alone
// keeps the store and the view equal; and with both planted out, the store moves where the view cannot follow, as it did
const crossKinds = (mod) => {
	const port = mod.createMemoryGraphPort();
	const g = mod.createEntityGraph({ kinds: [{ kind: "person" }, { kind: "tag" }] }, { position: 0, entities: [{ kind: "person", id: "x", record: {} }] }, { port }).graph;
	g.commit({ items: [{ op: "remove", kind: "person", id: "x" }] });
	g.commit({ items: [{ op: "create", kind: "tag", id: "x", record: {} }] });
	const r = g.undo(1);
	return { refused: r.ok === false, equal: port.position() === g.position() };
};
const planted = async (edits) => {
	const dir = fs.mkdtempSync(path.join(root, ".mutants-"));
	try {
		fs.cpSync(path.join(root, "dist"), dir, { recursive: true });
		for (const [file, needle, replacement] of edits) {
			const text = fs.readFileSync(path.join(dir, file), "utf8");
			assert.equal(text.split(needle).length, 2, `the needle is in ${file} exactly once: ${needle}`);
			fs.writeFileSync(path.join(dir, file), text.replace(needle, replacement));
		}
		return crossKinds(await import(pathToFileURL(path.join(dir, "index.js")).href));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
};
test("an undo carrying an identity across kinds: land's check alone keeps the store and the view equal, and without both they part", async () => {
	const replayGuard = ["replay.js", "if (crossing !== undefined)", "if (false)"];
	const landGuard = ["entity-graph.js", "if (unfit !== null)", "if (false)"];
	assert.deepEqual(await planted([replayGuard]), { refused: true, equal: true }, "land's check alone");
	assert.deepEqual(await planted([replayGuard, landGuard]), { refused: true, equal: false }, "neither: the store moved, the view did not");
});

for (const mutant of MUTANTS) {
	test(`the suite catches ${mutant.name}, planted in a copy of dist/`, async () => {
		// inside the repository, so the copy resolves its dependencies as dist/ does
		const dir = fs.mkdtempSync(path.join(root, ".mutants-"));
		try {
			fs.cpSync(path.join(root, "dist"), dir, { recursive: true });
			const file = path.join(dir, mutant.file);
			let text = fs.readFileSync(file, "utf8");
			// a mutant is one edit, or several in one file (`also`), each needle there exactly once
			for (const [needle, replacement] of [[mutant.needle, mutant.replacement], ...(mutant.also ?? [])]) {
				assert.equal(text.split(needle).length, 2, `the needle is in ${mutant.file} exactly once, or the mutant does not land: ${needle}`);
				text = text.replace(needle, replacement ?? "/* removed by the mutant */");
			}
			fs.writeFileSync(file, text);
			const mod = await import(pathToFileURL(path.join(dir, "index.js")).href);
			const { createEntityGraph } = mod;
			const found = mutant.check ? mutant.check(createEntityGraph, mod) : checkExactness(createEntityGraph, { seed: 3, streams: 10, steps: 30 });
			assert.notEqual(found, null, `${mutant.name} was not caught`);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
}
