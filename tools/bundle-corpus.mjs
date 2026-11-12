#!/usr/bin/env node
// bundle-corpus - write dist/corpus.json from the case files under corpus/ (shape-check's bundle-shape-corpus, taken under
// draw's H31-10).
//
// Duty: give any consumer one public data path, @apnex/entity-graph/corpus, holding every case of the neutral corpus, batch
// by batch and each batch's cases by file name, with the specifier of each world module a case may name. The case files
// under corpus/ are the master; the bundle is generated from them and never edited.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = path.join(root, "corpus");
const batches = fs.readdirSync(corpus).filter((f) => /^batch-\d+$/.test(f)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
const cases = batches.flatMap((batch) => fs.readdirSync(path.join(corpus, batch)).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(corpus, batch, f), "utf8"))));
const worlds = Object.fromEntries(fs.readdirSync(path.join(corpus, "worlds")).filter((f) => f.endsWith(".mjs")).sort().map((f) => [path.basename(f, ".mjs"), `@apnex/entity-graph/corpus/worlds/${path.basename(f, ".mjs")}`]));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "corpus.json"), JSON.stringify({ worlds, cases }) + "\n");
