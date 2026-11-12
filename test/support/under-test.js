// under-test - the package the corpus and the store ports run against, resolved through its public paths as a consumer resolves
// them: this repository's own package by default, or, with ENTITY_GRAPH_CONSUMER naming a project it is installed into, that
// installed package (tools/consumer-test.mjs), so the corpus it ships is run against the code it ships.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const project = process.env.ENTITY_GRAPH_CONSUMER ?? root;
const resolve = createRequire(path.join(project, "package.json")).resolve;
/** The directory the package under test is resolved from, and its name in a report: this repository, or a consumer's project. */
export const PROJECT = project;
export const UNDER_TEST = project === root ? "this repository" : project;
/** The file a public specifier of the package resolves to. */
export const fileOf = (specifier) => resolve(specifier);
/** The package's main path and its ./entity-store adapter. */
export const graphPackage = await import(pathToFileURL(fileOf("@apnex/entity-graph")).href);
export const entityStoreAdapter = await import(pathToFileURL(fileOf("@apnex/entity-graph/entity-store")).href);
/** The shipped corpus, @apnex/entity-graph/corpus, and each world module it names, imported by its specifier. */
export const shippedCorpus = JSON.parse(fs.readFileSync(fileOf("@apnex/entity-graph/corpus"), "utf8"));
export const shippedWorlds = Object.fromEntries(await Promise.all(Object.entries(shippedCorpus.worlds).map(async ([name, specifier]) => [name, await import(pathToFileURL(fileOf(specifier)).href)])));
