// positioned-graph-sync - CONTRACT.md's row: a planned edit lands in the store beneath whole or not at all, guarded by the position
// it was planned from, and an edit that does not land leaves every answer as it was; every change that reaches the store, by this
// component or by any other path, is taken in, from the store or from a stream of its changes, in position order, so every answer
// stays true at the position it reports. Served from M6 (docs/DECISIONS.md D40), over the in-memory port and over entity-store.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryStoragePort, openEntityStore } from "@apnex/entity-store";
import { createEntityGraph, createMemoryGraphPort } from "../../dist/index.js";
import { createEntityStorePort } from "../../dist/entity-store-port.js";

const WORLD = { kinds: [{ kind: "item", references: [{ field: "in", targets: ["box"], holds: "one", onTargetDelete: "cascade-delete" }] }, { kind: "box" }] };
const SHAPE = { $schema: "urn:apnex:shape-check:dialect:1", type: "object" };
const stores = {
	memory: () => {
		const port = createMemoryGraphPort();
		return { mine: port, theirs: port };
	},
	"entity-store": () => {
		const store = openEntityStore({ storage: createMemoryStoragePort(), clock: { now: () => 1_700_000_000_000 }, historyMs: 3_600_000, maxEntityBytes: 65536, kinds: { item: SHAPE, box: SHAPE } }).store;
		return { mine: createEntityStorePort(store, { writer: "mine" }), theirs: createEntityStorePort(store, { writer: "theirs" }) };
	},
};
const answers = (g) => JSON.stringify([g.position(), g.all("box"), g.all("item"), g.referrersOf("b")]);

for (const [name, open] of Object.entries(stores)) {
	test(`${name}: a planned edit lands whole, guarded by the position it was planned from, or not at all, every answer as it was`, () => {
		const { mine, theirs } = open();
		const g = createEntityGraph(WORLD, undefined, { port: mine, writer: "mine" }).graph;
		const landed = g.commit({ items: [{ op: "create", kind: "box", id: "b", record: {} }, { op: "create", kind: "item", id: "i", record: { in: "b" } }] });
		assert.deepEqual([landed.ok, landed.position, mine.position()], [true, 1, 1], "two writes, one change");
		theirs.change({ writes: [{ kind: "box", id: "c", record: {} }], expectedPosition: 1 });
		const before = answers(g);
		const stale = g.commit({ items: [{ op: "remove", kind: "box", id: "b" }] });
		assert.deepEqual([stale.ok, stale.refusal?.code, mine.position()], [false, "store-moved", 2], "planned from a position the store has left");
		assert.equal(answers(g), before, "every answer as it was");
	});

	test(`${name}: every change that reaches the store, by this graph or another path, is taken in, in position order, each answer true at its position`, () => {
		const { mine, theirs } = open();
		const g = createEntityGraph(WORLD, undefined, { port: mine, writer: "mine" }).graph;
		g.commit({ items: [{ op: "create", kind: "box", id: "b", record: {} }] });
		theirs.change({ writes: [{ kind: "item", id: "i", record: { in: "b" } }], expectedPosition: 1 });
		theirs.change({ writes: [{ kind: "item", id: "i", deleted: true }, { kind: "item", id: "j", record: { in: "b" } }], expectedPosition: 2 });
		assert.deepEqual(g.sync(2), { ok: true, position: 2 });
		assert.deepEqual(g.referrersOf("b"), { ok: true, position: 2, referrers: [{ kind: "item", id: "i", field: "in" }] });
		assert.deepEqual(g.sync(), { ok: true, position: 3 });
		assert.deepEqual(g.referrersOf("b"), { ok: true, position: 3, referrers: [{ kind: "item", id: "j", field: "in" }] });
		const fresh = createEntityGraph(WORLD, undefined, { port: mine, writer: "mine" }).graph;
		assert.equal(answers(fresh), answers(g), "the answers a fresh reading of the store at that position gives");
	});
}
