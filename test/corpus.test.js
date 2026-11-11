// corpus - the neutral corpus (CONTRACT.md, *Acceptance*; corpus/README.md), every case run unedited.
//
// The harness maps the corpus's format onto this implementation and nothing else: the declaration is the implementation's
// own form, so it is passed as it stands; each write becomes an item of a change; each answer is read into the corpus's
// form, lists compared without regard to order; each refusal label maps to the implementation's code, and every name the
// case lists must be a word of the refusal's subject or its texts. A start at a position above 0 is run twice, filled and
// landed as one change into an empty view, and both must answer alike (corpus/README.md, *Steps*).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createEntityGraph } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "corpus", "batch-1");
const CASES = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

/** The corpus's refusal labels, each mapped to the code this implementation refuses with (corpus/README.md, R9). */
const LABEL_CODES = {
	"target-kind-undeclared": "invalid-declaration", "no-target-kind": "invalid-declaration", "duplicate-kind": "invalid-declaration",
	"duplicate-reference-field": "invalid-declaration", "target-count-undeclared": "invalid-declaration", "onTargetDelete-undeclared": "invalid-declaration",
	"onTargetDelete-invalid": "invalid-declaration", "exclusivity-invalid": "invalid-declaration", "onUnreferenced-invalid": "invalid-declaration",
	"min-without-onBelowMin": "invalid-declaration", "onBelowMin-without-min": "invalid-declaration", "onBelowMin-invalid": "invalid-declaration",
	"min-invalid": "invalid-declaration", "unknown-reference-option": "invalid-declaration",
};

const sorted = (list) => [...list].map((x) => JSON.stringify(x)).sort();
const item = (w) => (w.op === "put" ? { kind: w.kind, id: w.id, record: w.record } : w.op === "del" ? { kind: w.kind, id: w.id, deleted: true } : assert.fail(`no write op ${w.op}`));

/** The implementation's answer to one question, read into the corpus's form, with the position it states. */
function answer(graph, q) {
	const read = (r) => {
		assert.equal(r.ok, true, `${q.q} was refused: ${JSON.stringify(r.refusal)}`);
		return r;
	};
	switch (q.q) {
		case "get": { const r = read(graph.get(q.kind, q.id)); return { position: r.position, value: r.entity === null ? null : r.entity.record, list: false }; }
		case "all": { const r = read(graph.all(q.kind)); return { position: r.position, value: r.entities.map((e) => e.id), list: true }; }
		case "targetsOf": {
			const r = read(q.field === undefined ? graph.targetsOf(q.id) : graph.targetsOf(q.id, q.field));
			return { position: r.position, value: q.field === undefined ? r.targets.map((t) => ({ field: t.field, id: t.id })) : r.targets.map((t) => t.id), list: true };
		}
		case "referrersOf": { const r = read(graph.referrersOf(q.id)); return { position: r.position, value: r.referrers.map((x) => ({ kind: x.kind, id: x.id, field: x.field })), list: true }; }
		case "ownerOf": {
			const r = read(graph.ownerOf(q.member, q.containerKind));
			assert.ok(r.owners.length <= 1, `two holders answered (${r.owners}); the corpus leaves that case owed (R6)`);
			return { position: r.position, value: r.owners[0] ?? null, list: false };
		}
		case "reachable": { const r = read(graph.reachable(q.from)); return { position: r.position, value: r.reached.map((x) => x.id), list: true }; }
		default: return assert.fail(`no question ${q.q}`);
	}
}

function runAccepted(c, mode) {
	const [first, ...rest] = c.steps;
	assert.ok(first?.start, "the first step is a start");
	let graph;
	if (mode === "fill") {
		const made = createEntityGraph(c.declare, { position: first.start.position, entities: first.start.entities });
		assert.equal(made.ok, true, `refused: ${JSON.stringify(made.refusal)}`);
		graph = made.graph;
	} else {
		const made = createEntityGraph(c.declare);
		assert.equal(made.ok, true, `refused: ${JSON.stringify(made.refusal)}`);
		graph = made.graph;
		const landed = graph.applyChange({ position: first.start.position, items: first.start.entities });
		assert.equal(landed.ok, true, `the start, landed as one change, refused: ${JSON.stringify(landed.refusal)}`);
	}
	for (const [i, step] of rest.entries()) {
		if (step.take) {
			const r = graph.applyChange({ position: step.take.position, items: step.take.writes.map(item) });
			assert.equal(r.ok, true, `step ${i + 1}: the change at ${step.take.position} was refused: ${JSON.stringify(r.refusal)}`);
		} else if (step.ask) {
			assert.equal(graph.position(), step.ask.position, `step ${i + 1}: position()`);
			for (const q of step.ask.questions) {
				const got = answer(graph, q);
				const where = `step ${i + 1}, ${JSON.stringify({ ...q, answer: undefined })}`;
				assert.equal(got.position, step.ask.position, `${where}: the position the answer states`);
				if (got.list) assert.deepEqual(sorted(got.value), sorted(q.answer), where);
				else assert.deepEqual(got.value, q.answer, where);
			}
		} else assert.fail(`step ${i + 1} is neither take nor ask`);
	}
}

for (const c of CASES) {
	test(`corpus ${c.case}`, () => {
		if (c.verdict === "refused") {
			const made = createEntityGraph(c.declare);
			assert.equal(made.ok, false, "the declaration was accepted");
			assert.equal(made.refusal.part, c.refusal.part);
			assert.ok(Object.hasOwn(LABEL_CODES, c.refusal.reason), `no code mapped for the label ${c.refusal.reason}`);
			assert.equal(made.refusal.code, LABEL_CODES[c.refusal.reason]);
			const words = new Set([made.refusal.details.subject, made.refusal.what, made.refusal.why, made.refusal.fix].join(" ").split(/[^A-Za-z0-9_-]+/));
			for (const name of c.refusal.names) assert.ok(words.has(name), `the refusal does not name ${name}: ${JSON.stringify(made.refusal.details)}`);
			return;
		}
		assert.equal(c.verdict, "accepted");
		runAccepted(c, "fill");
		if (c.steps[0].start.position > 0 && c.steps[0].start.entities.length > 0) runAccepted(c, "land");
	});
}

test("the corpus is read whole: batch 1's 38 cases, each named for its file", () => {
	assert.equal(CASES.length, 38);
	for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) assert.equal(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).case, f.replace(/\.json$/, ""));
});
