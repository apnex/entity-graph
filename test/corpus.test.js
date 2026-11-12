// corpus - the neutral corpus (CONTRACT.md, *Acceptance*; corpus/README.md), every case run unedited.
//
// The harness maps the corpus's format onto this implementation and nothing else: the declaration is the implementation's
// own form, so it is passed as it stands; each write becomes an item of a change; each answer is read into the corpus's
// form, lists compared without regard to order; each refusal label maps to the code and to the member and fault the
// refusal's subject must state, and every name the case lists must be a word of that subject. A start at a position above 0 is run twice, filled and
// landed as one change into an empty view, and both must answer alike (corpus/README.md, *Steps*).
//
// Batches 3 and 4 name a world module and a variant in place of a declaration (corpus/README.md, *World modules*); the harness
// adapts each to this implementation's form and nothing else: a consequence's `name` is its `id` and its function is called
// with the corpus's protocol, `{ changes, view, context }`; a condition's `key` is its kind and `id`, its `check` called with
// `{ view, context }`; a shape, written in a subset of JSON Schema, is handed to shape-check with its dialect named; and `view`
// answers a record or null, and a kind's identities. Batch 4 is M4's, and is left to it by name, never by skipping a case.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEntityGraph } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// every batch directory the corpus holds, none left out (draw's H31-EG-M4)
const BATCHES = fs.readdirSync(path.join(root, "corpus")).filter((f) => /^batch-\d+$/.test(f)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
const filesOf = (batch) => fs.readdirSync(path.join(root, "corpus", batch)).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(root, "corpus", batch, f));
const CASES = BATCHES.flatMap(filesOf).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));

/**
 * The corpus's refusal labels (corpus/README.md, R9), each mapped to what distinguishes it in this implementation's refusal:
 * the code, and its `details.subject`, `<kind>[.<field>][.<member>]: <fault>` -- how deep the path goes, the member refused,
 * and the fault. A label swapped for another, or a fault reported at the wrong member, fails here.
 */
const LABELS = {
	"target-kind-undeclared": { depth: 3, member: "targets", fault: /^undeclared \S+$/ },
	"no-target-kind": { depth: 3, member: "targets", fault: /^(?:missing|empty)$/ },
	"duplicate-kind": { depth: 1, fault: /^duplicate$/ },
	"duplicate-reference-field": { depth: 2, fault: /^duplicate$/ },
	"target-count-undeclared": { depth: 3, member: "holds", fault: /^missing$/ },
	"onTargetDelete-undeclared": { depth: 3, member: "onTargetDelete", fault: /^missing$/ },
	"onTargetDelete-invalid": { depth: 3, member: "onTargetDelete", fault: /^invalid$/ },
	"exclusivity-invalid": { depth: 3, member: "exclusivity", fault: /^invalid$/ },
	"onUnreferenced-invalid": { depth: 3, member: "onUnreferenced", fault: /^invalid$/ },
	"min-without-onBelowMin": { depth: 3, member: "min", fault: /^unpaired$/ },
	"onBelowMin-without-min": { depth: 3, member: "onBelowMin", fault: /^unpaired$/ },
	"onBelowMin-invalid": { depth: 3, member: "onBelowMin", fault: /^invalid$/ },
	"min-invalid": { depth: 3, member: "min", fault: /^invalid$/ },
	"unknown-reference-option": { depth: 3, fault: /^unknown$/ },
	// batch 3's: `<kind>.consequences.<id>.<member>: undeclared <name>`
	"phase-undeclared": { depth: 4, member: "phase", fault: /^undeclared \S+$/ },
	"trigger-kind-undeclared": { depth: 4, member: "trigger", fault: /^undeclared \S+$/ },
};
/** The refusal code every declaration label maps to. */
const DECLARATION_CODE = "invalid-declaration";

/**
 * Batch 2's plan refusal codes (corpus/README.md, R24), each mapped to this implementation's code, one code per label; the
 * rule key, subject, measure and item are compared exactly, as the case states them.
 */
const PLAN_CODES = {
	"reference-rule": "rule-broken", "invalid-reference": "invalid-reference", "unknown-operation": "unknown-operation",
	"entity-absent": "entity-absent", "entity-present": "entity-present", "identity-taken": "identity-taken", "undeclared-kind": "undeclared-kind",
	// batch 3's
	"shape-misfit": "shape-misfit", "condition": "condition-broken", "consequence-conflict": "consequence-conflict",
	// batch 4's
	"invalid-context": "invalid-context",
};

/** The world modules batches 3 and 4 name, each read once. */
const WORLDS = Object.fromEntries(await Promise.all(fs.readdirSync(path.join(root, "corpus", "worlds")).filter((f) => f.endsWith(".mjs")).map(async (f) => [path.basename(f, ".mjs"), await import(pathToFileURL(path.join(root, "corpus", "worlds", f)).href)])));
const DIALECT = "urn:apnex:shape-check:dialect:1";
// the corpus's view over this implementation's reader: a record or null, and the identities of a kind
const viewOf = (graph) => ({ get: (kind, id) => graph.get(kind, id)?.record ?? null, all: (kind) => graph.all(kind).map((e) => e.id) });

/** A world's variant in this implementation's form (corpus/README.md, *What a module exports*, *The functions' protocol*). */
function adapt(variant) {
	return {
		phases: variant.phases,
		kinds: variant.kinds.map((k) => ({
			kind: k.kind,
			...(k.references !== undefined ? { references: k.references } : {}),
			...(k.shape !== undefined ? { shape: { $schema: DIALECT, ...k.shape } } : {}),
			...(k.conditions !== undefined ? { conditions: k.conditions.map((c) => ({ id: c.key.startsWith(`${k.kind}.`) ? c.key.slice(k.kind.length + 1) : c.key, check: ({ graph, context }) => c.check({ view: viewOf(graph), context }) })) } : {}),
			...(k.consequences !== undefined ? {
				consequences: k.consequences.map((q) => ({
					id: q.name, phase: q.phase, trigger: q.trigger,
					run: ({ matches, graph, context }) => q.run({ changes: matches.map(({ kind, id, before, after }) => ({ kind, id, before, after })), view: viewOf(graph), context }),
				})),
			} : {}),
			...(k.intentResolver !== undefined ? { intentResolver: ({ item, graph, context }) => k.intentResolver({ item, view: viewOf(graph), context }) } : {}),
		})),
	};
}
/** The declaration a case names: its own, or its world's variant, adapted. */
const declarationOf = (c) => (c.world === undefined ? c.declare : adapt(WORLDS[c.world][c.variant ?? "base"]));

const sorted = (list) => [...list].map((x) => JSON.stringify(x)).sort();
// everything the view holds, to show a plan changed none of it (corpus/README.md, *Planning changes no answer*)
const held = (graph, kinds) => JSON.stringify([graph.position(), ...kinds.map((k) => graph.all(k))]);
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
	const declare = declarationOf(c);
	const [first, ...rest] = c.steps;
	assert.ok(first?.start, "the first step is a start");
	let graph;
	if (mode === "fill") {
		const made = createEntityGraph(declare, { position: first.start.position, entities: first.start.entities });
		assert.equal(made.ok, true, `refused: ${JSON.stringify(made.refusal)}`);
		graph = made.graph;
	} else {
		const made = createEntityGraph(declare);
		assert.equal(made.ok, true, `refused: ${JSON.stringify(made.refusal)}`);
		graph = made.graph;
		const landed = graph.applyChange({ position: first.start.position, items: first.start.entities });
		assert.equal(landed.ok, true, `the start, landed as one change, refused: ${JSON.stringify(landed.refusal)}`);
	}
	for (const [i, step] of rest.entries()) {
		if (step.take) {
			const r = graph.applyChange({ position: step.take.position, items: step.take.writes.map(item) });
			assert.equal(r.ok, true, `step ${i + 1}: the change at ${step.take.position} was refused: ${JSON.stringify(r.refusal)}`);
		} else if (step.plan) {
			// the edit's items are the implementation's own operations, create, change and remove, so they pass as they stand
			const kinds = declare.kinds.map((k) => k.kind);
			const before = held(graph, kinds);
			assert.equal(graph.position(), step.plan.position, `step ${i + 1}: the position planned from`);
			// a plan's context, as the case states it or as the world module's function builds what no file can state (batch 4)
			const options = Object.hasOwn(step.plan, "context") ? { context: step.plan.context } : Object.hasOwn(step.plan, "contextFrom") ? { context: WORLDS[c.world].contexts[step.plan.contextFrom]() } : undefined;
			const r = graph.plan({ items: step.plan.edit }, options);
			assert.equal(held(graph, kinds), before, `step ${i + 1}: the plan changed what the view holds`);
			if (step.plan.outcome === "accepted") {
				assert.equal(r.ok, true, `step ${i + 1}: refused: ${JSON.stringify(r.refusal)}`);
				assert.equal(r.position, step.plan.position, `step ${i + 1}: the position the plan states`);
				assert.deepEqual(sorted(r.writes), sorted(step.plan.writes), `step ${i + 1}: the net writes`);
			} else {
				assert.equal(step.plan.outcome, "refused");
				assert.equal(r.ok, false, `step ${i + 1}: accepted: ${JSON.stringify(r.writes)}`);
				const want = step.plan.refusal;
				assert.ok(Object.hasOwn(PLAN_CODES, want.code), `no code mapped for the label ${want.code}`);
				const got = { part: r.refusal.part, code: r.refusal.code, ruleKey: r.refusal.details.ruleKey, subject: r.refusal.details.subject, measure: r.refusal.details.measure, opIndex: r.refusal.details.opIndex };
				// batch 3's optional members, compared exactly where a case states them: the consequences that wrote the entity, in
				// `details.writers` (docs/DECISIONS.md D23), and a condition's sentence
				if (Object.hasOwn(want, "writers")) got.writers = r.refusal.details.writers;
				if (Object.hasOwn(want, "sentence")) got.sentence = r.refusal.details.sentence;
				assert.deepEqual(got, { ...want, code: PLAN_CODES[want.code] }, `step ${i + 1}: the refusal`);
			}
		} else if (step.ask) {
			assert.equal(graph.position(), step.ask.position, `step ${i + 1}: position()`);
			for (const q of step.ask.questions) {
				const got = answer(graph, q);
				const where = `step ${i + 1}, ${JSON.stringify({ ...q, answer: undefined })}`;
				assert.equal(got.position, step.ask.position, `${where}: the position the answer states`);
				if (got.list) assert.deepEqual(sorted(got.value), sorted(q.answer), where);
				else assert.deepEqual(got.value, q.answer, where);
			}
		} else assert.fail(`step ${i + 1} is neither take, plan nor ask`);
	}
}

for (const c of CASES) {
	test(`corpus ${c.case}`, () => {
		if (c.verdict === "refused") {
			const made = createEntityGraph(declarationOf(c));
			assert.equal(made.ok, false, "the declaration was accepted");
			assert.equal(made.refusal.part, c.refusal.part);
			const label = LABELS[c.refusal.reason];
			assert.ok(label, `no mapping for the label ${c.refusal.reason}`);
			assert.equal(made.refusal.code, DECLARATION_CODE);
			const subject = made.refusal.details.subject;
			const at = subject.indexOf(": ");
			assert.ok(at > 0, `the subject names no fault: ${subject}`);
			const steps = subject.slice(0, at).split(".");
			const fault = subject.slice(at + 2);
			assert.equal(steps.length, label.depth, `${c.refusal.reason}: refused at ${subject}`);
			if (label.member) assert.equal(steps.at(-1), label.member, `${c.refusal.reason}: refused at ${subject}`);
			assert.match(fault, label.fault, `${c.refusal.reason}: refused at ${subject}`);
			// the names are matched against the subject alone, where the refusal names what it refused, never its fixed texts
			const words = new Set(subject.split(/[^A-Za-z0-9_-]+/));
			for (const name of c.refusal.names) assert.ok(words.has(name), `the refusal's subject does not name ${name}: ${subject}`);
			return;
		}
		assert.equal(c.verdict, "accepted");
		runAccepted(c, "fill");
		if (c.steps[0].start.position > 0 && c.steps[0].start.entities.length > 0) runAccepted(c, "land");
	});
}

test("the corpus is read whole: batch 1's 38 cases, batch 2's 32, batch 3's 18 and batch 4's 7, each named for its file", () => {
	assert.deepEqual(BATCHES.map((b) => filesOf(b).length), [38, 32, 18, 7]);
	assert.deepEqual(BATCHES, ["batch-1", "batch-2", "batch-3", "batch-4"], "every batch directory, run");
	for (const f of BATCHES.flatMap(filesOf)) assert.equal(JSON.parse(fs.readFileSync(f, "utf8")).case, path.basename(f, ".json"));
	const counted = (batch) => CASES.filter((c) => c.batch === batch).flatMap((c) => (c.steps ?? []).filter((st) => st.plan)).map((st) => st.plan.outcome);
	const tally = (batch) => [counted(batch).filter((o) => o === "accepted").length, counted(batch).filter((o) => o === "refused").length];
	assert.deepEqual([tally(2), tally(3), tally(4)], [[62, 26], [33, 14], [12, 10]], "batch 2's 88 plans, 62 accepted and 26 refused; batch 3's 47, 33 and 14; batch 4's 22, 12 and 10");
});
