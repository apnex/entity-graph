// mutation - the Exactness check can fail: two faults of a reverse index, each planted in a copy of the built index, are
// caught. A stale reverse entry: a put that replaces an entity keeps the references it held before. A missed delete: a
// deleted entity's references stay in the index. Each mutant must land, or its verdict would measure nothing.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkExactness } from "./support/exactness.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MUTANTS = [
	{ name: "a stale reverse entry", file: "references.js", needle: "this.drop(id); // the references it held before this change" },
	{ name: "a missed delete", file: "references.js", needle: "this.drop(id); // a deleted entity refers to nothing" },
];

for (const mutant of MUTANTS) {
	test(`Exactness catches ${mutant.name} planted in the index`, async () => {
		// inside the repository, so the copy resolves its dependencies as dist/ does
		const dir = fs.mkdtempSync(path.join(root, ".mutants-"));
		try {
			fs.cpSync(path.join(root, "dist"), dir, { recursive: true });
			const file = path.join(dir, mutant.file);
			const before = fs.readFileSync(file, "utf8");
			assert.equal(before.split(mutant.needle).length, 2, `the needle is in ${mutant.file} exactly once, or the mutant does not land`);
			fs.writeFileSync(file, before.replace(mutant.needle, "/* removed by the mutant */"));
			const { createEntityGraph } = await import(pathToFileURL(path.join(dir, "index.js")).href);
			const found = checkExactness(createEntityGraph, { seed: 3, streams: 10, steps: 30 });
			assert.notEqual(found, null, `${mutant.name} was not caught`);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
}
