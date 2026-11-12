/**
 * Public surface of entity-graph: exactly what export-map.json names. It serves `dated-graph-view` -- a view taking in changes in
 * position order, and answers dated to a position (docs/DECISIONS.md D10) -- and `graph-declaration` and `plan-graph-change` --
 * a declaration of kinds, their shapes, references, conditions, consequences and resolvers, and planning an edit under it (D26);
 * it defers the other rows to the milestones that build them.
 */
export { createEntityGraph, type EntityGraph, type GraphOpening, type HeldTarget, type ReferenceFilter } from "./entity-graph.js";
export type {
	CompiledReference, ConditionBreach, ConditionDeclaration, ConsequenceDeclaration, GraphChangeHeard, GraphDeclaration, GraphReader, IntentResolver,
	KindDeclaration, ReferenceDeclaration, ReferenceHolding, TriggerClause,
} from "./declaration.js";
export type { Referrer } from "./references.js";
export type { GraphRefusal, GraphRefusalCode, GraphRefusalDetails } from "./refusal.js";
export { GRAPH_LIMITS, type GraphChange, type GraphChangeItem, type GraphEntity, type GraphRecord } from "./view.js";
export type { GraphEdit, GraphEditItem, GraphPlan } from "./planner.js";
export type { GraphStep } from "./scratch.js";
