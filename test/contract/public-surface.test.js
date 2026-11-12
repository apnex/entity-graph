// public-surface - the package exposes exactly what export-map.json names: every path in package.json's exports is named
// in the map, each imported by its public name and its runtime exports compared with the map; every capability row of
// CONTRACT.md is served by some export or deferred with a ruling, never both, and a served row has a contract test file
// named for it. M1 serves `dated-graph-view` and defers the others (docs/DECISIONS.md D10). The component plans in a
// browser as on a server, so no source imports a module particular to one runtime, names a global particular to one, or
// reads a clock or randomness.
import assert from "node:assert/strict";
import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(root, "export-map.json"), "utf8"));
const publicName = (p) => (p === "." ? pkg.name : `${pkg.name}/${p.slice(2)}`);
// RESTATED at M4 (docs/DECISIONS.md D26) and M5 (D32): reversible-history is served, and positioned-graph-sync deferred, under
// D32, to M6
const SERVED = ["dated-graph-view", "graph-declaration", "plan-graph-change", "reversible-history"];
const DEFERRED = { "positioned-graph-sync": "D32" };

const contractRows = () => {
	const lines = fs.readFileSync(path.join(root, "CONTRACT.md"), "utf8").split("\n");
	const start = lines.findIndex((l) => /^\|\s*Capability\s*\|\s*Relation\s*\|/.test(l));
	const rows = [];
	for (let i = start + 2; start >= 0 && lines[i]?.startsWith("|"); i++) rows.push(lines[i].split("|")[1].trim().replaceAll("`", ""));
	return rows;
};

test("the export map names the package and exactly its exported paths", () => {
	assert.equal(map.package, pkg.name);
	assert.deepEqual(Object.keys(map.paths).sort(), Object.keys(pkg.exports).sort());
});

for (const [p, entry] of Object.entries(map.paths)) {
	test(`${publicName(p)} exposes what the map names`, async () => {
		const mod = await import(publicName(p));
		assert.deepEqual(Object.keys(mod).sort(), Object.keys(entry.exports).sort());
		for (const [name, use] of Object.entries(entry.exports)) {
			assert.equal(use.part, "entity-graph", `${name} realises the entity-graph part`);
			assert.ok(Array.isArray(use.serves) && use.serves.length > 0, `${name} serves at least one row`);
		}
	});
}

test("every contract row is served or deferred with a ruling, never both; the served rows are M1's, M4's and M5's", () => {
	const rows = contractRows();
	const served = new Set(Object.values(map.paths).flatMap((e) => Object.values(e.exports)).flatMap((x) => x.serves));
	assert.deepEqual([...served].sort(), SERVED);
	assert.deepEqual(map.deferred, DEFERRED);
	assert.deepEqual([...rows].sort(), [...SERVED, ...Object.keys(DEFERRED)].sort(), "every row of CONTRACT.md, once");
	for (const row of SERVED) assert.ok(fs.existsSync(path.join(root, "test", "contract", `${row}.test.js`)), `${row}.test.js`);
	for (const row of Object.keys(DEFERRED)) assert.ok(!fs.existsSync(path.join(root, "test", "contract", `${row}.test.js`)), `${row} is deferred and has no test file`);
});

const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sources(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const specifiers = (text) => [...text.matchAll(/\b(?:import|export)\s+(?:type\s+)?[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);

test("no source imports a module particular to one runtime, names one's global, or reads a clock or randomness", () => {
	const files = sources(path.join(root, "src")).filter((f) => f.endsWith(".ts"));
	assert.ok(files.length > 1, "the sources were read");
	const builtin = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
	for (const f of files) {
		const text = code(fs.readFileSync(f, "utf8"));
		for (const s of specifiers(text)) {
			assert.ok(s.startsWith("./") || s === "@apnex/shape-check", `${path.relative(root, f)} imports ${s}`);
			assert.ok(!builtin.has(s), `${path.relative(root, f)} imports the runtime module ${s}`);
		}
		assert.doesNotMatch(text, /\b(?:process|Buffer|require|window|document|globalThis|self|__dirname)\b/, `${path.relative(root, f)} names a global particular to one runtime`);
		assert.doesNotMatch(text, /\b(?:Date|Math\.random|performance|crypto)\b/, `${path.relative(root, f)} reads a clock or randomness`);
	}
});
