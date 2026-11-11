// vocabulary - no word of a consumer's vocabulary in src/ (tools/check-vocabulary.mjs, tools/consumer-vocabulary.json;
// docs/DECISIONS.md D10), in code, a string or a comment; and the check finds a word planted in a copy, so it can fail.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (...targets) => spawnSync(process.execPath, [path.join(root, "tools/check-vocabulary.mjs"), ...targets], { cwd: root, encoding: "utf8" });

test("src/ holds no word of a consumer's vocabulary", () => {
	const r = run();
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /check-vocabulary: PASS -- \d+ file\(s\)/);
});

test("a word planted in a copy of a source file is found, whole, split or plural", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vocabulary-"));
	try {
		const file = path.join(dir, "planted.ts");
		fs.writeFileSync(file, "export const nodeCount = 1;\n// the zones it holds\nconst DRAW_V2 = 2;\n");
		const r = run(file);
		assert.equal(r.status, 1, r.stdout);
		for (const want of [/"node" \(draw: node\)/, /"zones" \(draw: zone\)/, /"drawv2" \(draw: drawv2\)/]) assert.match(r.stdout, want);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
