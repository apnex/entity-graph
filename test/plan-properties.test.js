// plan-properties - planning's properties over random edits of random graphs, every reference option in play (the build
// plan's M2 acceptance): planning changes no answer, accepted or refused; the same edit planned twice is answered alike; an
// accepted plan's net writes, taken in, leave a view equal to a fresh reading of the entities they describe (Exactness), and
// no breach new or worse, read over the whole graph from the entities alone;
// its steps, replayed, describe the same entities, and its reversal restores the start; and every plan ends, its steps
// bounded by what the rules can remove. The same hold with consequences in two phases, a shape and a condition in play (M3),
// and every entity a consequence keeps in step is in step after each accepted plan.
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
// M3's world: a box keeps its count of items in step in the first phase; a removed item leaves a mark in the second; a label's
// n is at most 8, by a dialect 2 shape; and a box holding more than two items breaks a condition
const count = { id: "count", phase: "first", trigger: [{ created: ["box"] }, { changed: { kind: "box", fields: ["items", "count"] } }], run: ({ matches }) => matches.filter((m) => m.after !== null).map((m) => ({ op: "set", kind: "box", id: m.id, patch: { count: (m.after.items ?? []).length } })) };
const mark = { id: "mark", phase: "second", trigger: { deleted: ["item"] }, run: ({ matches, graph }) => matches.map((m) => ({ op: graph.get("lid", `mark-${m.id}`) ? "change" : "create", kind: "lid", id: `mark-${m.id}`, record: { n: 0 } })) };
// M4's: a box holds at most the context's limit of items, two without one; a label created without an identity is named by its
// resolver, and a removal of a label already gone resolves to nothing
const limitOf = (context) => context?.limit ?? 2;
const few = { id: "few", check: ({ graph, context }) => graph.all("box").filter((b) => (b.record.items ?? []).length > limitOf(context)).map((b) => ({ subject: b.id, measure: b.record.items.length - limitOf(context), sentence: `box ${b.id} holds more than ${limitOf(context)} items` })) };
const nameLabel = ({ item, graph }) => {
	if (item.op === "create" && item.id === undefined) return [{ ...item, id: `label-new${graph.all("label").filter((x) => x.id.startsWith("label-new")).length + 1}` }];
	if (item.op === "remove" && graph.get("label", item.id) === null) return [];
	return [item];
};
const PHASED = {
	phases: ["first", "second"],
	kinds: KINDS.map((k) => (k.kind === "box" ? { ...k, consequences: [count], conditions: [few] } : k.kind === "item" ? { ...k, consequences: [mark] } : k.kind === "label" ? { ...k, intentResolver: nameLabel, shape: { $schema: "urn:apnex:shape-check:dialect:2", type: "object", properties: { n: { type: "integer", maximum: 8 } } } } : k)),
};
const NAMES = KINDS.map((k) => k.kind);
const POOL = 7;
// identities any kind may hold, so an edit can remove one kind's entity and create another kind's under its identity (D19)
const SHARED = ["any0", "any1"];

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

function randomEdit(rand, entities, phased = false) {
	const pick = (list) => list[Math.floor(rand() * list.length)];
	const items = [];
	const shared = pick(SHARED);
	if (rand() < 0.15 && entities.has(shared)) items.push({ op: "remove", kind: entities.get(shared).kind, id: shared }, { op: "create", kind: pick(NAMES), id: shared, record: {} });
	for (let n = 1 + Math.floor(rand() * 3); n > 0; n--) {
		const kind = pick(NAMES);
		const id = `${kind}${Math.floor(rand() * POOL)}`;
		const held = entities.get(id);
		const r = rand();
		if (held && r < 0.3) items.push({ op: "remove", kind, id });
		else if (held && r < 0.55) items.push({ op: "set", kind, id, patch: randomRecord(rand, kind, pick) });
		else if (held) items.push({ op: "change", kind, id, record: randomRecord(rand, kind, pick) });
		else items.push({ op: "create", kind, id, record: randomRecord(rand, kind, pick) });
	}
	// M4: a label created unnamed, and a removal of one already gone, which resolves to nothing
	if (phased && rand() < 0.2) items.push({ op: "create", kind: "label", record: { n: Math.floor(rand() * 10) } });
	if (phased && rand() < 0.1) items.push({ op: "remove", kind: "label", id: "label-gone" });
	if (phased && rand() < 0.05) items.splice(0, items.length, { op: "remove", kind: "label", id: "label-gone" });
	return { items };
}

const snapshot = (g, ids) => JSON.stringify([g.position(), ...NAMES.map((k) => g.all(k)), ...ids.flatMap((id) => [g.referrersOf(id), g.targetsOf(id), g.reachable(id)])]);
const applySteps = (start, steps) => {
	const out = new Map([...start].map(([id, x]) => [id, x]));
	for (const s of steps) (s.op === "del" ? out.delete(s.id) : out.set(s.id, { kind: s.kind, record: s.record }));
	return out;
};
const sameEntities = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
// every breach a state holds, read over the whole graph from the entities alone (the corpus's R18; D19), measure by key:
// `found` is the state the edit found, against which a target the edit deleted is told from one that was never there
function breaches(state, found, phased, context) {
	const out = new Map();
	const holders = new Map();
	const add = (key, measure) => measure > 0 && out.set(key, measure);
	for (const [id, { kind, record }] of state) {
		if (phased && kind === "label") add(`label.shape@${id}`, Number.isInteger(record.n) && record.n <= 8 ? 0 : 1);
		if (phased && kind === "box") add(`box.few@${id}`, (record.items ?? []).length - limitOf(context));
		for (const r of REFS[kind]) {
			const value = record[r.field];
			const held = value == null ? [] : r.holds === "one" ? [value] : value;
			add(`${kind}.${r.field}.targets@${id}`, held.filter((t) => (state.has(t) ? !r.targets.includes(state.get(t).kind) : state === found || !found.has(t))).length);
			if (r.onTargetDelete === "refuse" && state !== found) add(`${kind}.${r.field}.onTargetDelete@${id}`, held.filter((t) => !state.has(t) && found.has(t)).length);
			if (r.min != null) add(`${kind}.${r.field}.min@${id}`, r.min - held.length);
			if (r.exclusivity != null) for (const t of held) holders.set(`${kind}.${r.field}.exclusivity@${t}`, (holders.get(`${kind}.${r.field}.exclusivity@${t}`) ?? 0) + 1);
		}
	}
	for (const [key, n] of holders) add(key, n - 1);
	return out;
}

function streams(declaration, seedBase, inStep = () => null) {
	const phased = declaration.phases !== undefined;
	let accepted = 0, refused = 0;
	for (let s = 0; s < 30; s++) {
		const rand = seeded(seedBase + s);
		const pick = (list) => list[Math.floor(rand() * list.length)];
		const opening = [];
		for (const kind of NAMES) for (let i = 0; i < POOL; i++) if (rand() < 0.6) opening.push({ kind, id: `${kind}${i}`, record: randomRecord(rand, kind, pick) });
		// the world starts in step: each box's count is the items it holds
		if (phased) for (const x of opening) if (x.kind === "box") x.record.count = (x.record.items ?? []).length;
		for (const id of SHARED) opening.push({ kind: pick(NAMES), id, record: {} });
		const made = createEntityGraph(declaration, { position: 1, entities: opening });
		assert.equal(made.ok, true, JSON.stringify(made.refusal));
		const g = made.graph;
		let entities = new Map(opening.map((x) => [x.id, { kind: x.kind, record: x.record }]));
		const universe = [...NAMES.flatMap((k) => Array.from({ length: POOL }, (_, i) => `${k}${i}`)), ...SHARED, "ghost"];
		for (let step = 0; step < 25; step++) {
			const edit = randomEdit(rand, entities, phased);
			const context = phased ? [undefined, { limit: 2 }, { limit: 3 }][Math.floor(rand() * 3)] : undefined;
			const options = context === undefined ? undefined : { context };
			const before = snapshot(g, universe);
			const r = g.plan(edit, options);
			assert.equal(snapshot(g, universe), before, `stream ${s} step ${step}: planning changed an answer`);
			assert.deepEqual(g.plan(edit, options), r, `stream ${s} step ${step}: the same edit answered differently`);
			// Q8: an edit whose every item resolves to nothing changes nothing, and is answered so
			if (edit.items.every((x) => x.op === "remove" && x.id === "label-gone")) assert.deepEqual(r, { ok: true, position: g.position(), steps: [], inverse: [], writes: [] }, `stream ${s} step ${step}: nothing to do`);
			if (!r.ok) { refused++; continue; }
			accepted++;
			// every plan ends: each rule step deletes an entity or removes at least one target
			const removable = [...entities.values()].reduce((n, x) => n + 1 + Object.values(x.record).flat().length, 0);
			assert.ok(r.steps.length <= edit.items.length * 2 + removable * 2 + 10, `stream ${s} step ${step}: ${r.steps.length} steps`);
			const after = applySteps(entities, r.writes);
			const was = breaches(entities, entities, phased, context);
			for (const w of r.writes) assert.equal(inStep(w), null, `stream ${s} step ${step}: ${w.kind} ${w.id} out of step`);
			for (const [key, measure] of breaches(after, entities, phased, context)) assert.ok(measure <= (was.get(key) ?? 0), `stream ${s} step ${step}: accepted with ${key} at ${measure}, ${was.get(key) ?? 0} before`);
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
	return { accepted, refused };
}

test("over 30 random graphs and 25 edits each: no answer changed by planning, one answer per edit, Exactness, steps and reversal agreeing, every plan ending", () => {
	const { accepted, refused } = streams({ kinds: KINDS }, 9000);
	assert.ok(accepted > 100 && refused > 20, `both kinds of answer exercised: ${accepted} accepted, ${refused} refused`);
});

test("the same over 30 more, with consequences in two phases, a shape, a condition reading the context and a resolver: each box written keeps its count in step", () => {
	const inStep = (w) => (w.op === "put" && w.kind === "box" && w.record.count !== (w.record.items ?? []).length ? w.record : null);
	const { accepted, refused } = streams(PHASED, 19000, inStep);
	assert.ok(accepted > 100 && refused > 20, `both kinds of answer exercised: ${accepted} accepted, ${refused} refused`);
});
