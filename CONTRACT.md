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
Each row states what a consumer will depend on at the level `VISION.md` commits to; how each is achieved is owed by the design effort (`D2`), which began with the build plan (`docs/BUILD-PLAN.md`) and has built its first two milestones, the dated view and planning with the reference rules (`D10`, `D15`); what it still owes is listed under *Design owed*.\
The terms under *Terms of the rows* carry the requirements its first candidate consumer, `drawv2`, records under mission-kit's `0117`, drafted with zorg's agreement and ruled by the director (`D8`, `D9`); the reference rules are built, and the other terms are not yet (`D15`).

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
| `graph-declaration` | provides | `shape-check:declared-shape-validation`, `shape-check:plain-json-value` | Each kind the application declares states in one place, and as data wherever data can say it, the shape of its own records, the references it holds with the rules on each, any condition over its entities that a shape cannot state, any consequence of its own that the reference rules cannot express, each with a trigger stated as data and one of the phases the application declares, and optionally an `intentResolver`; every answer and every plan works from that one declaration, and no kind, rule or phase is built in. | none |
| `dated-graph-view` | provides | none | Answers what an entity refers to, what refers to it, and what can be reached from it by following references, each answer stating the store `position` it reflects and true of the entities as they stood at that position; asking changes nothing, and an edit that has not landed never appears in an answer; what a planned edit would do is shown apart, stating the position it was planned from. | none |
| `plan-graph-change` | provides | `shape-check:declared-shape-validation`, `shape-check:plain-json-value` | Given an edit - any set of creations, changes and removals asked for together, with an optional plain-JSON `context` - shows everything it would do, every consequence through a declared rule or an application-stated consequence included, under one stopping rule, or refuses it in the shared refusal form, naming the rule it would break, the entity concerned and the part of the edit that led there; every entity a consequence writes is held to the rules a requested write of it meets; the edit is judged on the state it would leave, no edit may leave a rule more broken than it found it, a partial repair is allowed, and planning changes no answer. | none |
| `reversible-history` | provides | `entity-store:change-provenance` | An edit that has landed can be undone by a later edit that restores every entity it changed, its consequences included, as it was before; undo and redo replay the reversal recorded when the edit landed, without working its consequences out again, and are judged and land like any other edit (`D8`); the history is bounded as the application states; whether restoring includes an entity's identity after undoing its deletion is design owed (`D6`). | none |
| `positioned-graph-sync` | provides | `entity-store:positioned-entity-write`, `entity-store:expected-revision-write`, `entity-store:changes-since-position`, `entity-api:changes-since-position` | A planned edit lands in the store beneath whole or not at all, guarded by the position it was planned from, and an edit that does not land leaves every answer as it was; every change that reaches the store, by this component or by any other path, is taken in, from the store or from a stream of its changes, in `position` order, so every answer stays true at the position it reports. | `T1` when backed by a durable `entity-store` |

---

## Terms of the rows

Each term below states what a row commits to in more detail.\
It is ruled by the director and co-signed with zorg (`D8`, `D9`), and it binds the design effort as the rows do, never its mechanism beyond what is stated (`D2`).

**Reference rules (`graph-declaration`).**\
A reference declares the kinds it may target and how many targets it holds.\
It declares what becomes of the referrer when a target is deleted: `onTargetDelete: "refuse" | "cascade-delete" | "unlink"`.\
It declares whether a target belongs to one referrer only: `exclusivity: "refuse" | "steal"`, where `steal` takes the target from the referrer that held it.\
It may declare a minimum number of targets, with `onBelowMin: "refuse" | "cascade-delete"`.\
It declares what becomes of a target once nothing refers to it: `onUnreferenced: "keep" | "delete"`, `"keep"` when not declared.\
A target that never had a referrer within the edit is not deleted by `onUnreferenced`; only one the edit left unreferenced is.

**Consequences and the stopping rule (`plan-graph-change`).**\
An application consequence is a pure function declared on a kind, with a trigger stated as data (an entity of named kinds created, an entity of named kinds deleted, or named fields of a kind changed) and one of the phases the application declares, in the order it declares them.\
A consequence returns writes only; the component applies each write, records its reversal and takes it into the edit, so the next consequence sees it.\
Planning follows one stopping rule:

1. Each requested item, after its kind's `intentResolver` if one is declared, is applied, and the reference rules are expanded to a fixed point.
2. The declared phases run in their order, each once; within a phase, the consequences whose triggers match a change in the edit run in their declared order, and the reference rules are expanded to a fixed point after the phase completes, before the next begins.
3. A completed phase is never entered again.

Reference rules only remove references and entities, so each expansion ends; with a finite number of phases, planning ends after at most one expansion more than there are phases.\
Two consequences writing one entity in one run of a phase is a fault, reported as such, never resolved by letting one win.

**Consequence writes held to request rules (`plan-graph-change`).**\
Every entity a consequence or a reference rule wrote is judged, as it stands in the result, by the shape, reference rules and conditions a requested write of it would meet.\
The edit is refused, naming the consequence or rule, if one fails and the entity did not already fail before the edit.

**Intent resolvers (`graph-declaration`, `plan-graph-change`).**\
A kind may declare an `intentResolver`, a pure function that rewrites one requested item into the writes it stands for, judged against the scratch view as the items before it left it.\
It is how an application chooses where a new entity sits, or what it is named, inside one edit; the component applies the result without understanding it.

**Edit context (`plan-graph-change`).**\
`plan(intent, { context })` takes an optional `context`, read as plain JSON through `shape-check`'s `plain-json-value`.\
Consequences, conditions and resolvers may read it; the component never interprets it.\
State an application keeps about its whole set, rather than about one entity, is held as an entity of the application's own kind, so its reversal is ordinary.

**Judging and refusals (`plan-graph-change`).**\
Rules - reference rules, conditions over the whole set, and the rules a consequence write is held to - are judged on the state the edit would leave, by a stable key and a numeric measure for each breach: an edit is refused only for a breach it introduces, or whose measure it raises.\
A fault in the request itself - an item that names no known operation, a change to an entity absent at that point in the edit, a request outside its bounds - is refused at the item that faults.\
A shape misfit of a requested or consequence write refuses the plan.\
A refusal is a `GraphRefusal` in the shared refusal form, `{ part, code, what, why, fix, details }`, with `part: "entity-graph"`; `details` carries `{ ruleKey, subject, measure, opIndex, sentence }`, where `opIndex` is the index of the requested item that led there, or `-1` for the edit as a whole, and `sentence` is an application condition's own sentence, carried verbatim.\
The words a person or an agent finally reads are the application's to choose from these facts.

**Undo and redo (`reversible-history`, `D8`).**\
When an edit is planned, the reversal of every write it makes, requested or consequence, is recorded from the state just before that write.\
`undo` applies the recorded reversal of the most recent landed edit not yet undone, or of every such edit down to a named one, as one edit; `redo` applies the recorded writes of the most recently undone edit again.\
Neither works its consequences out again, since the recorded writes already hold them.\
Each is judged as any edit is - shapes, reference rules, conditions and the expected position - and lands as one positioned change, with its own reversal recorded.\
The undo record of an edit is kept in the store, in the note on the change that landed it (`entity-store:change-provenance`), so the component keeps no record of its own.\
An edit whose undo record would not fit the store's bound on a note is refused, naming the bound, so every edit that lands can be undone.\
The history the component keeps for undo is bounded by the application: a count of edits, a size in bytes, and a predicate that pins an edit against eviction while a younger edit is held, each bound overriding the pin only at a stated hard limit.

**The store port (`positioned-graph-sync`).**\
The component takes a structural `GraphStorePort`, shaped by `entity-store`'s capabilities: a change of one or more writes landing whole or not at all, a guard naming the store position the change expects, an optional note on a change, and every change after a held position, in order.\
`entity-store` is its reference provider, and no runtime import of `entity-store` is required of an application that supplies its own port.\
An edit lands with the position it was planned from as its expected position; a store that has moved refuses it, the answers stay as they were, and the caller may plan the edit again.

**Identity across undo (`reversible-history`).**\
An application that names its own entities, and references them by those names, keeps an entity's identity across undoing its deletion, since its reversal recreates the name.\
For an application that relies on identities the store forms, the question stays owed (`D6`).

---

## Acceptance

What "passes" means for an implementation of this contract, drafted with zorg's agreement.

- **A neutral corpus in this repository.** Cases over kinds of no application, covering every term above, written from this contract by an agent other than the one that implements it; the gate runs every case.
- **Consumers' corpora in their own gates.** `drawv2` runs its planner corpus, 1,044 cases at the time of drafting, in its own gate against every release.
- **Passes, exactly:** the same writes, the same reversals, and the same refusals, case for case.
- **Passes, equivalently:** the same verdict and the same `opIndex`; for an accepted edit, the same resulting entities, compared without regard to the order of a collection, and undo restoring them; for a refused edit, the same `ruleKey` and `subject`.
- **A difference** outside both is listed by case, with both results and its cause, and ruled before any corpus is frozen again.

---

## Design owed

The design effort owes each item below.\
Each is a question, and any answer keeps every commitment in `VISION.md` and in the rows above.

**Open by the director's rulings, with the answer this draft proposes.**

- Whether this scope stays one component or splits into a change planner, an entity view and change undo (`D5`; zorg's `D32` and `D35`). Proposed: one component, since recording each reversal and recording what an edit changed are one step, and both consumers agree (`D9`).
- How a host lands an edit whole (`D3`); the `entity-store` definition (`C4`) declares a multi-item `change` that `entity-store`'s implementation does not yet serve, which is a defect in that implementation (`D4`). Proposed: through the store port's change of one or more writes, which `entity-store` designs under its own `D4`.
- How an entity's identity survives undoing its deletion, given that the `entity-store` definition forms each identity from the position that created it (`D6`). Proposed for an application naming its own entities under *Identity across undo*; open otherwise.
- How concurrent conflicting edits are resolved, including an edit and a change that lands while it is being planned, and an undo and a change that landed after the edit it reverses (`D6`). Proposed: the expected position refuses the later edit, and its caller may plan it again; whether two edits may ever be combined stays open.

**Mechanism the earlier draft stated, kept as input to the design (`D2`).**

- Planning on a scratch projection of the current state, without changing the live view.
- Narrowing each update to the keys that changed.
- Deriving each reversal from the state immediately before its write (`drawv2`'s `PL-2`).
- Maintaining reverse indices incrementally from the change stream, with lookups in O(1) or O(degree) and maintenance in O(changed references).
- Answering synchronously from a view held in memory, and writing no files.
- Reactions and result-invariant checks supplied by the application as pure functions, an invariant's breach reported as `{ key, measure, sentence }` (`drawv2`'s `B271`).
- Planning an edit into one flat batch of writes, and advancing the view to the committed `position` when a commit lands.
- The surface `position()`, `get(kind, id)`, `all(kind)`, `referrersOf(targetId, filter?)`, `targetsOf(id, field?)`, `ownerOf(memberId, containerKind)` and `reachable(fromId, filter?)`; `plan(intent, { context })` returning `{ ok: true, position, writes, inverse }` or `{ ok: false, refusal }`; `commit(intent, options)`; `undo(to?)`; `redo()`; and `applyChange(changeRecord)`.
- An index from each kind to the consequences whose triggers name it, built once from the declaration, so an edit's cost follows the kinds it touched (`drawv2`'s `planner/txn.mjs`, `TG-4`).

**Raised by the cold reading of mission-kit's `C15`.**

- How the view is first filled at start, and what it does when the store no longer holds the position it needs.
- What a commit returns when the store refuses it, and whether the edit is planned again. Proposed under *The store port*.
- Whether a change this component committed is taken in a second time from the stream.
- Which entities an edit's guards cover, so a rule over entities the edit read but did not write still holds when it lands. Proposed: the expected position covers every entity, read or written.
- How a client that reaches the store only through `entity-api` (`C6`) lands an edit.
- Which direction `reachable` follows, what a filter is, and what `ownerOf` returns when more than one container holds the member.
- What removing a reference's only target leaves in a reference that holds one target.
- Whether planning ends when consequences imply one another in a cycle, and in what order consequences apply. Proposed under *Consequences and the stopping rule*.
- Whether a shape refusal from `shape-check` is a refusal of the plan. Proposed: yes, under *Judging and refusals*.
- What a refusal carries, in full. Proposed under *Judging and refusals*.
- How much a rule is broken is measured, so that "more broken" and a partial repair can be judged. Proposed: a stable key and a numeric measure per breach, under *Judging and refusals*.
- Whether the view kept in a client is `entity-api`'s deferred `dated-local-view` (`C6`), builds on it, or differs from it, and why (mission-kit's `B106`).
- How an entity created within an edit is named before the store forms its identity. Proposed under *Intent resolvers* and *Identity across undo*.

**Kept from the first draft.**

- Exact TypeScript signatures for `createEntityGraph`, `GraphKindDeclaration`, `ReferenceFieldDeclaration`, `GraphIntent`, `GraphPlanResult`, `GraphRefusal` and `GraphStorePort`, settled by the design effort (`D2`); zorg's `D52` places them before cold reading, and whether that binds this draft's cold reading, which precedes the design, is to be settled against `D52`.
- Ordering and cycle bound in planning when removing a member leaves a container below its minimum across nested containers (`drawv2` `B81` to `B85`); the stopping rule above bounds it, and the corpus is to show it.
- How each planned write (`GraphWrite`: `put`, `set`, `del`) maps onto the writes the `entity-store` definition (`C4`) declares - `create`, `update`, `delete` and multi-item `change` - with `expectedRevision` and the change's expected position.

---

## Reference

This repository, `apnex/entity-graph`.\
Its first two milestones are built, serving `dated-graph-view` in memory and planning with the reference rules, the other rows deferred (`D10`, `D15`); the rest is built milestone by milestone under `docs/BUILD-PLAN.md`.\
`positioned-graph-sync` takes a store port shaped by the `entity-store` capabilities it requires, with `entity-store` as the reference provider (*The store port*), and `reversible-history` keeps its undo records in the note `entity-store:change-provenance` carries.\
Those `entity-store` capabilities are designed under `entity-store`'s own `D4` and not yet served: its multi-item `change`, the expected position on a change, and the note.

---

## Edges

**Composes:** nothing registered.

**Consumes, through a declared contract:**

- `shape-check` (`C3`): `declared-shape-validation`, `plain-json-value`
- `entity-store` (`C4`): `positioned-entity-write`, `expected-revision-write`, `changes-since-position`, `change-provenance`, through a store port with `entity-store` as its reference provider
- `entity-api` (`C6`): `changes-since-position`, through its client half (`createStoreClient`), feeding a view kept in a client

**Composed-by:** candidate for `drawv2` (replacing `engine/ivm.mjs`, `engine/relations.mjs`, `planner/txn.mjs`, and `model/invariants.mjs` when `drawv2` refactors onto the component set) and for any `zorg` consumer needing cross-entity references and cascades (`BL33`).
