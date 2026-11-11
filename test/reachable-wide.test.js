// reachable-wide - reachable walks a wide graph in time linear in what it reaches: its queue is read by a moving index,
// never shifted (Array.prototype.shift moves every element left, so a queue of n shifts costs n squared), and a hub holding
// tens of thousands of targets, a chain behind it, is answered whole.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createEntityGraph } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("no source shifts a queue: a walk reads its queue by a moving index", () => {
	for (const f of fs.readdirSync(path.join(root, "src")).filter((x) => x.endsWith(".ts"))) {
		const code = fs.readFileSync(path.join(root, "src", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
		assert.doesNotMatch(code, /\.shift\(\)/, `${f} shifts an array`);
	}
});

test("a hub holding 60,000 targets, and a chain of 2,000 behind one of them, is answered whole", () => {
	const declaration = { kinds: [{ kind: "hub", references: [{ field: "spokes", targets: ["step"], holds: "many", onTargetDelete: "unlink" }] }, { kind: "step", references: [{ field: "next", targets: ["step"], holds: "one", onTargetDelete: "unlink" }] }] };
	const spokes = Array.from({ length: 60000 }, (_, i) => `s${i}`);
	const chain = Array.from({ length: 2000 }, (_, i) => ({ kind: "step", id: `s${i}`, record: { next: `s${i + 1}` } }));
	const made = createEntityGraph(declaration, { position: 1, entities: [{ kind: "hub", id: "h", record: { spokes } }, ...chain] });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	const reached = made.graph.reachable("h").reached;
	assert.equal(reached.length, 60000, "every spoke, the chain's steps among them, once");
	assert.equal(new Set(reached.map((r) => r.id)).size, 60000);
	assert.equal(reached.filter((r) => r.kind === "step").length, 2000, "the chain's steps held, the other spokes absent");
	assert.equal(made.graph.reachable("s0").reached.length, 2000, "s1 to s2000 down the chain, s2000 absent");
});
