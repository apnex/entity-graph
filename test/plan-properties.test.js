// plan-properties - planning's properties over random edits of random graphs, every reference option in play (the build
// plan's M2 acceptance): planning changes no answer, accepted or refused; the same edit planned twice is answered alike; an
// accepted plan's net writes, taken in, leave a view equal to a fresh reading of the entities they describe (Exactness);
// its steps, replayed, describe the same entities, and its reversal restores the start; and every plan ends, its steps
// bounded by what the rules can remove.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";
import { freshReading, seeded } from "./support/exactness.js";

const ref = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });
const KINDS = [
	{ kind: "box", references: [ref("items", ["item"], "many", { onUnreferenced: "delete" }), ref("lid", ["lid"], "one", { onTargetDelete: "cascade-delete" })] },
	{ kind: "item", references: [ref("next", ["item"], "one", { onTargetDelete: "cascade-delete" }), ref("tags", ["label"], "many", { onUnreferenced: "delete" })] },
	{ kind: "label" },
	{ kind: "lid" },
	{ kind: "club", references: [ref("people", ["person"], "many", { exclusivity: "steal", min: 2, onBelowMin: "cascade-delete" })] },
	{ kind: "person" },
	{ kind: "desk", references: [ref("chair", ["seat"], "one", { onTargetDelete: "refuse", exclusivity: "refuse" }), ref("crew", ["person"], "many", { min: 1, onBelowMin: "refuse" })] },
	{ kind: "seat" },
];
const REFS = Object.fromEntries(KINDS.map((k) => [k.kind, k.references ?? []]));
const NAMES = KINDS.map((k) => k.kind);
const POOL = 7;

function randomRecord(rand, kind, pick) {
	const record = { n: Math.floor(rand() * 10) };
	for (const r of REFS[kind]) {
		if (rand() < 0.15) continue;
		const candidates = Array.from({ length: POOL }, (_, i) => `${r.targets[0]}${i}`).concat(["ghost"]);
		if (r.holds === "one") record[r.field] = rand() < 0.1 ? null : pick(candidates);
		else record[r.field] = [...new Set(Array.from({ length: Math.floor(rand() * 4) }, () => pick(candidates)))];
	}
	return record;
}

function randomEdit(rand, entities) {
	const pick = (list) => list[Math.floor(rand() * list.length)];
	const items = [];
	for (let n = 1 + Math.floor(rand() * 3); n > 0; n--) {
		const kind = pick(NAMES);
		const id = `${kind}${Math.floor(rand() * POOL)}`;
		const held = entities.get(id);
		const r = rand();
		if (held && r < 0.35) items.push({ op: "del", kind, id });
		else if (held && r < 0.6) items.push({ op: "set", kind, id, patch: randomRecord(rand, kind, pick) });
		else items.push({ op: "put", kind, id, record: randomRecord(rand, kind, pick) });
	}
	return { items };
}

const snapshot = (g, ids) => JSON.stringify([g.position(), ...NAMES.map((k) => g.all(k)), ...ids.flatMap((id) => [g.referrersOf(id), g.targetsOf(id), g.reachable(id)])]);
const applySteps = (start, steps) => {
	const out = new Map([...start].map(([id, x]) => [id, x]));
	for (const s of steps) (s.op === "del" ? out.delete(s.id) : out.set(s.id, { kind: s.kind, record: s.record }));
	return out;
};
const sameEntities = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

test("over 30 random graphs and 25 edits each: no answer changed by planning, one answer per edit, Exactness, steps and reversal agreeing, every plan ending", () => {
	let accepted = 0, refused = 0;
	for (let s = 0; s < 30; s++) {
		const rand = seeded(9000 + s);
		const pick = (list) => list[Math.floor(rand() * list.length)];
		const opening = [];
		for (const kind of NAMES) for (let i = 0; i < POOL; i++) if (rand() < 0.6) opening.push({ kind, id: `${kind}${i}`, record: randomRecord(rand, kind, pick) });
		const made = createEntityGraph({ kinds: KINDS }, { position: 1, entities: opening });
		assert.equal(made.ok, true, JSON.stringify(made.refusal));
		const g = made.graph;
		let entities = new Map(opening.map((x) => [x.id, { kind: x.kind, record: x.record }]));
		const universe = [...NAMES.flatMap((k) => Array.from({ length: POOL }, (_, i) => `${k}${i}`)), "ghost"];
		for (let step = 0; step < 25; step++) {
			const edit = randomEdit(rand, entities);
			const before = snapshot(g, universe);
			const r = g.plan(edit);
			assert.equal(snapshot(g, universe), before, `stream ${s} step ${step}: planning changed an answer`);
			assert.deepEqual(g.plan(edit), r, `stream ${s} step ${step}: the same edit answered differently`);
			if (!r.ok) { refused++; continue; }
			accepted++;
			// every plan ends: each rule step deletes an entity or removes at least one target
			const removable = [...entities.values()].reduce((n, x) => n + 1 + Object.values(x.record).flat().length, 0);
			assert.ok(r.steps.length <= edit.items.length * 2 + removable * 2 + 10, `stream ${s} step ${step}: ${r.steps.length} steps`);
			const after = applySteps(entities, r.writes);
			assert.ok(sameEntities(applySteps(entities, r.steps), after), "the steps describe what the net writes do");
			assert.ok(sameEntities(applySteps(after, r.inverse), entities), "the reversal restores the start");
			if (r.writes.length === 0) continue;
			const taken = g.applyChange({ position: g.position() + 1, items: r.writes.map((w) => (w.op === "del" ? { kind: w.kind, id: w.id, deleted: true } : { kind: w.kind, id: w.id, record: w.record })) });
			assert.equal(taken.ok, true, JSON.stringify(taken.refusal));
			entities = after;
			const fresh = freshReading(entities, REFS);
			for (const id of universe) {
				assert.deepEqual(g.referrersOf(id).referrers, fresh.referrersOf(id), `stream ${s} step ${step}: referrersOf(${id})`);
				assert.deepEqual(g.reachable(id).reached, fresh.reachable(id), `stream ${s} step ${step}: reachable(${id})`);
			}
			for (const k of NAMES) assert.deepEqual(g.all(k).entities, fresh.all(k), `stream ${s} step ${step}: all(${k})`);
		}
	}
	assert.ok(accepted > 100 && refused > 20, `both kinds of answer exercised: ${accepted} accepted, ${refused} refused`);
});
