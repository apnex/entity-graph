---
id: C15
category: component
title: entity-graph - synchronous in-memory reference indices and atomic cascade planning over entity-store
status: draft
hydrate-when: Your entities reference one another and you are about to maintain reverse indices, cascade deletes or check cross-entity invariants by hand
sovereignty: internal
supersedes: []
related: [C0, C3, C4, C6, P4, A1, A2, A3]
---

# entity-graph

The contract of record for entity-graph: what a consumer can depend on, scaffolded as a candidate component under zorg's `D35` and `BL33` (`zorg/docs/BACKLOG.md`) and registered as `C15` (`status: draft`) in `mission-kit/components/C15-entity-graph.md`; its vision and contract are drafts awaiting cold reading and the director's ratification.\
It also carries the fields of its mission-kit registry entry (`C15`).

---

## Duty

Maintain an in-memory graph of declared references between typed entities, dated by the store position it reflects, and plan every edit with its cascades, reactions, result invariants and inverse into one atomic change.

---

## Contract

What a consumer can depend on, one capability per row.\
A capability is named for what it offers, not for who offers it, so two components that provide the same capability share its name, and the overlap is visible.\
**Provides** means this component implements the capability; **carries from X** means it passes X's capability through its own interface.\
**Requires** names the capabilities of other components a row depends on, as `component:capability`, so a census can follow an application's demand down through the components it reaches.\
The trait column names any trait a system takes on by using the capability.

| Capability | Relation | Requires | What a consumer can depend on | Trait |
|---|---|---|---|---|
| `graph-declaration` | provides | `shape-check:declared-shape-validation`, `shape-check:plain-json-value` | Each entity kind declares its closed-record shape alongside its reference fields (`targetKinds`, `cardinality: "one" \| "many" \| "ordered"`, `onTargetDelete: "refuse" \| "cascade-delete" \| "unlink"`, optional `exclusivity: "refuse" \| "steal"`, optional `minTargets` with `onBelowMin: "refuse" \| "cascade-delete"`, and optional `acyclicity: true`) plus optional pure `reactions` and `{ key, measure, sentence }` result `invariants`; no kind is built in. | none |
| `dated-graph-view` | provides | none | Synchronous, side-effect-free in-memory lookup of entities and reverse incidence indices stamped with the store `position` they reflect: `position()`, `get(kind, id)`, `all(kind)`, `referrersOf(targetId, filter?)`, `targetsOf(id, field?)`, `ownerOf(memberId, containerKind)`, and `reachable(fromId, filter?)`. | none |
| `plan-graph-change` | provides | `shape-check:declared-shape-validation`, `shape-check:plain-json-value` | Given an intent (one or more creates, updates or deletes), `plan(intent)` runs purely on a scratch projection: it expands declarative cascades (`cascade-delete`, `unlink`, `steal`, `onBelowMin`) and pure kind `reactions` to a fixed point, narrows update patches to changed keys, evaluates referential integrity and kind `invariants` on the resulting state (refusing any edit that introduces a violation or increases an existing violation's `measure`, while allowing partial repairs), and returns `{ ok: true, position, writes, inverse }` or `{ ok: false, refusal }` without mutating the live view. | none |
| `reversible-history` | provides | none | Each planned transaction produces its exact `inverse` batch derived from the pre-state of each forward write (`PL-2`), and an optional bounded in-memory undo/redo stack (`undo`, `redo`) plans and applies the inverse through the same pipeline. | none |
| `positioned-graph-sync` | provides | `entity-store:positioned-entity-write`, `entity-store:expected-revision-write`, `entity-store:changes-since-position` | `commit(intent, options)` submits `plan(intent)`'s expanded `writes` to `entity-store`'s atomic multi-entity `change` with `expectedRevision` guards and advances the in-memory graph to the committed `position`; `applyChange(changeRecord)` incrementally updates the in-memory entities and reverse indices from an `entity-store` or `entity-api` change stream in monotonic `position` order. | `T1` when backed by a durable `entity-store` |

---

## Design owed

- Exact TypeScript signatures for `createEntityGraph`, `GraphKindDeclaration`, `ReferenceFieldDeclaration`, `GraphIntent`, `GraphPlanResult`, and `GraphRefusal` (to be settled before cold reading under `D52`).
- Fixed-point cascade ordering and cycle bound in `plan(intent)` when `onTargetDelete: "unlink"` triggers `onBelowMin: "cascade-delete"` across nested containers (`drawv2` `B81` to `B85`).
- Exact adapter wiring between `GraphWrite` (`put` / `set` / `del`) and `entity-store`'s `ChangeItem` (`create` / `update` / `delete` with `expectedRevision`).

---

## Reference

This repository, `apnex/entity-graph`.\
Currently a scaffold with `VISION.md` and `CONTRACT.md` drafted under `zorg`'s `BL33`.

---

## Edges

**Composes:** nothing registered.

**Consumes, through a declared contract:**

- `shape-check` (`C3`): `declared-shape-validation`, `plain-json-value`
- `entity-store` (`C4`): `positioned-entity-write`, `expected-revision-write`, `changes-since-position`

**Composed-by:** candidate for `drawv2` (replacing `engine/ivm.mjs`, `engine/relations.mjs`, `planner/txn.mjs`, and `model/invariants.mjs` when `drawv2` refactors onto the component set) and for any `zorg` consumer needing cross-entity references and cascades (`BL33`).
