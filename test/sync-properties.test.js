// sync-properties - two writers over one store, at random (the build plan's M6 acceptance; docs/DECISIONS.md D41, D42): a
// graph's commit or undo is refused as store-moved exactly when the store has moved since its view's position, leaving its view
// and the store as they were, and otherwise lands where the store gave it; after a sync, each view is a fresh reading of the store
// at its position; and a restart reads back, from the notes, exactly the history each writer holds.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph, createMemoryGraphPort } from "../dist/index.js";
import { seeded } from "./support/exactness.js";

const WORLD = { kinds: [{ kind: "box" }, { kind: "item", references: [{ field: "in", targets: ["box"], holds: "one", onTargetDelete: "cascade-delete" }] }] };
const open = (port, writer) => {
	const made = createEntityGraph(WORLD, undefined, { port, writer });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return made.graph;
};
const view = (g) => JSON.stringify([g.position(), g.all("box"), g.all("item")]);
const history = (g) => JSON.stringify(g.history());

function randomEdit(rand, g) {
	const pick = (list) => list[Math.floor(rand() * list.length)];
	const kind = pick(["box", "item", "item"]);
	const id = `${kind}${Math.floor(rand() * 5)}`;
	const held = g.get(kind, id).entity;
	if (held && rand() < 0.4) return { items: [{ op: "remove", kind, id }] };
	const record = kind === "box" ? { n: Math.floor(rand() * 9) } : { in: `box${Math.floor(rand() * 5)}`, n: Math.floor(rand() * 9) };
	return { items: [{ op: held ? "change" : "create", kind, id, record }] };
}

test("over 20 random runs of 40 steps, two writers over one store: stale edits refused and nothing changed, landed ones where the store gave them, views fresh after sync, histories read back on restart", () => {
	let landed = 0, stale = 0, undone = 0;
	for (let s = 0; s < 20; s++) {
		const rand = seeded(39000 + s);
		const port = createMemoryGraphPort({ position: 0, entities: [{ kind: "box", id: "box0", record: { n: 0 } }] });
		const graphs = { a: open(port, "a"), b: open(port, "b") };
		for (let step = 0; step < 40; step++) {
			const where = `run ${s} step ${step}`;
			const name = rand() < 0.5 ? "a" : "b";
			const g = graphs[name];
			const behind = g.position() !== port.position();
			const before = [view(g), port.position()];
			const act = rand();
			if (act < 0.25) {
				assert.deepEqual(g.sync(), { ok: true, position: port.position() }, `${where}: sync`);
				assert.equal(view(g), view(open(port, "fresh")), `${where}: after a sync, the view a fresh reading of the store`);
				continue;
			}
			const r = act < 0.8 ? g.commit(randomEdit(rand, g)) : g.undo();
			if (!r.ok && r.refusal.code === "store-moved") {
				assert.ok(behind, `${where}: refused as store-moved with the store where the view was`);
				assert.deepEqual([view(g), port.position()], before, `${where}: a stale refusal changed something`);
				stale++;
				continue;
			}
			assert.ok(!behind || (!r.ok) || r.landed === false, `${where}: landed planned from a position the store had left`);
			if (r.ok && r.landed) {
				assert.deepEqual([r.position, g.position()], [port.position(), port.position()], `${where}: landed where the store gave it`);
				if (act < 0.8) landed++;
				else undone++;
			} else assert.deepEqual([view(g), port.position()], before, `${where}: a refusal changed something`);
		}
		for (const name of ["a", "b"]) {
			assert.deepEqual(graphs[name].sync(), { ok: true, position: port.position() });
			assert.equal(history(open(port, name)), history(graphs[name]), `run ${s}: ${name}'s history read back on restart`);
		}
		assert.equal(view(graphs.a), view(graphs.b), `run ${s}: both writers see the store alike`);
	}
	assert.ok(landed > 120 && stale > 60 && undone > 20, `exercised: ${landed} landed, ${stale} stale, ${undone} undone`);
});
