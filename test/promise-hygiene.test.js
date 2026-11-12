// promise-hygiene - a value the application hands in, or throws, holding a native promise that rejects never leaves an
// unhandled rejection in the host (zorg's D54 and D55, which shape-check's readPlainJson enforces for plain JSON; docs/DECISIONS.md
// D30): a declaration's member holding one is refused, a member read beside a refused one is observed, a Proxy's trap that throws
// one is refused, and a consequence, a condition or a resolver that throws an object holding one is refused, each promise given a
// handler before the refusal is answered.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";

const rejected = () => Promise.reject(new Error("rejected, and handled by no one but entity-graph"));
// runs fn, lets the event loop turn twice, and answers fn's answer with every unhandled rejection reported meanwhile
async function settled(fn) {
	const seen = [];
	const listener = (reason) => seen.push(reason);
	process.on("unhandledRejection", listener);
	try {
		const answer = fn();
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setTimeout(resolve, 20));
		return { answer, seen };
	} finally {
		process.off("unhandledRejection", listener);
	}
}
const declarationRefused = async (declaration, subject) => {
	const { answer, seen } = await settled(() => createEntityGraph(declaration));
	assert.equal(answer.ok, false, "accepted");
	assert.deepEqual([answer.refusal.code, answer.refusal.details.subject], ["invalid-declaration", subject]);
	assert.equal(seen.length, 0, `${seen.length} unhandled rejection(s)`);
};

test("a declaration's member holding a rejected promise is refused, and the promise observed", async () => {
	await declarationRefused({ kinds: [{ kind: "note", consequences: rejected() }] }, "kinds[0]: invalid");
	await declarationRefused({ phases: ["first"], kinds: [{ kind: "note", consequences: [{ id: "c", phase: "first", trigger: { created: ["note"] }, run: rejected() }] }] }, "note.consequences[0]: invalid");
	await declarationRefused({ kinds: [rejected()] }, "kinds: invalid");
});

test("a member read beside one that refuses the object is observed too, a promise inside it included", async () => {
	await declarationRefused({ kinds: [{ kind: "note", extra: { held: rejected() }, get late() { return 1; } }] }, "kinds[0]: invalid");
	await declarationRefused({ kinds: [{ kind: "note" }, { kind: "tag", list: [rejected()], get late() { return 1; } }] }, "kinds[1]: invalid");
});

test("a refusal for another fault observes what it did not read: a stray member, a later item, an unread option", async () => {
	await declarationRefused({ kinds: [{ kind: "note", stray: { held: rejected() } }] }, "note.stray: unknown");
	await declarationRefused({ kinds: [{ kind: "note", references: [{ get field() { return "x"; } }, { held: rejected() }] }] }, "note.references[0]: invalid");
	const graph = createEntityGraph({ kinds: [{ kind: "note" }] }).graph;
	for (const [code, call] of [
		["invalid-edit", () => graph.plan({ items: [{ op: "create", kind: "note", id: "n", record: {} }], stray: { held: rejected() } })],
		["not-plain", () => graph.plan({ items: [{ op: "create", kind: "note", id: "n", record: new Map() }, { held: rejected() }] })],
		["invalid-edit", () => graph.plan({ items: [{ op: "create", kind: "note", id: "n", record: {} }] }, { mode: { held: rejected() } })],
		["invalid-change", () => graph.applyChange({ position: 2, items: [], stray: { held: rejected() } })],
		["not-plain", () => graph.applyChange({ position: 2, items: [{ kind: "note", id: "n", record: new Map() }, { held: rejected() }] })],
	]) {
		const { answer, seen } = await settled(call);
		assert.equal(answer.refusal?.code, code);
		assert.equal(seen.length, 0, `${code}: ${seen.length} unhandled rejection(s)`);
	}
});

test("a Proxy whose trap throws an object holding a rejected promise is refused, and the promise observed", async () => {
	const throwing = (target) => new Proxy(target, { ownKeys() { throw { held: rejected() }; } });
	await declarationRefused(throwing({}), "declaration: invalid");
	await declarationRefused({ kinds: throwing([]) }, "kinds: invalid");
});

test("a consequence, a condition and a resolver each throwing an object holding a rejected promise are refused, and the promise observed", async () => {
	const thrower = () => { throw { held: rejected() }; };
	const worlds = [
		["consequence-failed", { phases: ["first"], kinds: [{ kind: "note", consequences: [{ id: "c", phase: "first", trigger: { created: ["note"] }, run: thrower }] }] }],
		["condition-failed", { kinds: [{ kind: "note", conditions: [{ id: "k", check: thrower }] }] }],
		["resolver-failed", { kinds: [{ kind: "note", intentResolver: thrower }] }],
	];
	for (const [code, declaration] of worlds) {
		const graph = createEntityGraph(declaration).graph;
		const { answer, seen } = await settled(() => graph.plan({ items: [{ op: "create", kind: "note", id: "n", record: {} }] }));
		assert.equal(answer.refusal?.code, code);
		assert.equal(seen.length, 0, `${code}: ${seen.length} unhandled rejection(s)`);
	}
});

test("a context that is a rejected promise is refused as not plain JSON, and the promise observed", async () => {
	const graph = createEntityGraph({ kinds: [{ kind: "note" }] }).graph;
	const { answer, seen } = await settled(() => graph.plan({ items: [{ op: "create", kind: "note", id: "n", record: {} }] }, { context: rejected() }));
	assert.deepEqual([answer.refusal?.code, answer.refusal?.details.subject], ["invalid-context", "context"]);
	assert.equal(seen.length, 0);
});
