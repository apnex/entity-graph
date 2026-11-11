// mutation - the checks can fail: faults planted, each in a copy of the built package, are caught. A stale reverse entry: a put
// that replaces an entity keeps the references it held before. A missed delete: a deleted entity's references stay in the
// index. Both are caught by the Exactness check. An entity answered under another kind: get drops its kind check, caught by
// asking for a book as a shelf. Each mutant must land, or its verdict would measure nothing.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkExactness } from "./support/exactness.js";
import { WORLD } from "./support/worlds.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// a kind's question answered under another kind's name: get finds an entity by identity, so it must check the kind asked
const getUnderOwnKind = (createEntityGraph) => {
	const g = createEntityGraph(WORLD, { position: 1, entities: [{ kind: "book", id: "b1", record: {} }] }).graph;
	return g.get("shelf", "b1").entity === null ? null : { what: "get answered a book under the kind shelf" };
};
const MUTANTS = [
	{ name: "a stale reverse entry", file: "references.js", needle: "this.drop(id); // the references it held before this change" },
	{ name: "a missed delete", file: "references.js", needle: "this.drop(id); // a deleted entity refers to nothing" },
	{ name: "an entity answered under another kind", file: "entity-graph.js", needle: "e !== undefined && e.kind === kind ? e : null", replacement: "e !== undefined ? e : null", check: getUnderOwnKind },
];

for (const mutant of MUTANTS) {
	test(`the suite catches ${mutant.name}, planted in a copy of dist/`, async () => {
		// inside the repository, so the copy resolves its dependencies as dist/ does
		const dir = fs.mkdtempSync(path.join(root, ".mutants-"));
		try {
			fs.cpSync(path.join(root, "dist"), dir, { recursive: true });
			const file = path.join(dir, mutant.file);
			const before = fs.readFileSync(file, "utf8");
			assert.equal(before.split(mutant.needle).length, 2, `the needle is in ${mutant.file} exactly once, or the mutant does not land`);
			fs.writeFileSync(file, before.replace(mutant.needle, mutant.replacement ?? "/* removed by the mutant */"));
			const { createEntityGraph } = await import(pathToFileURL(path.join(dir, "index.js")).href);
			const found = mutant.check ? mutant.check(createEntityGraph) : checkExactness(createEntityGraph, { seed: 3, streams: 10, steps: 30 });
			assert.notEqual(found, null, `${mutant.name} was not caught`);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
}
