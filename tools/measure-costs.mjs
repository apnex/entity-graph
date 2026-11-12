#!/usr/bin/env node
// measure-costs - what an answer, an edit, a change taken in, an undo and a redo cost, and what a graph holds in memory, on
// graphs of 1,000, 10,000 and 100,000 entities (VISION.md's Leanness; docs/DECISIONS.md D44).
//
// Method: each size runs in a fresh Node process started with --expose-gc. The world is three neutral kinds: boxes (one per
// hundred entities), ten tags, and items, each item in one box (cascade-delete) and holding one tag (unlink); "with
// consequences" adds a phase whose consequence sets a field on every item an edit creates. Every time is the median of many
// runs after three warm-up runs, in milliseconds by performance.now(): 101 for an answer, 21 for an edit, a change, an undo
// and a redo. Memory is the heap after a full collection with the graph held and its opening released, less the heap before
// the opening was made. Times vary with the machine; the shape - which costs follow the size and which do not - is the claim.
//
// Usage:  node tools/measure-costs.mjs            (after npm run build; prints a markdown table)
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const SIZES = [1000, 10000, 100000];

if (process.argv[2] === undefined) {
	const results = SIZES.map((n) => JSON.parse(execFileSync(process.execPath, ["--expose-gc", fileURLToPath(import.meta.url), String(n)], { encoding: "utf8", maxBuffer: 1 << 24 })));
	const rows = Object.keys(results[0].costs);
	console.log(`Node ${process.version}, medians in ms\n`);
	console.log(`| Cost | ${SIZES.map((n) => `${n.toLocaleString("en")} entities`).join(" | ")} |`);
	console.log(`|---|${SIZES.map(() => "---:").join("|")}|`);
	for (const row of rows) console.log(`| ${row} | ${results.map((r) => format(r.costs[row])).join(" | ")} |`);
	console.log(`| memory per graph | ${results.map((r) => `${(r.heapBytes / 1048576).toFixed(1)} MB (${Math.round(r.heapBytes / r.entities)} B per entity)`).join(" | ")} |`);
	process.exit(0);
}

function format(ms) {
	return ms >= 10 ? ms.toFixed(0) : ms >= 1 ? ms.toFixed(1) : ms >= 0.01 ? ms.toFixed(3) : ms.toFixed(4);
}

const { createEntityGraph, createMemoryGraphPort } = await import("../dist/index.js");
const size = Number(process.argv[2]);
const boxes = size / 100;
const tags = 10;
const items = size - boxes - tags;

const world = (consequences) => ({
	...(consequences ? { phases: ["after"] } : {}),
	kinds: [
		{ kind: "box" },
		{ kind: "tag" },
		{
			kind: "item",
			references: [
				{ field: "in", targets: ["box"], holds: "one", onTargetDelete: "cascade-delete" },
				{ field: "tags", targets: ["tag"], holds: "many", onTargetDelete: "unlink" },
			],
			...(consequences ? { consequences: [{ id: "mark", phase: "after", trigger: { created: ["item"] }, run: ({ matches }) => matches.map((m) => ({ op: "set", kind: "item", id: m.id, patch: { marked: true } })) }] } : {}),
		},
	],
});
const opening = () => [
	...Array.from({ length: boxes }, (_, i) => ({ kind: "box", id: `b${i}`, record: { label: `box ${i}` } })),
	...Array.from({ length: tags }, (_, i) => ({ kind: "tag", id: `t${i}`, record: { label: `tag ${i}` } })),
	...Array.from({ length: items }, (_, i) => ({ kind: "item", id: `i${i}`, record: { in: `b${i % boxes}`, tags: [`t${i % tags}`], n: i } })),
];
const made = (consequences, options) => {
	const answer = createEntityGraph(world(consequences), options?.port ? undefined : { position: 0, entities: opening() }, options);
	if (!answer.ok) throw new Error(JSON.stringify(answer.refusal));
	return answer.graph;
};
// the median of `count` runs, after three warm-up runs: run k calls `time(fn)` around the one call it measures, after any
// preparation, and answers what must hold, checked on every run
function median(count, run) {
	const times = [];
	for (let k = 0; k < count + 3; k++) {
		let ms = null;
		const time = (fn) => {
			const t = performance.now();
			const answer = fn();
			ms = performance.now() - t;
			return answer;
		};
		const ok = run(k, time);
		if (ok !== true || ms === null) throw new Error(`a measured run did not answer as it must: ${JSON.stringify(ok)}`);
		if (k >= 3) times.push(ms);
	}
	return times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
}
const creates = (k, tag) => ({ items: Array.from({ length: k }, (_, i) => ({ op: "create", kind: "item", id: `new-${tag}-${i}`, record: { in: `b${i % boxes}`, tags: [`t${i % tags}`], n: i } })) });

// memory: the heap with the graph held and its opening released, less the heap before
globalThis.gc();
const before = process.memoryUsage().heapUsed;
let held = made(false);
globalThis.gc();
const heapBytes = process.memoryUsage().heapUsed - before;

const costs = {};
const g = held;
costs["get"] = median(101, (k, time) => time(() => g.get("item", `i${(k * 7919) % items}`)).ok);
costs["targetsOf an item"] = median(101, (k, time) => time(() => g.targetsOf(`i${(k * 7919) % items}`)).ok);
costs["ownerOf an item"] = median(101, (k, time) => time(() => g.ownerOf(`i${(k * 7919) % items}`, "box")).ok);
costs["reachable from an item"] = median(101, (k, time) => time(() => g.reachable(`i${(k * 7919) % items}`)).ok);
costs["referrersOf a box (about 100 referrers)"] = median(101, (k, time) => time(() => g.referrersOf(`b${k % boxes}`)).ok);
costs["referrersOf a tag (a tenth of the items)"] = median(101, (k, time) => time(() => g.referrersOf(`t${k % tags}`)).ok);
costs["all boxes (a hundredth of the entities)"] = median(101, (k, time) => time(() => g.all("box")).ok);
costs["all items"] = median(21, (k, time) => time(() => g.all("item")).ok);
for (const k of [1, 10, 100, 1000]) costs[`plan ${k.toLocaleString("en")} creation${k > 1 ? "s" : ""}`] = median(21, (r, time) => {
	const edit = creates(k, r);
	return time(() => g.plan(edit)).ok;
});
const marked = made(true);
for (const k of [1, 100, 1000]) costs[`plan ${k.toLocaleString("en")} creation${k > 1 ? "s" : ""}, a consequence on each`] = median(21, (r, time) => {
	const edit = creates(k, r);
	return time(() => marked.plan(edit)).ok;
});
costs["plan removing a box (about 100 cascade deletes)"] = median(21, (k, time) => time(() => g.plan({ items: [{ op: "remove", kind: "box", id: `b${k % boxes}` }] })).ok);
held = null;

// changes taken in, and commits, undos and redos, over an in-memory store port holding the same entities
const port = createMemoryGraphPort({ position: 0, entities: opening() });
const over = made(false, { port, writer: "measure" });
const other = (writes) => port.change({ writes, expectedPosition: port.position() }).ok;
for (const k of [1, 100]) {
	costs[`applyChange of ${k} write${k > 1 ? "s" : ""}`] = median(21, (r, time) => {
		const change = { position: g.position() + 1, items: Array.from({ length: k }, (_, i) => ({ kind: "item", id: `i${(r * 101 + i) % items}`, record: { in: `b${i % boxes}`, tags: [], n: r } })) };
		return time(() => g.applyChange(change)).ok;
	});
	costs[`sync of a change of ${k} write${k > 1 ? "s" : ""}`] = median(21, (r, time) => {
		other(Array.from({ length: k }, (_, i) => ({ kind: "item", id: `i${(r * 101 + i) % items}`, record: { in: `b${i % boxes}`, tags: [], n: -r } })));
		return time(() => over.sync()).ok;
	});
}
for (const k of [1, 100]) {
	const label = `${k} creation${k > 1 ? "s" : ""}`;
	costs[`commit ${label}`] = median(21, (r, time) => {
		const edit = creates(k, `c${k}-${r}`);
		return time(() => over.commit(edit)).landed === true;
	});
	costs[`undo ${label}`] = median(21, (r, time) => {
		over.commit(creates(k, `u${k}-${r}`));
		return time(() => over.undo()).landed === true;
	});
	costs[`redo ${label}`] = median(21, (r, time) => {
		over.commit(creates(k, `r${k}-${r}`));
		over.undo();
		return time(() => over.redo()).landed === true;
	});
}
process.stdout.write(JSON.stringify({ entities: size, heapBytes, costs }));
