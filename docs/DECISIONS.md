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

**Ruled by:** the build plan, approved by the director as draw's `H31-10` (2026-11-11, draw's `dev/DECISIONS.md`), on the contract co-signed by zorg (`zorg/docs/DECISIONS.md` `D76`); `H31-10` approved the plan and its milestones, and the as-built choices below are the builder's of M1, proposed for zorg's review where they settle something the contract leaves open, as `D11` to `D14` do.\
**Affects:** `docs/BUILD-PLAN.md`, `export-map.json`, `package.json`, `.nvmrc`, `.github/workflows/gate.yml`, `src/`, `test/`, `tools/`, `README.md`, `CONTRACT.md` (*Reference*).

**Ruling.**\
The build plan is carried into this repository as `docs/BUILD-PLAN.md`, and its first milestone is built.\
`dated-graph-view` is served in memory: a graph made from the declaration takes in each change in position order, whole or not at all, and answers `get`, `all`, `referrersOf`, `targetsOf`, `ownerOf` and `reachable`, each answer stating the position it reflects.\
The declaration is read as far as the view needs: the kinds, and each reference with its field, the declared kinds it may target, how many targets it holds and the rule options, whose values are checked here and whose effects are planning's.\
A kind's shape, conditions, consequences and intent resolver, and the phases, are accepted and not yet read.\
`graph-declaration` is deferred until M4 serves every member of it, `plan-graph-change` until M2 to M4, `reversible-history` until M5 and `positioned-graph-sync` until M6, each named under this ruling in `export-map.json`'s `deferred`.\
A change holds at most 2,000 items (`GRAPH_LIMITS.maxChangeItems`), the bound the reference store places on one change.\
A refusal is a `GraphRefusal` in the shared form, its `details.ruleKey` the refusal's code until planning brings rules, `measure` 1, and `opIndex` the index of the item that faults, or `-1` - the builder's choices, proposed for zorg's review.\
Every input is read once as plain data, part by part, before any of it is used, so a value read twice cannot differ: an object's own enumerable data members and a list's items are copied once, and a getter, a Proxy whose trap throws, a prototype other than an object's or a list's, or a list with members of its own beyond its items is refused rather than read (`src/plain-members.ts`).\
A Proxy's traps run as its members are read, and a Proxy whose traps answer plain data is read as that data, as shape-check's `readPlainJson` reads one.\
A change's and an opening's own members and lists, and the declaration's objects and lists, which later milestones let hold functions, are read so; each item of a change, entity of an opening, reference of a declaration, and each filter, as plain JSON through `readPlainJson`.\
The first part that is not plain data is named: a change's item as `not-plain` at its index, an opening's entity as `invalid-opening` at its index, a declaration's reference by its index; and a change or an opening holding a member of its own beyond its position and its items or entities is refused, `invalid-change` or `invalid-opening`.\
The scaffold follows the released components: `engines >=22` and `.nvmrc` 22, `shape-check` taken as its `0.1.0` release file, a gate on Node 22 and 24 with the consumer test, no release workflow until M8, and a vocabulary check refusing draw's listed words in `src/` (`tools/check-vocabulary.mjs`, taken from snap-grid's); zorg's repositories hold no list today.\
The neutral corpus's first batch (`corpus/`, written by another agent) runs in the gate, every case unedited (`test/corpus.test.js`), and its files are held to the repository's docs check as every other is.\
Where the contract leaves a question open or owes a decision, M1 adopts the readings `D11` to `D14` propose, for zorg's review.

**Why.**\
The plan's M1 lands a dated reverse index usable alone, needing nothing still being built, and the rows not yet served are deferred with a ruling so the export map says exactly what the package offers.\
Draw's page plans in a browser, so the source imports no module and names no global particular to one runtime, and reads no clock or randomness.

**Alternatives refuted.**\
Serving `graph-declaration` from M1 - M1 reads only part of the declaration, and a served row promises all of it.\
Taking the corpus's view cases as M1's only acceptance - the Exactness property over random streams and the mutation checks show the index cannot drift where no case looks.

---

## D11 - Proposed reading: the declaration is a list of kinds, each with a list of references, the options the contract gives no default required

**Proposed by:** the builder of M1, 2026-11-11, for zorg's review; it reads `CONTRACT.md`'s *Reference rules* where the contract fixes no form (*Design owed*, the exact signatures).\
**Affects:** `src/declaration.ts`.

**Reading.**\
A declaration is `{ kinds: [ { kind, references: [ { field, targets, holds, onTargetDelete, exclusivity?, min?, onBelowMin?, onUnreferenced? } ] } ] }`, lists rather than objects, so the order of kinds and of references is the order written, and a kind or a field written twice is refused.\
`targets`, `holds` (`"one"` or `"many"`) and `onTargetDelete` are required, since the contract says a reference declares each and gives none a default; `exclusivity` is optional, absent meaning not exclusive; `onUnreferenced` is optional, `"keep"` when absent.\
`min` and `onBelowMin` are declared together, either alone refused, and `min` is a whole number from 0, at most 1 where a reference holds one target.\
An option the contract does not name is refused, and named, before a missing one is reported; a reference may target a kind declared after it.\
A refusal's `details.subject` is `<path>: <fault>`, the path naming the kind, the field and the member at fault, and the fault one of `missing`, `empty`, `invalid`, `duplicate`, `unknown`, `unpaired` or `undeclared <kind>`, so each fault reads apart from every other.\
These are the corpus's readings `R2`, `R9`, `R10`, `R11`, `R12` and `R13` (`corpus/README.md`), and the form is its declaration's; draw declares its kinds as such a list of rows (draw's `model/shape.mjs`).

**Why.**\
An option silently defaulted, or an unknown one silently ignored, is a rule the application did not state or a rule not kept; a written order serves the declared order of consequences and phases the later milestones read.

**Alternatives refuted.**\
Kinds and references as objects keyed by name - a duplicate cannot be written, so it cannot be refused, and an integer-like name reorders.

---

## D12 - Proposed reading: the view is first filled from entities stated with their position, and takes in each later change in order, applying no rule

**Proposed by:** the builder of M1, 2026-11-11, for zorg's review, on the build plan's decision owed before M1 (`docs/BUILD-PLAN.md`, section 4; `CONTRACT.md`, *Design owed*).\
**Affects:** `src/view.ts`, `src/entity-graph.ts`.

**Reading.**\
A graph starts from the entities it is given and the position they reflect, as a reading of a store at that position gives them, or empty at position 0; the corpus leaves the first fill uncovered, and asks only that filling and landing the entities as one change answer alike.\
An opening is no change: it is checked as a change's items are, and not bound by a change's 2,000 items, since a store holds any number of entities at one position; an opening that is not plain data is refused, `invalid-opening`.\
Every change taken in afterwards states a position after the view's, which the view moves to; a change at or before it is refused, `stale-position`, and changes nothing; a gap between positions is allowed (the corpus's `R7`, `R7a`).\
A change states each entity's whole state after it, or its deletion, and is checked whole, against the view as the items before it leave it, before any item is applied.\
Taking a change in applies no reference rule: a deleted target leaves its referrers' references, and a reference to an absent target or a target of a kind the reference does not allow, an exclusive target held twice and a reference below its minimum are each held as they stand (the corpus's `R3`); only a form the declaration cannot hold, such as a list in a one-target reference, is refused, `invalid-reference`.\
What the graph does when the store no longer holds the position it needs, and whether a gap means a missed change, are settled with the store port at M6.

**Why.**\
Exactness asks every answer to be true at the position it states, so a change is applied whole and only in order; and the store is the record, so the view reflects what it holds rather than judging writes that have already landed (`VISION.md`, *Not a gate on other writers*).

**Alternatives refuted.**\
Taking changes as patches - a store's changes carry whole states, and a patch applied to a missed state would answer wrongly with nothing to show it.\
Refusing any gap - a store numbering every change of every kind would refuse a graph declaring some kinds only.

---

## D13 - Proposed reading: answers read the references entities hold; `reachable` goes forward; a filter names kinds and fields; `ownerOf` answers every holder

**Proposed by:** the builder of M1, 2026-11-11, for zorg's review, on the build plan's decisions owed before M1 (`docs/BUILD-PLAN.md`, section 4; `CONTRACT.md`, *Design owed*).\
**Affects:** `src/entity-graph.ts`, `src/references.ts`.

**Reading.**\
An answer is what a fresh reading of the records at its position gives, so a reference to an identity the view does not hold is answered as held; an absent entity holds nothing (the corpus's `R4`).\
`reachable(fromId, filter?)` follows references forward, from the entity holding a reference to its target, transitively, and answers every identity reached by one or more references: the start only when a cycle leads back to it, and an absent target reached and leading nowhere further, its kind `null` (the corpus's `R5`, `R5a`, `R5b`); a walk costs what it reaches.\
`ownerOf(memberId, containerKind)` answers `owners`, every entity of the container kind holding the member directly in any of its references, in identity order; the corpus's `R6` reads one holder or `null` and leaves two holders owed, and where there are two this reading answers both rather than choosing one.\
A filter is `{ kinds?, fields? }`: `fields` names the reference fields followed, and `kinds` the kinds an answered entity may be - for `reachable` the kinds it enters, an absent target being of no kind, and for `referrersOf` the kinds of the referrers; the corpus uses no filter.\
`referrersOf` answers each referrer's kind, identity and field, in identity then field order; `targetsOf` answers each target with its field and its kind, or `null`, in declaration order then the order the record holds them; `all` answers in identity order.\
A question naming a kind or a field the declaration does not hold is refused, `invalid-query`, and is not answered empty.

**Why.**\
None of these answers hides a reference the records hold, and an order fixed by identity makes two readings of one position equal; answering one owner where two exist would hide the breach an exclusive reference exists to prevent.

**Alternatives refuted.**\
Following references both ways in `reachable` - `referrersOf` answers the inward question.\
Answering one owner, the first by identity - it chooses silently.

---

## D14 - Proposed reading: an identity names one entity across every kind of a graph, and a reference holds identities in the form it declares

**Proposed by:** the builder of M1, 2026-11-11, for zorg's review, under `CONTRACT.md`'s *Identity across undo* and *Design owed*.\
**Affects:** `src/view.ts`, `src/entity-graph.ts`.

**Reading.**\
An entity's identity is the name its application gives it, and it names one entity across every kind of the graph, since references hold identities alone; a change putting an identity an entity of another kind holds is refused, `identity-taken` (the corpus's `R1`).\
A reference holding one target holds an identity or `null`, or is left out; one holding many holds a list of distinct identities, or is left out (the corpus's `R2`); a field the declaration names no reference is plain data, whatever it holds.\
A reference field is read from a record's own members alone, so one named as a member every object inherits - `constructor`, `toString`, `__proto__` - is left out of a record that does not hold it.\
A rename is a deletion and a creation in one change, and referrers not rewritten keep the old identity (the corpus's `R8`).

**Why.**\
The contract's surface asks `referrersOf(targetId)`, `targetsOf(id)` and `reachable(fromId)` by identity alone, and an application naming its own entities keeps their identities across undo; the reference store keeps names unique within a kind, so an application keeps them unique across the kinds of one graph, and the store port checks it at M6.

**Alternatives refuted.**\
References holding a kind and a name - every question would then need both, where the contract's surface asks by identity.

---

## D15 - M2 is built: planning with the declared reference rules to a fixed point, `plan-graph-change` still deferred for the parts it owes

**Ruled by:** the build plan, approved by the director as draw's `H31-10` (2026-11-11, draw's `dev/DECISIONS.md`), on the contract co-signed by zorg (`zorg/docs/DECISIONS.md` `D76`); the as-built choices are the builder's of M2, proposed for zorg's review where they settle something the contract leaves open, as `D16` to `D18` do.\
**Affects:** `src/planner.ts`, `src/scratch.ts`, `src/reference-rules.ts`, `src/refusal.ts`, `src/entity-graph.ts`, `export-map.json`, `test/`.

**Ruling.**\
A graph plans an edit: `plan({ items }, { context }?)`, each item a `put` of a whole record, a `set` of named fields or a `del`, answers `{ ok: true, position, steps, inverse, writes }` or `{ ok: false, refusal }` (`D17`).\
The edit is read once as plain data, part by part; each item is checked against the plan's scratch layer as the items before it left it, and a fault is refused at that item; the reference rules are then expanded until nothing more follows, and the result is judged by key and measure against the state the edit found, refused only for a breach the edit introduces or whose measure it raises (`D18`).\
The scratch layer lays the entities the edit touches over the view, copy on write, and is the one place a step is applied, its reversal read from the state just before it; the view is only read, so planning changes no answer.\
Measured with a Node timing of 50 plans on views of 1,008, 10,008 and 100,008 entities: a plan cascading to 12 net writes takes a median of about 0.15 ms at each size, a plan of one creation about 0.02 ms - the cost follows what an edit touches, not what the view holds.\
`plan-graph-change` stays deferred under this ruling until M4 serves it whole: what it still owes is the application's phases, the fault of two consequences writing one entity and the holding of consequence writes to request rules (M3), and the intent resolver and the context, read as plain JSON from M2 but used by nothing until consequences read it (M4); `graph-declaration` stays deferred under `D10`.

**Why.**\
The plan's M2 lands planning a consumer can use for plain edits under every reference rule, needing nothing still being built; the row is served only when every term of it is.

**Alternatives refuted.**\
Serving `plan-graph-change` at M2 - its phases, consequences, resolver and context are terms of the row M2 does not build.\
Copying the view for each plan, as draw's planner copies its document - the cost would follow the view, not the edit (the build plan's section 7).

---

## D16 - Proposed reading: unlinking the only target of a one-target reference leaves `null`

**Proposed by:** the builder of M2, 2026-11-11, for zorg's review, on the build plan's decision owed before M2 (`docs/BUILD-PLAN.md`, section 4; `CONTRACT.md`, *Design owed*).\
**Affects:** `src/reference-rules.ts`.

**Reading.**\
When a target is deleted and its referrer holds it through a one-target reference declaring `onTargetDelete: "unlink"`, the referrer's field is set to `null`, the form a one-target reference holding no target takes (`D14`); a list loses the target and keeps its other targets in order.\
A minimum of 1 on such a reference then applies as to any reference left below its minimum: `onBelowMin` decides.

**Why.**\
`null` is the one form a one-target reference holding nothing has, so the referrer stays a well-formed entity, and a rule that needs a target still sees the loss.

**Alternatives refuted.**\
Leaving the field out of the record - a field the record once held vanishing reads as a different record, where `null` says what happened.

---

## D17 - Proposed reading: a plan answers its steps, their reversal and its net writes, the net writes bounded after the rules

**Proposed by:** the builder of M2, 2026-11-11, for zorg's review, on the build plan's decision owed before M2 (`docs/BUILD-PLAN.md`, sections 2 and 4).\
**Affects:** `src/planner.ts`, `src/scratch.ts`.

**Reading.**\
An accepted plan answers `steps`, every write in the order applied, requested and the rules' alike, each an entity's whole state after it or its deletion; `inverse`, the reversal of each step read from the state just before it, in the order that undoes them; and `writes`, the net writes, one per entity whose state the edit as a whole changes, in the order each was first touched, which is what the store lands.\
An edit holds at most 2,000 items, refused beyond that (`too-many-items`), and its net writes after every rule are at most 2,000, the store's bound on one change, refused beyond that (`too-many-writes`, `details.ruleKey` `net-writes`, `subject` naming the bound, `measure` the writes the edit would make).

**Why.**\
Draw's tabs and its corpus compare the steps, and the store takes one write per entity in a change, so both are answered; the reversal stays step by step, as the contract records it; and a consequence-heavy edit is refused before it can land half-undoable (the build plan's section 7).

**Alternatives refuted.**\
Bounding the request alone - an edit of one item can cascade past the store's bound.

---

## D18 - Proposed reading: how the reference rules apply where the contract is silent

**Proposed by:** the builder of M2, 2026-11-11, for zorg's review, reading `CONTRACT.md`'s *Reference rules*, *Consequences and the stopping rule* and *Judging and refusals*.\
**Affects:** `src/planner.ts`, `src/reference-rules.ts`.

**Reading.**\
Every requested item is applied in order, each checked against the scratch layer as the items before it left it, and the rules are then expanded to a fixed point once, over the state all the items leave (the stopping rule's first step); so an edit that deletes a target and puts it back, or repoints a referrer before deleting its target, cascades nothing.\
A `set` merges its fields over the record and a `put` replaces it; a change or a deletion of an entity absent at that point is refused at the item, `not-found`.\
`onTargetDelete` applies to each target the edit deleted and did not put back; a reference to an absent identity the edit found standing is not repaired.\
`exclusivity` holds among the referrers of one kind through one field; under `"steal"`, a referrer newly holding the target keeps it and every other holder loses it; two referrers newly holding it in one edit cannot take it from each other, and the edit is refused.\
`onBelowMin: "cascade-delete"` deletes an entity the edit wrote and left further below the minimum than it found it, one the edit creates below it included.\
`onUnreferenced: "delete"` deletes a target such a reference stopped holding within the edit once nothing holds it through any reference; a target never held within the edit is kept.\
The result is judged by three rules, each breach keyed `<kind>.<field>.<rule>@<identity>`: `targets` (an absent identity or a kind the reference may not target; named `onTargetDelete` where the edit deleted that target under `"refuse"`), measured by how many; `exclusivity`, by how many holders beyond one; and `min`, by how many short; read over the entities the edit touched, their referrers and the targets their exclusive references hold, in both states.\
A refusal names the first breach by requested item, then by key: `details.ruleKey` `<kind>.<field>.<rule>`, `subject` the entity concerned as `<kind>:<identity>` - the target, for exclusivity - even one the caller never named, `measure`, and `opIndex` the item that led there: the entity's last write, the newest holder for exclusivity, or the item that deleted or changed the target of an entity the edit did not write.

**Why.**\
The contract judges an edit on the state it would leave and lets no edit leave a rule more broken than it found it, so the rules act on that state, a standing breach is neither repaired nor held against an edit, and a partial repair passes.

**Alternatives refuted.**\
Expanding the rules after each item - a referrer repointed by a later item of the same edit would already be gone.\
Letting the later of two new holders steal from the earlier - the contract's `steal` takes a target from the referrer that held it, which neither did.
