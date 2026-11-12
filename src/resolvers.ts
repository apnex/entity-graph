/**
 * Calling a kind's intent resolver (CONTRACT.md *Intent resolvers*; docs/DECISIONS.md D26, D27): the resolver is handed one
 * requested item, frozen, a reader of the edit as the items before it left it, and the plan's context, and answers the writes the
 * item stands for. What it answers is read once as plain JSON, running none of its code, and must be a list; a resolver that
 * throws, answers otherwise, or reaches for what it was handed is refused by the planner, and nothing of it reaches the view.
 */
import { readPlainJson } from "@apnex/shape-check";
import type { CompiledDeclaration, IntentResolver } from "./declaration.js";
import { openReader } from "./reader.js";
import type { GraphState } from "./scratch.js";

/** The writes an item stands for, or null where the resolver failed to answer them. */
export function resolveItem(state: GraphState, d: CompiledDeclaration, resolver: IntentResolver, item: unknown, context: unknown): unknown[] | null {
	const { reader, close } = openReader(state, d);
	let returned: unknown;
	try {
		returned = Reflect.apply(resolver, undefined, [Object.freeze({ item, graph: reader, context })]);
	} catch {
		return null;
	} finally {
		close();
	}
	const read = readPlainJson(returned as never);
	return read.ok && Array.isArray(read.value) ? (read.value as unknown[]) : null;
}
