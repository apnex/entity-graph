/**
 * The reader a consequence or a condition is handed (CONTRACT.md *Consequences and the stopping rule*; docs/DECISIONS.md D22):
 * the entities of one state -- the edit as it stands, or the view as the edit found it -- answered frozen, each list a fresh one,
 * so nothing a function is handed can be changed through it. It answers only during the one call it is handed to; asked
 * afterwards, or asked for a kind the declaration does not hold, it throws, and the planner refuses the call.
 */
import type { CompiledDeclaration, GraphReader } from "./declaration.js";
import type { GraphState } from "./scratch.js";

export function openReader(state: GraphState, d: CompiledDeclaration): { reader: GraphReader; close(): void } {
	let open = true;
	const usable = (kind?: unknown): void => {
		if (!open) throw new Error("entity-graph: this reader answers no longer; it is handed to one call of a consequence or a condition, and answers during it alone");
		if (kind !== undefined && (typeof kind !== "string" || !d.kinds.has(kind))) throw new Error(`entity-graph: no kind ${String(kind)} is declared`);
	};
	const reader: GraphReader = Object.freeze({
		get(kind: string, id: string) {
			usable(kind);
			const entity = state.get(String(id));
			return entity !== undefined && entity.kind === kind ? entity : null;
		},
		all(kind: string) {
			usable(kind);
			return Object.freeze(state.allOf(kind));
		},
		referrersOf(id: string) {
			usable();
			return Object.freeze(state.referrersOf(String(id)).map((r) => Object.freeze({ kind: r.kind, id: r.id, field: r.field })));
		},
		targetsOf(id: string) {
			usable();
			const out: { readonly field: string; readonly id: string }[] = [];
			for (const [field, targets] of state.targetsOf(String(id))) for (const target of targets) out.push(Object.freeze({ field, id: target }));
			return Object.freeze(out);
		},
	});
	return { reader, close: () => { open = false; } };
}
