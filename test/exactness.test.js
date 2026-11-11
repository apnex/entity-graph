// exactness - the vision's Exactness over random streams of changes: every answer, after every change taken in, equals a
// fresh reading of the entities at the position it states (test/support/exactness.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntityGraph } from "../dist/index.js";
import { checkExactness } from "./support/exactness.js";

test("Exactness: after every change in 40 random streams, every answer equals a fresh reading at its position", () => {
	const found = checkExactness(createEntityGraph, { seed: 17, streams: 40, steps: 50 });
	assert.equal(found, null, JSON.stringify(found, null, 1));
});
