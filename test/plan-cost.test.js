// plan-cost - what a plan costs follows what the edit touches, not what the view holds (the build plan's section 7; docs/
// DECISIONS.md D17, D19): a cascade past the net-write bound is refused as soon as the bound is certain to be passed; a cascade
// within it is accepted in time linear in its writes; and a field set on an entity many others hold reads none of them. The
// bounds stated are generous against the times measured, so a slow machine passes and a quadratic one does not.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";

const ref = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });
const graph = (kinds, entities) => {
	const made = createEntityGraph({ ...(kinds.some((k) => k.consequences) ? { phases: ["first"] } : {}), kinds }, { position: 1, entities });
	assert.equal(made.ok, true, JSON.stringify(made.refusal));
	return made.graph;
};
const RINGS = [{ kind: "ring", references: [ref("next", ["ring"], "one", { onTargetDelete: "cascade-delete" })] }];
const chain = (n) => graph(RINGS, Array.from({ length: n }, (_, i) => ({ kind: "ring", id: `r${i}`, record: { next: i === 0 ? null : `r${i - 1}` } })));
const timed = (fn) => {
	const t = performance.now();
	const r = fn();
	return [r, performance.now() - t];
};

test("a cascade past the net-write bound is refused as soon as the bound is certain to be passed: a chain of 16,000", { timeout: 20000 }, () => {
	const g = chain(16000);
	const [r, ms] = timed(() => g.plan({ items: [{ op: "remove", kind: "ring", id: "r0" }] }));
	assert.equal(r.ok, false);
	assert.equal(r.refusal.code, "too-many-writes");
	assert.equal(r.refusal.details.ruleKey, "net-writes");
	assert.ok(r.refusal.details.measure > 2000, `measure ${r.refusal.details.measure}`);
	assert.ok(ms < 1000, `refused in ${ms.toFixed(0)} ms`);
});

test("a cascade of 1,999 net writes is accepted, in time linear in them", { timeout: 20000 }, () => {
	const g = chain(1999);
	const [r, ms] = timed(() => g.plan({ items: [{ op: "remove", kind: "ring", id: "r0" }] }));
	assert.equal(r.ok, true, JSON.stringify(r.refusal));
	assert.equal(r.writes.length, 1999);
	assert.ok(ms < 150, `accepted in ${ms.toFixed(0)} ms`);
});

test("a field set on an entity 20,000 others hold reads none of them", { timeout: 20000 }, () => {
	const kinds = [{ kind: "tag" }, { kind: "book", references: [ref("tags", ["tag"], "many")] }];
	const g = graph(kinds, [{ kind: "tag", id: "t", record: {} }, ...Array.from({ length: 20000 }, (_, i) => ({ kind: "book", id: `b${i}`, record: { tags: ["t"] } }))]);
	const times = [];
	for (let i = 0; i < 21; i++) times.push(timed(() => g.plan({ items: [{ op: "set", kind: "tag", id: "t", patch: { label: `l${i}` } }] }))[1]);
	times.sort((a, b) => a - b);
	assert.ok(times[10] < 3, `median ${times[10].toFixed(2)} ms`);
});

test("300 consequences listening to a kind an edit touches 2,000 times each read the edit's changes once worked out (D25)", { timeout: 20000 }, () => {
	// each listener is handed all 2,000 changes, or writes what refuses the plan
	const listeners = (distinct) => Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, phase: "first", trigger: { changed: { kind: "item", fields: distinct ? ["v", `f${i}`] : ["v"] } }, run: ({ matches }) => (matches.length === 2000 ? [] : [{ op: "remove", kind: "item", id: "missing" }]) }));
	const entities = Array.from({ length: 2000 }, (_, i) => ({ kind: "item", id: `i${i}`, record: { v: 0, deep: { list: [1, 2, 3], text: "x".repeat(50) } } }));
	const edit = { items: Array.from({ length: 2000 }, (_, i) => ({ op: "set", kind: "item", id: `i${i}`, patch: { v: 1 } })) };
	// the best of three plans, so a test file running beside this one, or a cold start, does not decide it
	const best = (g) => {
		let fastest = Infinity;
		for (let k = 0; k < 3; k++) {
			const [r, ms] = timed(() => g.plan(edit));
			assert.equal(r.ok, true, JSON.stringify(r.refusal));
			fastest = Math.min(fastest, ms);
		}
		return fastest;
	};
	const sharedMs = best(graph([{ kind: "item", consequences: listeners(false) }], entities));
	assert.ok(sharedMs < 250, `one trigger: planned in ${sharedMs.toFixed(0)} ms`);
	const distinctMs = best(graph([{ kind: "item", consequences: listeners(true) }], entities));
	assert.ok(distinctMs < 500, `300 distinct triggers: planned in ${distinctMs.toFixed(0)} ms`);
});
