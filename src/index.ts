/**
 * Public surface of entity-graph: exactly what export-map.json names. M1 serves `dated-graph-view` -- a declaration of kinds
 * and their references, a view taking in changes in position order, and answers dated to a position -- and defers the other
 * rows to the milestones that build them (docs/DECISIONS.md D10).
 */
export { createEntityGraph, type EntityGraph, type GraphOpening, type HeldTarget, type ReferenceFilter } from "./entity-graph.js";
export type { CompiledReference, GraphDeclaration, KindDeclaration, ReferenceDeclaration, ReferenceHolding } from "./declaration.js";
export type { Referrer } from "./references.js";
export type { GraphRefusal, GraphRefusalCode, GraphRefusalDetails } from "./refusal.js";
export { GRAPH_LIMITS, type GraphChange, type GraphChangeItem, type GraphEntity, type GraphRecord } from "./view.js";
export type { GraphEdit, GraphEditItem, GraphPlan } from "./planner.js";
export type { GraphStep } from "./scratch.js";
