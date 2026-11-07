---
id: C15
category: component
title: entity-graph - entities held to references and rules declared once, with dated answers and whole, undoable edits
status: draft
hydrate-when: Your entities reference one another and you are about to maintain reverse indices, cascade deletes or check cross-entity invariants by hand
sovereignty: internal
supersedes: []
related: [C0, C1, C3, C4, C5, C6, C11, C12, C13, C14, P4, E5, A1, A2, A3]
---

# entity-graph

The contract of record for entity-graph: what a consumer can depend on, scaffolded as a candidate component under zorg's `D35` and `BL33` (`zorg/docs/BACKLOG.md`) and registered as `C15` (`status: draft`) in `mission-kit/components/C15-entity-graph.md`; its vision is ratified (`D7`), and its contract is a draft whose design is owed.\
It also carries the fields of its mission-kit registry entry (`C15`).\
Each row states what a consumer will depend on at the level `VISION.md` commits to; how each is achieved is owed by the design effort, which is separate and has not started (`D2`), and is listed under *Design owed*.

---

## Duty

Keep an application's entities true to the references and rules it declares once, answering who refers to what as of a known position and landing every edit, with all its consequences, whole or not at all and undoably.

That is the whole duty: answering, planning and undoing are one concern here because each works from the same declaration and the same dated view of it, and whether they stay one component is owed by the design effort (`D5`).

---

## Contract

What a consumer can depend on, one capability per row.\
A capability is named for what it offers, not for who offers it, so two components that provide the same capability share its name, and the overlap is visible.\
**Provides** means this component implements the capability; **carries from X** means it passes X's capability through its own interface.\
**Requires** names the capabilities of other components a row depends on, as `component:capability`, so a census can follow an application's demand down through the components it reaches.\
The trait column names any trait a system takes on by using the capability.

| Capability | Relation | Requires | What a consumer can depend on | Trait |
|---|---|---|---|---|
| `graph-declaration` | provides | `shape-check:declared-shape-validation`, `shape-check:plain-json-value` | Each kind the application declares states in one place, and as data wherever data can say it, the shape of its own records, the references it holds with the rules on each, any condition over its entities as a whole, and any consequence of its own that the reference rules cannot express; every answer and every plan works from that one declaration, and no kind or rule is built in. | none |
| `dated-graph-view` | provides | none | Answers what an entity refers to, what refers to it, and what can be reached from it by following references, each answer stating the store `position` it reflects and true of the entities as they stood at that position; asking changes nothing, and an edit that has not landed never appears in an answer; what a planned edit would do is shown apart, stating the position it was planned from. | none |
| `plan-graph-change` | provides | `shape-check:declared-shape-validation`, `shape-check:plain-json-value` | Given an edit - any set of creations, changes and removals asked for together - shows everything it would do, every consequence through a declared rule or an application-stated consequence included, or refuses it, naming the rule it would break, the entity concerned and the part of the edit that led there; the edit is judged on the state it would leave, no edit may leave a rule more broken than it found it, a partial repair is allowed, and planning changes no answer. | none |
| `reversible-history` | provides | none | An edit that has landed can be undone by a later edit that restores every entity it changed, its consequences included, as it was before; whether that includes an entity's identity after undoing its deletion is design owed (`D6`); an undo is an edit like any other and keeps every commitment of `plan-graph-change` and `positioned-graph-sync`. | none |
| `positioned-graph-sync` | provides | `entity-store:positioned-entity-write`, `entity-store:expected-revision-write`, `entity-store:changes-since-position`, `entity-api:changes-since-position` | A planned edit lands in the store beneath whole or not at all, and an edit that does not land leaves every answer as it was; every change that reaches the store, by this component or by any other path, is taken in, from the store or from a stream of its changes, in `position` order, so every answer stays true at the position it reports. | `T1` when backed by a durable `entity-store` |

---

## Design owed

The design effort owes each item below.\
Each is a question, and any answer keeps every commitment in `VISION.md` and in the rows above.

**Open by the director's rulings.**

- Whether this scope stays one component or splits into a change planner, an entity view and change undo (`D5`; zorg's `D32` and `D35`).
- How a host lands an edit whole (`D3`); the `entity-store` definition (`C4`) declares a multi-item `change` that `entity-store`'s implementation does not yet serve, which is a defect in that implementation (`D4`).
- How an entity's identity survives undoing its deletion, given that the `entity-store` definition forms each identity from the position that created it (`D6`).
- How concurrent conflicting edits are resolved, including an edit and a change that lands while it is being planned, and an undo and a change that landed after the edit it reverses (`D6`).

**Mechanism the earlier draft stated, kept as input to the design (`D2`).**

- Planning on a scratch projection of the current state, without changing the live view.
- Expanding declared consequences and per-kind reactions to a fixed point; `drawv2`'s planner instead runs its reactions in phases declared in a fixed order, the per-operation ones for every operation, requested or emitted, and the transaction-wide ones once each (`planner/txn.mjs`, `PL-3`).
- Reference options: `targetKinds`; `cardinality: "one" | "many" | "ordered"`; `onTargetDelete: "refuse" | "cascade-delete" | "unlink"`; `exclusivity: "refuse" | "steal"`; `minTargets` with `onBelowMin: "refuse" | "cascade-delete"`; `acyclicity: true`.
- Result invariants as `{ key, measure, sentence }`, with a stable rule-and-subject key and a numeric measure (`drawv2`'s `B271`).
- Narrowing each update to the keys that changed.
- Deriving each inverse from the state immediately before its write (`drawv2`'s `PL-2`), and a bounded undo and redo stack that plans and applies inverses.
- Maintaining reverse indices incrementally from the change stream, with lookups in O(1) or O(degree) and maintenance in O(changed references).
- Answering synchronously from a view held in memory, and writing no files.
- Reactions and result-invariant checks supplied by the application as pure functions.
- Planning an edit into one flat batch of writes, and advancing the view to the committed `position` when a commit lands.
- The surface `position()`, `get(kind, id)`, `all(kind)`, `referrersOf(targetId, filter?)`, `targetsOf(id, field?)`, `ownerOf(memberId, containerKind)` and `reachable(fromId, filter?)`; `plan(intent)` returning `{ ok: true, position, writes, inverse }` or `{ ok: false, refusal }`; `commit(intent, options)`; and `applyChange(changeRecord)`.

**Raised by the cold reading of mission-kit's `C15`.**

- How the view is first filled at start, and what it does when the store no longer holds the position it needs.
- What a commit returns when the store refuses it, and whether the edit is planned again.
- Whether a change this component committed is taken in a second time from the stream.
- Which entities an edit's guards cover, so a rule over entities the edit read but did not write still holds when it lands.
- How a client that reaches the store only through `entity-api` (`C6`) lands an edit.
- Which direction `reachable` follows, what a filter is, and what `ownerOf` returns when more than one container holds the member.
- What removing a reference's only target leaves in a reference that holds one target.
- Whether planning ends when consequences imply one another in a cycle, and in what order consequences apply.
- Whether a shape refusal from `shape-check` is a refusal of the plan.
- What a refusal carries, in full.
- How much a rule is broken is measured, so that "more broken" and a partial repair can be judged.
- Whether the view kept in a client is `entity-api`'s deferred `dated-local-view` (`C6`), builds on it, or differs from it, and why (mission-kit's `B106`).
- How an entity created within an edit is named before the store forms its identity.

**Kept from the first draft.**

- Exact TypeScript signatures for `createEntityGraph`, `GraphKindDeclaration`, `ReferenceFieldDeclaration`, `GraphIntent`, `GraphPlanResult`, and `GraphRefusal`, settled by the design effort (`D2`); zorg's `D52` places them before cold reading, and whether that binds this draft's cold reading, which precedes the design, is to be settled against `D52`.
- Ordering and cycle bound in planning when removing a member leaves a container below its minimum across nested containers (`drawv2` `B81` to `B85`).
- How each planned write (`GraphWrite`: `put`, `set`, `del`) maps onto the writes the `entity-store` definition (`C4`) declares - `create`, `update`, `delete` and multi-item `change` - with `expectedRevision`.

---

## Reference

This repository, `apnex/entity-graph`.\
Currently a scaffold with `VISION.md` and `CONTRACT.md` drafted under zorg's `BL33`, and no code.

---

## Edges

**Composes:** nothing registered.

**Consumes, through a declared contract:**

- `shape-check` (`C3`): `declared-shape-validation`, `plain-json-value`
- `entity-store` (`C4`): `positioned-entity-write`, `expected-revision-write`, `changes-since-position`
- `entity-api` (`C6`): `changes-since-position`, through its client half (`createStoreClient`), feeding a view kept in a client

**Composed-by:** candidate for `drawv2` (replacing `engine/ivm.mjs`, `engine/relations.mjs`, `planner/txn.mjs`, and `model/invariants.mjs` when `drawv2` refactors onto the component set) and for any `zorg` consumer needing cross-entity references and cascades (`BL33`).
