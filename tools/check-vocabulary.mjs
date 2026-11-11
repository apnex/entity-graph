#!/usr/bin/env node
// check-vocabulary - the vocabulary check (docs/DECISIONS.md D10; the build plan's section 7, the Reuse risk): fails when a
// file holds a word of a consumer's vocabulary, in code, a string or a comment. Taken from snap-grid's tools/check-vocabulary.mjs
// unchanged in its match, as every component draw's gate reads carries it.
//
// Every run of letters, digits, underscores and hyphens is a candidate whole, lower-cased, and again with
// its underscores and hyphens removed, so drawV2 and draw_v2 are drawv2; and it is split at case changes,
// underscores, hyphens and between letters and digits -- so nodeCount is node and count, NODE_EXT is node
// and ext, zone2 is zone and 2 -- each part a candidate too. A candidate matches a listed word when it
// equals it, or equals it once a trailing "s" or "es" is removed, so zones and nodes match. An import
// check cannot see a word in a comment; this can. A run of lower-case letters holding a listed word with
// no break inside it -- zonegrid -- cannot be split without a dictionary, and is not caught.
//
// The lists are test data, kept here and never in src/ or a release. A listed word a component
// genuinely needs is allowed by name in its decision record, never by loosening the match.
//
// Usage:  node tools/check-vocabulary.mjs [DIR_OR_FILE ...]    (default: src)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

/** The consumer lists: { consumer: [word, ...] }. */
export function readVocabulary(file = path.join(here, "consumer-vocabulary.json")) {
	return JSON.parse(fs.readFileSync(file, "utf8")).lists;
}

/** Splits text into lower-cased words at case changes, underscores, hyphens, letters against digits, and every other non-word character. */
export function splitWords(text) {
	const words = [];
	for (const run of text.match(/[A-Za-z0-9_-]+/g) ?? []) {
		for (const piece of run.split(/[_-]+/)) {
			if (!piece) continue;
			// a lower-case letter or digit then a capital; a capital then a capital and a lower-case letter; a letter against a digit
			for (const word of piece.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[A-Za-z])(?=[0-9])|(?<=[0-9])(?=[A-Za-z])/)) if (word) words.push(word.toLowerCase());
		}
	}
	return words;
}

/** Every candidate word of a text: each run whole, each run without its underscores and hyphens, and each split word. */
export function candidateWords(text) {
	const out = [];
	for (const run of text.match(/[A-Za-z0-9_-]+/g) ?? []) {
		const whole = run.toLowerCase();
		const joined = whole.replace(/[_-]+/g, "");
		out.push(...new Set([whole, joined, ...splitWords(run)]));
	}
	return out;
}

/** The listed word a candidate matches -- equal, or equal once a trailing "s" or "es" is removed -- or undefined. */
function matching(candidate, owner) {
	if (owner.has(candidate)) return candidate;
	if (candidate.endsWith("s") && owner.has(candidate.slice(0, -1))) return candidate.slice(0, -1);
	if (candidate.endsWith("es") && owner.has(candidate.slice(0, -2))) return candidate.slice(0, -2);
	return undefined;
}

/** Every listed word a text holds: [{ line, word, listed, consumer }], in order, one per candidate that matches. */
export function findVocabulary(text, lists) {
	const owner = new Map();
	for (const [consumer, words] of Object.entries(lists)) for (const w of words) owner.set(w.toLowerCase(), consumer);
	const found = [];
	text.split("\n").forEach((line, i) => {
		for (const word of candidateWords(line)) {
			const listed = matching(word, owner);
			if (listed !== undefined) found.push({ line: i + 1, word, listed, consumer: owner.get(listed) });
		}
	});
	return found;
}

function filesUnder(target) {
	const stat = fs.statSync(target);
	if (stat.isFile()) return [target];
	return fs.readdirSync(target, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => filesUnder(path.join(target, e.name)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const targets = process.argv.slice(2);
	const lists = readVocabulary();
	const files = (targets.length ? targets : [path.join(root, "src")]).flatMap((t) => filesUnder(path.resolve(t)));
	if (files.length === 0) {
		console.log("check-vocabulary: FAIL -- no files found, so nothing was checked");
		process.exit(1);
	}
	let findings = 0;
	for (const file of files) {
		for (const f of findVocabulary(fs.readFileSync(file, "utf8"), lists)) {
			console.log(`  ${path.relative(process.cwd(), file)}:${f.line}  "${f.word}" (${f.consumer}: ${f.listed})`);
			findings++;
		}
	}
	if (findings) {
		console.log(`check-vocabulary: FAIL -- ${findings} word(s) of a consumer's vocabulary in ${files.length} file(s)`);
		process.exit(1);
	}
	console.log(`check-vocabulary: PASS -- ${files.length} file(s), no word of ${Object.keys(lists).join(" or ")}'s vocabulary`);
}
