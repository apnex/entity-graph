// history-properties - undo and redo over random edits of random graphs, committed through an in-memory store port (the build
// plan's M5 acceptance; docs/DECISIONS.md D33): an undo that lands restores every entity as it stood before the edit, and one
// refused is refused for a rule the restored state would break more, leaving the view and the store as they were; a redo after
// it restores the edit's result; no consequence runs in either; and the store holds exactly the changes the graph landed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph, createMemoryGraphPort } from "../dist/index.js";
import { seeded } from "./support/exactness.js";

let ran = 0;
const ref = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });
const size = { id: "size", phase: "first", trigger: [{ created: ["file"] }, { changed: { kind: "file", fields: ["text"] } }], run: ({ matches }) => (ran++, matches.filter((m) => m.after !== null).map((m) => ({ op: "set", kind: "file", id: m.id, patch: { size: String(m.after.text ?? "").length } }))) };
const roomy = { id: "roomy", check: ({ graph }) => (graph.all("file").length > 6 ? [{ subject: "files", measure: graph.all("file").length - 6, sentence: "more than six files" }] : []) };
const WORLD = {
	phases: ["first"],
	kinds: [
		{ kind: "folder", references: [ref("parent", ["folder"], "one", { onTargetDelete: "cascade-delete" })] },
		{ kind: "file", references: [ref("in", ["folder"], "one", { onTargetDelete: "cascade-delete" }), ref("tags", ["tag"], "many", { onUnreferenced: "delete" })], consequences: [size], conditions: [roomy] },
		{ kind: "tag" },
	],
};
const RULE_CODES = new Set(["rule-broken", "shape-misfit", "condition-broken"]);
const POOL = 5;
const snapshot = (g) => JSON.stringify(["folder", "file", "tag"].map((k) => g.all(k).entities));

function randomEdit(rand, g) {
	const pick = (list) => list[Math.floor(rand() * list.length)];
	const items = [];
	for (let n = 1 + Math.floor(rand() * 3); n > 0; n--) {
		const kind = pick(["folder", "file", "file", "tag"]);
		const id = `${kind}${Math.floor(rand() * POOL)}`;
		const held = g.get(kind, id).entity;
		const record = kind === "folder" ? { parent: rand() < 0.5 ? null : `folder${Math.floor(rand() * POOL)}` } : kind === "file" ? { in: `folder${Math.floor(rand() * POOL)}`, text: "x".repeat(Math.floor(rand() * 5)), tags: [...new Set([pick(["tag0", "tag1", "tag2"]), pick(["tag0", "tag3"])])] } : {};
		if (held && rand() < 0.4) items.push({ op: "remove", kind, id });
		else if (held) items.push({ op: "change", kind, id, record });
		else items.push({ op: "create", kind, id, record });
	}
	return { items };
}

test("over 20 random graphs and 30 edits each: an undo restores the state before its edit or is refused for a rule, a redo restores the edit's result, and nothing runs again", () => {
	let landed = 0, undone = 0, refusedUndo = 0, redone = 0;
	for (let s = 0; s < 20; s++) {
		const rand = seeded(29000 + s);
		const port = createMemoryGraphPort();
		const opening = [{ kind: "folder", id: "folder0", record: { parent: null } }, { kind: "folder", id: "folder1", record: { parent: "folder0" } }, { kind: "tag", id: "tag0", record: {} }];
		const made = createEntityGraph(WORLD, { position: 0, entities: opening }, { port });
		assert.equal(made.ok, true, JSON.stringify(made.refusal));
		const g = made.graph;
		let changes = 0;
		for (let step = 0; step < 30; step++) {
			const where = `stream ${s} step ${step}`;
			const before = snapshot(g);
			const r = g.commit(randomEdit(rand, g));
			if (!r.ok || r.writes.length === 0) {
				assert.equal(snapshot(g), before, `${where}: a commit that did not land changed the view`);
				continue;
			}
			landed++;
			changes++;
			const after = snapshot(g);
			if (rand() < 0.5) continue;
			const calls = ran;
			const u = g.undo();
			assert.equal(ran, calls, `${where}: a consequence ran on undo`);
			if (!u.ok) {
				assert.ok(RULE_CODES.has(u.refusal.code), `${where}: undo refused as ${u.refusal.code}`);
				assert.equal(snapshot(g), after, `${where}: a refused undo changed the view`);
				refusedUndo++;
				continue;
			}
			undone++;
			changes++;
			assert.equal(snapshot(g), before, `${where}: the undo did not restore the state before the edit`);
			if (rand() < 0.3) continue;
			const d = g.redo();
			assert.equal(ran, calls, `${where}: a consequence ran on redo`);
			assert.equal(d.ok, true, `${where}: redo refused: ${JSON.stringify(d.refusal)}`);
			redone++;
			changes++;
			assert.equal(snapshot(g), after, `${where}: the redo did not restore the edit's result`);
		}
		let held = 0;
		for (let since = 0, page = port.changes(0); ; page = port.changes(since)) {
			held += page.changes.length;
			if (page.next === null || page.next === undefined) break;
			since = page.next;
		}
		assert.equal(held, changes, `stream ${s}: the store holds the changes the graph landed, and only those`);
		assert.equal(port.position(), g.position());
	}
	assert.ok(landed > 200 && undone > 60 && redone > 30, `exercised: ${landed} landed, ${undone} undone, ${refusedUndo} undos refused, ${redone} redone`);
});
