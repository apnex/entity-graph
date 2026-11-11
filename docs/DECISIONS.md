# Decisions

One ruling per entry, append-only.\
A ruling is never edited; a later one supersedes it and says so.

Rulings that shape this component together with others are held in zorg's `docs/DECISIONS.md`, and cited here as "zorg's `Dn`".

---

## D1 - The component stands in its own repository as a candidate under zorg's `D35` and `BL33`

**Ruled by:** the director, 2026-11-01 (zorg's `BL33`, under `D33` and `D35`).\
**Affects:** this repository.

**Ruling.**\
This component, `entity-graph`, is scaffolded in its own sovereign public repository, on the terms of zorg's `D16` and `D35`.\
Its contract of record is `CONTRACT.md` (zorg's `D17`), and its vision in `VISION.md` is a draft that becomes enduring once cold-read under `D52` and ratified by the director.\
It layers synchronous in-memory reference indices, declarative cascades, pure per-kind reactions and `{ key, measure }` result invariants, and reversible inverses over `entity-store` (`C4`) and `shape-check` (`C3`).

**Why.**\
`entity-store` (`C4`) keeps typed entities in a single monotonic change order and deliberately holds no relationships between entities (`entity-store/VISION.md`, "Not a graph"), while `drawv2` (`engine/ivm.mjs`, `engine/relations.mjs`, `planner/txn.mjs`, `model/invariants.mjs`) has proved that incremental reverse-index maintenance, scratch-projection cascade planning, `{ key, measure }` result invariants (`B271`), and automatic inverse derivation (`PL-2`) form a domain-neutral mechanism (`P4`) with zero domain kinds built in.

---

## D2 - The vision states purpose only, and the mechanism is design owed

**Ruled by:** the director, 2026-11-07, on review of the draft vision and of mission-kit's `C15`.\
**Affects:** `VISION.md`, `CONTRACT.md`.\
**Amends:** `D1`, whose third sentence names a mechanism; that mechanism is now design owed rather than ruled.

**Ruling.**\
`VISION.md` states why `entity-graph` exists, what it is and is not, and what success means, in terms that survive replacing the design entirely.\
Mechanism leaves the vision and is listed in `CONTRACT.md` under *Design owed*, as input to the design effort, which is separate and has not started.\
The mechanism moved is: planning on a scratch projection, expanding cascades and reactions to a fixed point, the reference-option values, narrowing patches to changed keys, deriving each inverse from the state before its write, maintaining indices incrementally from the change stream, answering synchronously from a view held in memory and writing no files, the `{ key, measure }` shape of result invariants, pure reaction and invariant functions, flat write batches, advancing the view on commit, and complexity bounds.

**Why.**\
The draft stated mechanism as purpose, so a designer holding it could not choose another mechanism without amending the vision; three of three blinded readers concluded exactly that.\
The vision type in mission-kit, `AR6`, places a statement that does not survive replacing the design in the design, not the vision.\
`D1` cites `drawv2` as proof of the mechanism, and the draft vision and contract stated more than `drawv2` shows: its planner runs reactions in phases declared in a fixed order - the per-operation ones for every operation, requested or emitted, and the transaction-wide ones once each - rather than expanding them all to a fixed point, and validates each requested operation in order before judging its rules on the result (`planner/txn.mjs`, `PL-3`).

**Alternatives refuted.**\
Keeping the mechanism in the vision labelled as design intent - a statement that does not survive replacing the design belongs to the design, not the vision, by `AR6`'s *Not an architecture* test, however it is labelled.\
Keeping it as written - that binds the design effort before it starts.

---

## D3 - An edit lands whole or is refused whole, and how a host achieves that is design owed

**Ruled by:** the director, 2026-11-07.\
**Affects:** `VISION.md`, `CONTRACT.md`.

**Ruling.**\
The vision keeps the commitment that a planned edit lands whole or is refused whole, leaving the live graph untouched.\
How a host lands it whole is owed by the design effort, and the vision commits `entity-store` to nothing about how an edit lands whole.

**Why.**\
`entity-store` at `d7f1797` serves single-entity `create`, `update` and `delete` and no multi-entity write (`src/store-types.ts`, `EntityStore`), while mission-kit's `C4` entry declares a multi-item `change`.\
Under `D4` that difference is a defect in `entity-store`'s implementation, so the vision neither weakens its commitment nor names a mechanism that the design has not chosen.

**Alternatives refuted.**\
Committing `entity-store` to an atomic multi-entity write in this vision - that decides the design and binds another component from here.\
Promising atomicity only on a local projection - that gives up the commitment on the host, where it matters most.

---

## D4 - A definition states what a component is, and an implementation that does not serve it is defective

**Ruled by:** the director, 2026-11-07.\
**Affects:** how this component reads the definitions of the components it consumes.

**Ruling.**\
A component's definition - its vision, its contract and its registry entry - states what it is.\
Where an implementation does not serve what its definition declares, that is a defect in the implementation, and neither the definition nor this component's vision is changed to fit it.

**Why.**\
The cold reading of `C15` found `entity-store`'s implementation short of the `C4` definition that `entity-graph` relies on, and the question was which one gives way.

**Alternatives refuted.**\
Correcting the definition to match the implementation - that makes the definition a description of whatever was last built, and no consumer can rely on it.

---

## D5 - Whether this scope is one component is a question for the design effort

**Ruled by:** the director, 2026-11-07.\
**Affects:** `VISION.md`, `CONTRACT.md`, mission-kit's `C15`.

**Ruling.**\
The vision keeps the combined scope: a dated view of declared references between entities, planning each edit against declared rules, and reversing it.\
Whether that scope stays one component, or splits into the candidates zorg's cross-project synthesis kept apart - a change planner, an entity view, and change undo (zorg's `D32` and `D35`) - is a question the design effort answers.

**Why.**\
The synthesis listed the three as separate candidates, and zorg's `D35` steers that "a change planner is a modular, sovereign, decoupled component", while `D1` scaffolds one component spanning all three.\
The design is where the cost of each boundary becomes measurable.

**Alternatives refuted.**\
Ruling one component now, or splitting now - either decides a boundary before the design that would justify it.

---

## D6 - Identity across undo, and concurrent conflicting edits, are questions for the design effort

**Ruled by:** the director, 2026-11-07.\
**Affects:** `VISION.md`, `CONTRACT.md`.

**Ruling.**\
Reversibility stays the goal.\
The design effort answers two questions: how an entity's identity survives undoing its deletion, and how concurrent conflicting edits are resolved.\
The vision neither admits nor excludes merging concurrent edits.

**Why.**\
The `C4` definition in mission-kit mints an entity's identity from the position that creates it (`e<position>.<place>`), so recreating a deleted entity cannot restore its identity, and an exact inverse of a delete is not expressible against that definition as written.\
Blinded readers of the draft vision could not decide whether merging concurrent edits was in or out.

**Alternatives refuted.**\
Refusing merges outright in the vision - that decides concurrency before the design.\
Leaving both unstated - readers then decide them silently, and differently.

---

## D7 - The vision is ratified, and the recorded wording of `D2` to `D6` is confirmed

**Ruled by:** the director, 2026-11-07, on review of apnex/entity-graph#1.\
**Affects:** `VISION.md`, `README.md`, `CONTRACT.md`.

**Ruling.**\
`VISION.md`, as committed in `f02f5cb`, is ratified and enduring.\
The wording of `D2` to `D6`, recorded in `439311d` from rulings given in session, is confirmed as the director's.

**Why.**\
Three blinded cold reads under mission-kit's `M2` found readers of each revision deciding every probe as well as readers of the draft, and giving the new answers where `D2` to `D6` changed them (mission-kit's `docs/audits/eval-entity-graph-vision`).\
`D1` makes the vision enduring once cold-read under zorg's `D52` and ratified; `D52` cannot be read from this repository, so whether those runs discharge it is not checked here, and the director ratified with that known.

**Alternatives refuted.**\
Ratifying the rulings alone and leaving the vision a draft until a cold read under zorg's `D52` - that holds a tested statement of purpose in draft for a procedure no reader here can see.

---

## D8 - An undo replays the reversal recorded with its edit, and is judged and lands like any other edit

**Ruled by:** the director, 2026-11-11, drafted by drawv2 under its `H31-8` and co-signed by zorg (`zorg/docs/DECISIONS.md` `D76`).\
**Affects:** `VISION.md` (the sentence on undo), `CONTRACT.md` (`reversible-history`, *Terms of the rows*).

**Ruling.**\
When an edit is planned, the reversal of every write it makes, requested or consequence, is recorded from the state just before that write.\
An undo applies that recorded reversal, and a redo the recorded writes, without working their consequences out again.\
Each is still judged as any edit is - shapes, reference rules, conditions over the whole set, and the expected position - and lands as one positioned change, with its own reversal recorded.\
`VISION.md`'s "An undo is an edit like any other" stands, and its sentence is tightened to say that an undo's consequences are those of the edit it reverses, restored as recorded.

**Why.**\
The recorded reversal already holds every consequence of the edit; working the consequences out again during an undo would fire them a second time against a state that already holds their reversal.\
Judging and landing the undo as an edit keeps every commitment the vision makes of an edit: whole or not at all, legible when refused, and dated.\
An undo planned from a position the store has since left is refused by the expected position, so a reversal is never applied to a state it was not recorded against.

**Alternatives refuted.**\
Planning an undo afresh, consequences included - it double-fires consequences, and its result is not the exact reversal the vision promises.\
Applying the reversal unjudged - an undo would escape the rules every other edit meets, and could land over a change it never saw.

---

## D9 - drawv2's requirements are recorded against this contract, under mission-kit's `0117`

**Ruled by:** the director, 2026-11-11, drafted by drawv2 under its `H31-8` and co-signed by zorg (`zorg/docs/DECISIONS.md` `D76`).\
**Affects:** `CONTRACT.md` (the rows, *Terms of the rows*, *Acceptance*, *Design owed*, *Reference*, *Edges*), mission-kit's `C15`.

**Ruling.**\
`drawv2` keeps its own planner while this component is unusable, on mission-kit's `0117` terms: it records its requirements against this contract, does not grow its planner into a variant of this component, and moves onto it once it is usable.\
Its requirements are recorded in `CONTRACT.md` as follows, each stated without any kind of `drawv2`'s:

1. Reference rules expanded to a fixed point, and an application's own consequences run once each in phases it declares, under one stopping rule; two consequences writing one entity in one phase is a fault.
2. A reference option, `onUnreferenced: "keep" | "delete"`, deleting a target once the edit leaves nothing referring to it.
3. Every entity a consequence writes held to the rules a requested write of it meets.
4. An optional per-kind `intentResolver`, rewriting a requested item against the scratch view as the items before it left it.
5. An optional plain-JSON `context` on `plan(intent, { context })`, readable by consequences.
6. Undo and redo replaying recorded reversals, judged (`D8`), with a history bounded by count, bytes and a pinning predicate, its records kept in the store's note on a change.
7. A structural `GraphStorePort`, `entity-store` its reference provider, the `entity-store` capabilities kept in the rows' Requires and in *Edges* so a census reads them.
8. `GraphRefusal` in the shared refusal form, carrying `{ ruleKey, subject, measure, opIndex, sentence }` in `details`.

Acceptance is a neutral corpus in this repository, written by an agent other than the implementer, and `drawv2`'s planner corpus in `drawv2`'s own gate, with "passes" defined in `CONTRACT.md`'s *Acceptance*.\
On `D5`, both consumers propose one component; the ruling stays the director's.

**Why.**\
`0117`'s first term asks a project keeping its own implementation to record its requirement against this contract, and zorg asked `drawv2` to write the draft itself (answer 6).\
Each requirement is a mechanism `drawv2`'s planner runs today and `D1` cites as this component's proof, stated so that an application with kinds of its own gains it.

**Alternatives refuted.**\
Recording the requirements in `drawv2` only - `0117` asks for them where both sides can see them.\
Writing them as mechanism in `VISION.md` - `D2` keeps mechanism out of the vision.

---

## D10 - M1 is built: the scaffold, the gate, the dated view and its reference index, the other rows deferred

**Ruled by:** the director, 2026-11-11, approving this component's build plan as draw's `H31-10` (draw's `dev/DECISIONS.md`), on the contract co-signed by zorg (`zorg/docs/DECISIONS.md` `D76`).\
**Affects:** `docs/BUILD-PLAN.md`, `export-map.json`, `package.json`, `.nvmrc`, `.github/workflows/gate.yml`, `src/`, `test/`, `tools/`, `README.md`, `CONTRACT.md` (*Reference*).

**Ruling.**\
The build plan is carried into this repository as `docs/BUILD-PLAN.md`, and its first milestone is built.\
`dated-graph-view` is served in memory: a graph made from the declaration takes in each change in position order, whole or not at all, and answers `get`, `all`, `referrersOf`, `targetsOf`, `ownerOf` and `reachable`, each answer stating the position it reflects (`D11`, `D12`, `D13`).\
The declaration is read as far as the view needs: the kinds, and each reference with the declared kinds it may target, how many targets it holds (`holds: "one" | "many"`), and the values of the rule options, whose effects are planning's.\
A kind's shape, conditions, consequences and intent resolver, and the phases, are accepted and not yet read.\
`graph-declaration` is deferred until M4 serves every member of it, `plan-graph-change` until M2 to M4, `reversible-history` until M5 and `positioned-graph-sync` until M6, each named under this ruling in `export-map.json`'s `deferred`.\
A change holds at most 2,000 items (`GRAPH_LIMITS.maxChangeItems`), the bound the reference store places on one change.\
A refusal is a `GraphRefusal` in the shared form, its `details.ruleKey` the refusal's code until planning brings rules, `measure` 1, and `opIndex` the index of the item that faults, or `-1`.\
The scaffold follows the released components: `engines >=22` and `.nvmrc` 22, `shape-check` taken as its `0.1.0` release file, a gate on Node 22 and 24 with the consumer test, no release workflow until M8, and a vocabulary check refusing draw's listed words in `src/` (`tools/check-vocabulary.mjs`, taken from snap-grid's); zorg's repositories hold no list today.

**Why.**\
The plan's M1 lands a dated reverse index usable alone, needing nothing still being built, and the rows not yet served are deferred with a ruling so the export map says exactly what the package offers.\
Draw's page plans in a browser, so the source imports no module and names no global particular to one runtime, and reads no clock or randomness.

**Alternatives refuted.**\
Serving `graph-declaration` from M1 - M1 reads only part of the declaration, and a served row promises all of it.\
Taking the corpus's view cases as M1's only acceptance - the Exactness property over random streams and the mutation checks show the index cannot drift where no case looks.

---

## D11 - The view is first filled from entities stated with their position, then takes in each later change in order

**Ruled by:** the builder of M1, 2026-11-11, under the build plan's decisions owed before M1 (`docs/BUILD-PLAN.md`, section 4; `CONTRACT.md`, *Design owed*).\
**Affects:** `src/view.ts`, `src/entity-graph.ts`.

**Ruling.**\
A graph starts from the entities it is given and the position they reflect, as a reading of a store at that position gives them, or empty at position 0.\
Every change taken in afterwards states a position after the view's, and the view moves to it; a change at or before the view's position is refused, `stale-position`, and changes nothing.\
A change states each entity's whole state after it, or its deletion, as a store's list of changes does, and is checked whole, against the view as the items before it leave it, before any item is applied.\
A gap between positions is allowed, since a store may give positions to changes this graph does not take in; whether a gap means a missed change, and what the graph does when the store no longer holds the position it needs, are settled with the store port at M6.

**Why.**\
Exactness asks every answer to be true at the position it states, so a change is applied whole and only in order, and an answer given is never changed by a later change.

**Alternatives refuted.**\
Taking changes as patches - a store's changes carry whole states, and a patch applied to a missed state would answer wrongly with nothing to show it.\
Refusing any gap - a store numbering every change of every kind would refuse a graph declaring some kinds only.

---

## D12 - `reachable` follows references outward; a filter names kinds and fields; `ownerOf` answers every container holding the member

**Ruled by:** the builder of M1, 2026-11-11, under the build plan's decisions owed before M1 (`docs/BUILD-PLAN.md`, section 4; `CONTRACT.md`, *Design owed*).\
**Affects:** `src/entity-graph.ts`, `src/references.ts`.

**Ruling.**\
`reachable(fromId, filter?)` follows references from the entity that holds them to their targets, transitively, answering each entity the view holds once, never the start, in identity order.\
A filter is `{ kinds?, fields? }`: `fields` names the reference fields followed, and `kinds` the kinds an answered entity may be - for `reachable` the kinds it enters, for `referrersOf` the kinds of the referrers.\
`ownerOf(memberId, containerKind)` answers `owners`, every entity of the container kind holding the member in any reference, in identity order; under an exclusive reference there is at most one, and where there are more, all are answered.\
`referrersOf` answers each referrer's kind, identity and field, in identity then field order; `targetsOf` answers each target with its field and its kind, or `null` when the view holds no entity of that identity, in declaration order then the order the record holds them.\
A reference to an identity the view does not hold is answered as held, since a fresh reading of the records holds it.\
A question naming a kind or a field the declaration does not hold is refused, `invalid-query`, and is not answered empty.

**Why.**\
Each answer is what a fresh reading of the records at its position gives, so none hides a reference the records hold, and an order fixed by identity makes two readings of one position equal.\
Answering one owner where two exist would hide the breach an exclusive reference exists to prevent.

**Alternatives refuted.**\
Following references in both directions in `reachable` - `referrersOf` answers the inward question, and a two-way reach answers a different question under the same name.\
Answering one owner, the first by identity - it chooses silently.

---

## D13 - An identity names one entity across every kind of a graph, and a reference holds identities in the form it declares

**Ruled by:** the builder of M1, 2026-11-11, under `CONTRACT.md`'s *Identity across undo* and *Design owed*.\
**Affects:** `src/view.ts`, `src/entity-graph.ts`.

**Ruling.**\
An entity's identity is the name its application gives it, and it names one entity across every kind of the graph, since references hold identities alone; a change putting an identity an entity of another kind holds is refused, `identity-taken`.\
A reference holding one target holds an identity, or `null`, or is left out; a reference holding many holds a list of distinct identities, or is left out; any other form is refused, `invalid-reference`.\
Whether a target is of a kind the reference may target is a rule planning judges (M2); the view answers references as the records hold them.

**Why.**\
The contract's surface asks `referrersOf(targetId)`, `targetsOf(id)` and `reachable(fromId)` by identity alone, and an application naming its own entities keeps their identities across undo.\
The reference store keeps names unique within a kind, so an application keeps its names unique across the kinds of one graph, and the store port checks it at M6.

**Alternatives refuted.**\
References holding a kind and a name - every question would then need both, where the contract's surface asks by identity.
