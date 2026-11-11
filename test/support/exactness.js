// exactness - the vision's Exactness, checked over random streams of changes: after every change, every answer equals what
// a fresh reading of the entities at that position gives. The fresh reading is computed here from the records alone, by
// code that shares nothing with the index under test.
import { WORLD } from "./worlds.js";

/** A seeded generator (mulberry32), so a failing stream replays from its seed. */
export function seeded(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const KINDS = Object.keys(WORLD.kinds);
const refsOf = (kind) => Object.entries(WORLD.kinds[kind].references ?? {});
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.field < b.field ? -1 : a.field > b.field ? 1 : 0);

/** What a fresh reading of `entities` (id -> { kind, record }) answers. */
export function freshReading(entities) {
	const kindOf = (id) => entities.get(id)?.kind ?? null;
	const held = (record, field, holds) => {
		const v = record[field];
		if (holds === "one") return typeof v === "string" ? [v] : [];
		return Array.isArray(v) ? v : [];
	};
	const referrersOf = (target, filter = {}) => {
		const out = [];
		for (const [id, { kind, record }] of entities) {
			if (filter.kinds && !filter.kinds.includes(kind)) continue;
			for (const [field, ref] of refsOf(kind)) {
				if (filter.fields && !filter.fields.includes(field)) continue;
				if (held(record, field, ref.holds).includes(target)) out.push({ kind, id, field });
			}
		}
		return out.sort(byId);
	};
	const targetsOf = (id, only) => {
		const e = entities.get(id);
		if (!e) return { found: false, targets: [] };
		const targets = [];
		for (const [field, ref] of refsOf(e.kind)) {
			if (only !== undefined && field !== only) continue;
			for (const t of held(e.record, field, ref.holds)) targets.push({ field, id: t, kind: kindOf(t) });
		}
		return { found: true, targets };
	};
	const ownerOf = (member, containerKind) => [...new Set(referrersOf(member, { kinds: [containerKind] }).map((r) => r.id))].sort();
	const reachable = (from, filter = {}) => {
		const seen = new Set([from]);
		const queue = [from];
		const reached = [];
		while (queue.length) {
			const e = entities.get(queue.shift());
			if (!e) continue;
			for (const [field, ref] of refsOf(e.kind)) {
				if (filter.fields && !filter.fields.includes(field)) continue;
				for (const t of held(e.record, field, ref.holds)) {
					const k = kindOf(t);
					if (seen.has(t) || k === null || (filter.kinds && !filter.kinds.includes(k))) continue;
					seen.add(t);
					reached.push({ kind: k, id: t });
					queue.push(t);
				}
			}
		}
		return reached.sort(byId);
	};
	const all = (kind) => [...entities].filter(([, e]) => e.kind === kind).map(([id, e]) => ({ kind, id, record: e.record })).sort(byId);
	return { referrersOf, targetsOf, ownerOf, reachable, all };
}

/** One random change over a pool of ids, never refused: each id keeps one kind, deletes only what exists. */
function randomChange(rand, entities, kindById, position) {
	const pick = (list) => list[Math.floor(rand() * list.length)];
	const items = [];
	const touched = new Set();
	const n = 1 + Math.floor(rand() * 4);
	for (let i = 0; i < n; i++) {
		const id = `e${Math.floor(rand() * 24)}`;
		if (touched.has(id)) continue;
		touched.add(id);
		const kind = kindById.get(id) ?? pick(KINDS);
		if (entities.has(id) && rand() < 0.25) { items.push({ kind, id, deleted: true }); continue; }
		const record = { label: `r${position}.${i}` };
		for (const [field, ref] of refsOf(kind)) {
			if (rand() < 0.2) continue;
			const pool = [...kindById].filter(([, k]) => ref.targets.includes(k)).map(([x]) => x).concat([`gone${Math.floor(rand() * 3)}`]);
			if (ref.holds === "one") record[field] = rand() < 0.15 ? null : pick(pool);
			else record[field] = [...new Set(Array.from({ length: Math.floor(rand() * 4) }, () => pick(pool)))];
		}
		kindById.set(id, kind);
		items.push({ kind, id, record });
	}
	return { position, items };
}

/**
 * Runs `streams` streams of `steps` changes each through graphs made by `createEntityGraph`, comparing every answer
 * with the fresh reading after every change. Answers the first difference found, or null.
 */
export function checkExactness(createEntityGraph, { seed = 1, streams = 20, steps = 40 } = {}) {
	for (let s = 0; s < streams; s++) {
		const rand = seeded(seed * 1000 + s);
		const made = createEntityGraph(WORLD);
		if (!made.ok) return { stream: s, step: -1, what: "creation refused", got: made.refusal };
		const graph = made.graph;
		const entities = new Map();
		const kindById = new Map();
		let position = 0;
		for (let step = 0; step < steps; step++) {
			position += 1 + Math.floor(rand() * 3);
			const change = randomChange(rand, entities, kindById, position);
			const r = graph.applyChange(change);
			if (!r.ok) return { stream: s, step, what: "a valid change refused", got: r.refusal, change };
			for (const item of change.items) {
				if (item.deleted) entities.delete(item.id);
				else entities.set(item.id, { kind: item.kind, record: structuredClone(item.record) });
			}
			const fresh = freshReading(entities);
			const universe = [...new Set([...kindById.keys(), "gone0", "gone1", "gone2"])];
			const diff = (what, got, want) => (JSON.stringify(got) === JSON.stringify(want) ? null : { stream: s, step, what, got, want, change });
			const pos = (answer) => (answer.position === position ? null : { stream: s, step, what: "position", got: answer.position, want: position });
			for (const id of universe) {
				const ref = graph.referrersOf(id);
				const found = pos(ref) ?? diff(`referrersOf(${id})`, ref.referrers, fresh.referrersOf(id))
					?? diff(`referrersOf(${id}, waitsOn)`, graph.referrersOf(id, { fields: ["waitsOn"] }).referrers, fresh.referrersOf(id, { fields: ["waitsOn"] }))
					?? diff(`targetsOf(${id})`, (({ found: f, targets }) => ({ found: f, targets }))(graph.targetsOf(id)), fresh.targetsOf(id))
					?? diff(`ownerOf(${id}, team)`, graph.ownerOf(id, "team").owners, fresh.ownerOf(id, "team"))
					?? diff(`ownerOf(${id}, shelf)`, graph.ownerOf(id, "shelf").owners, fresh.ownerOf(id, "shelf"))
					?? diff(`reachable(${id})`, graph.reachable(id).reached, fresh.reachable(id))
					?? diff(`reachable(${id}, task)`, graph.reachable(id, { kinds: ["task"] }).reached, fresh.reachable(id, { kinds: ["task"] }));
				if (found) return found;
			}
			for (const kind of KINDS) {
				const found = diff(`all(${kind})`, graph.all(kind).entities, fresh.all(kind));
				if (found) return found;
			}
		}
	}
	return null;
}
