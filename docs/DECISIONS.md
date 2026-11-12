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
A graph plans an edit: `plan({ items }, { context }?)`, each item a `create`, a `change` to a whole record, a `set` of named fields or a `remove` (`D18`), answers `{ ok: true, position, steps, inverse, writes }` or `{ ok: false, refusal }` (`D17`).\
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
**Affects:** `src/planner.ts`, `src/scratch.ts`.\
**Refined by `D19` (2026-11-11):** a plan stops expanding as soon as more net writes than the bound are certain, and its refusal's `measure` is then the net writes certain at that point; the bound is judged before the rules' breaches.

**Reading.**\
An accepted plan answers `steps`, every write in the order applied, requested and the rules' alike, each an entity's whole state after it or its deletion; `inverse`, the reversal of each step read from the state just before it, in the order that undoes them; and `writes`, the net writes, one per entity whose state the edit as a whole changes, in the order each was first touched, which is what the store lands.\
An edit holds at most 2,000 items, refused beyond that (`too-many-items`), and its net writes after every rule are at most 2,000, the store's bound on one change, refused beyond that (`too-many-writes`, `details.ruleKey` `net-writes`, `subject` naming the bound, `measure` the writes the edit would make).

**Why.**\
Draw's tabs and its corpus compare the steps, and the store takes one write per entity in a change, so both are answered; the reversal stays step by step, as the contract records it; and a consequence-heavy edit is refused before it can land half-undoable (the build plan's section 7).

**Alternatives refuted.**\
Bounding the request alone - an edit of one item can cascade past the store's bound.

---

## D18 - Proposed reading: how an edit is read and the reference rules apply where the contract is silent

**Proposed by:** the builder of M2, 2026-11-11, for zorg's review, reading `CONTRACT.md`'s *Reference rules*, *Consequences and the stopping rule* and *Judging and refusals*; it takes the neutral corpus's readings `R14` and `R16` to `R24` (`corpus/README.md`), and settles five questions the corpus leaves uncovered, each named below.\
**Affects:** `src/planner.ts`, `src/reference-rules.ts`, `src/refusal.ts`.\
**Corrected by `D19` (2026-11-11), after the independent check of `d105140`:** its first settlement is reversed, an identity the view did not hold, created below a `"cascade-delete"` minimum, now refused rather than deleted, with `min` judged under either `onBelowMin`; and `opIndex` had named the item that last wrote the entity, not the item the breach follows from.\
The text below is kept as it was proposed.

**Reading.**\
An edit's items are `create` (an entity absent at that point, with its whole record), `change` (one present, to a whole record), `set` (one present, its named fields merged over its record) and `remove` (one present), the operations of the reference store's `create`, `update` and `delete`.\
Every item is applied in order, each checked against the scratch layer as the items before it left it; a fault is refused at the first item that faults, before any rule is judged, keyed by its code with the item's identity as its subject and a measure of 1 - `entity-present` for a `create` of an entity present, `identity-taken` where it is of another kind, `entity-absent` for a `change`, `set` or `remove` of one absent, `undeclared-kind`, `unknown-operation`, and `invalid-reference`, keyed `<kind>.<field>.holds` (`R14`, `R22`).\
The rules are then expanded once, to a fixed point, over the state all the items leave, so no item sees another item's consequences (`R14`): `onTargetDelete` acts on each referrer holding a target the edit deleted; `exclusivity: "steal"` takes the target from every referrer that held it before the edit, the referrer the edit made a holder keeping it (`R16`, `R17`); `onBelowMin: "cascade-delete"` deletes a referrer the edit left below its minimum and below what it held; and `onUnreferenced: "delete"` deletes a target such a reference held before or during the edit once no reference of any field holds it (`R17`).\
The result is judged by four rules, each breach keyed by its rule key and subject and refused when new or worse (`R18`): `targets`, a referrer holding targets absent before and after the edit, or of a kind the reference may not target, measured by how many; `onTargetDelete`, a referrer holding through a reference refusing it targets the edit deleted, by how many; `exclusivity`, a target held through an exclusive reference by more than one referrer, by how many beyond one; and `min`, a referrer holding fewer targets than the minimum of a reference refusing it, by how many fewer.\
A refusal's `subject` is the identity of the entity concerned, the target for `exclusivity` and the referrer otherwise, even one the caller never named (`R19`); `opIndex` is the requested item the breach follows from, through every consequence between (`R21`).
**Settled here, uncovered by the corpus:** an entity an edit creates below a minimum whose `onBelowMin` is `"cascade-delete"` is deleted, as one it left below; one target newly given to two holders through `"steal"` in one edit is taken from neither, and the edit is refused for `exclusivity`; on a kind with two references declaring different `onUnreferenced`, a target the `"delete"` reference stopped holding is deleted only once no reference of any field, the `"keep"` one included, holds it; a target the edit created and then deleted while held is acted on by `onTargetDelete` as any target the edit deleted, and under `"refuse"` its referrer's breach is `targets`, since the target was absent when the edit found it; and of several breaches an edit causes, the one reported is the first by requested item, then by rule key and subject.

**Why.**\
The contract judges an edit on the state it would leave and lets no edit leave a rule more broken than it found it, so the rules act on that state, a standing breach is neither repaired nor held against an edit, and a partial repair passes; and two implementations reading the corpus alike answer alike.

**Alternatives refuted.**\
Expanding the rules after each item - a referrer repointed by a later item of the same edit would already be gone.\
A `put` that creates or replaces - it cannot refuse a creation over an entity already present.\
Letting the later of two new holders steal from the earlier - the contract's `steal` takes a target from the referrer that held it, which neither did.

---

## D19 - The independent check's findings on `d105140` fixed: what a breach follows from, an identity kept to its kind, the bound met early, a cost that follows the edit

**Ruled by:** the builder of M2, 2026-11-11, on the independent check of pull request 5 at `d105140`, dispatched by draw's recorder; proposed for zorg's review where it settles what the contract leaves open, as `D16` to `D18` are.\
**Affects:** `src/scratch.ts`, `src/reference-rules.ts`, `src/planner.ts`, `src/refusal.ts`, `src/plain-members.ts`, `src/view.ts`, `test/plan.test.js`, `test/plan-properties.test.js`, `test/plan-cost.test.js`, `test/mutation.test.js`.\
**Refined by `D25` (2026-11-12):** with phases, a later phase's consequence may write back what a rule wrote, so the early stop at the bound applies only in the expansion after the last phase.

**Ruling.**\
`opIndex` names the requested item a breach follows from, read from what the breach counts that it did not count before the edit (correcting `D18`).\
For `min`, it is the item that last left the reference holding fewer targets than before that write, the entity's creation included.\
For `exclusivity`, it is the latest of the items that made each new holder hold the target.\
For `targets` and `onTargetDelete`, it is the latest over the targets newly counted, each by the item that made the reference hold it where the reference did not hold it when the edit found it, and otherwise by the item that created or deleted the target.\
So where a target the reference held was dropped and held again around its deletion, the deletion is named, though the breach needs both items; the corpus's `R21` leaves that case out.\
A write of the entity that changed none of these is no cause, and each consequence carries its cause by the same reading: a steal, the item that made its new holder hold the target; a minimum's cascade, the item that left the reference short; an `onTargetDelete` consequence, the item that deleted the target.\
A `create` of an identity the edit found held by another kind is refused `identity-taken`, a `remove` of it earlier in the edit notwithstanding, so no plan's net writes name one identity under two kinds (`D14`); an identity the view did not hold may be created, removed and created as another kind in one edit, one net write.\
`onBelowMin: "cascade-delete"` deletes an entity left below its minimum and below what its identity held when the edit found it (`R17`), and `min` is judged under either `onBelowMin` (correcting `D18`'s first settlement).\
So an identity the view did not hold, created below its minimum, or created and then left below it, is refused under `<kind>.<field>.min`; one the view held, removed and created again below its minimum, is judged against what it held before, as `R17` says, and so deleted where it holds less.\
Under `"cascade-delete"` no other entity can hold a new or worse `min` breach, since the expansion has deleted it, so judging both values changes no other answer.\
Judging `min` under `"cascade-delete"` goes beyond the corpus's `R18`, which defines a `min` breach only for a reference whose `onBelowMin` is `"refuse"`; it is proposed for zorg's review with the rest of this decision.\
The expansion stops as soon as more net writes than the bound are certain, and the plan is refused `too-many-writes`, its `measure` the net writes then certain (refining `D17`).\
Every entity the rules alone touched is a net write, since a rule only takes a reference or an entity away, so an entity no requested item wrote cannot return to the state the edit found it in; the edit's items touch at most 2,000, so a plan stops within about twice the bound's writes.\
The bound is judged before the rules' breaches, since an expansion stopped at it is not judged.\
Each round of the expansion runs its four rules in their order, each reading only what the writes since it last ran changed: the deletions, the holders of each steal reference's targets, the entities written, and the targets that lost a holder; and the reversal is built in order and turned once.\
Judging reads the referrers only of an entity whose presence or kind the edit changed, since a referrer's breaches about an entity whose record alone changed cannot change, and the exclusive targets only of the entities the edit touched, since an exclusivity breach worsens only through a new holder, which the edit touched.\
Measured with a Node timing, medians of 9 to 51 plans: a cascade-delete chain of 16,000 is refused at the bound in about 3 ms, where it took about 50 s; a cascade of 1,999 net writes is accepted in about 12 ms, where it took about 0.6 s; a field set on a tag 20,000 books hold is planned in about 0.02 ms, where it took about 25 ms; and a 12-write cascade still takes about 0.15 ms on views of 1,008 to 100,008 entities.\
The net writes compare records as plain data, an object's members whatever their order and a list's items in order, walking with a stack of its own, so a change that reorders keys alone writes nothing, and a record of any depth `applyChange` takes is planned over rather than overflowing the call stack.\
`applyChange` refuses the deletion of an entity absent at the change's position as `entity-absent`, replacing M1's `not-found` (`D10`), so one fault has one code across the component, the code a plan refuses a `change`, `set` or `remove` of an absent entity with (the corpus's `R22`); no release carried `not-found`.\
The refusals of an edit's form name its operations, `create`, `change`, `set` and `remove`.

**Why.**\
A refusal is read for the item to change, so naming an item that only retexted the entity, or rewrote a reference unrelated to the target broken, sends the caller to the wrong item; and a plan whose net writes `applyChange` refuses, or which costs what a whole cascade costs before refusing it, is no plan a consumer can land.

**Alternatives refuted.**\
Attributing to the item that changed the breached field whenever the edit changed it - a reference changed by one item that still holds a target a later item deleted would name the earlier item, which did nothing to that target; so the reading is applied per target newly counted.\
Answering the deletion of the old kind and the creation of the new for one identity - two writes to one identity in one change, which `applyChange` refuses as a duplicate and a store keyed by identity cannot take.\
Refusing deep records at the boundary of both `applyChange` and `plan` - `applyChange` already takes them, and comparing without recursion costs nothing for records of ordinary depth.\
Bounding on every entity touched - an edit whose items return entities to the state found would be refused below the bound.


---

## D20 - M3 is built: application consequences in declared phases, the conflict fault, held writes, conditions and shapes, `graph-declaration` and `plan-graph-change` still deferred for M4

**Ruled by:** the build plan, approved by the director as draw's `H31-10` (2026-11-11, draw's `dev/DECISIONS.md`), on the contract co-signed by zorg (`zorg/docs/DECISIONS.md` `D76`); the as-built choices are the builder's of M3, proposed for zorg's review where they settle something the contract leaves open, as `D21` to `D24` do.\
**Affects:** `src/declaration.ts`, `src/phases.ts`, `src/items.ts`, `src/reader.ts`, `src/scratch.ts`, `src/reference-rules.ts`, `src/planner.ts`, `src/refusal.ts`, `src/entity-graph.ts`, `package.json`, `export-map.json`, `test/`.

**Ruling.**\
A declaration states its `phases` in order, and each kind its `shape`, its `consequences` and its `conditions` (`D21`, `D24`); a malformed one is refused at creation, naming its part, and the index from each kind to the consequences of each phase listening to it is built once.\
Planning follows the stopping rule exactly: the requested items are applied and the reference rules expanded to a fixed point; each declared phase runs once, in order, its consequences in declared order each seeing the writes before it, and the rules are expanded again when the phase completes; a completed phase is never entered again.\
Two consequences writing one entity in one run of a phase is a fault; every entity a consequence or a rule wrote is judged, as every entity the edit touched is, by its shape, the reference rules and the conditions, by key and measure (`D23`); and a consequence or condition cannot change the view (`D22`).\
shape-check is taken at its `0.2.0` release, so a shape may name dialect 1 or dialect 2 and entity-graph holds no dialect of its own.\
Measured with a Node timing, medians of 21 to 51 plans on views of 1,001, 10,001 and 100,001 entities: a plan running two phases, two consequences called, takes about 0.07 to 0.09 ms at each size; declaring 300 more consequences listening to a kind the edit does not touch leaves it about 0.1 ms; and a condition that reads every entity of a kind costs what that reading costs, about 0.24, 1.5 and 22 ms on the three views.\
The neutral corpus's batch 3 (`6d74240`, merged unedited) passes all 15 cases, batches 1 and 2 still passing; batch 4 is M4's, left to it by name.\
`graph-declaration` and `plan-graph-change` stay deferred under this ruling until M4 serves them whole: what they still owe is the intent resolver, read from the declaration and applied before each requested item, and the edit context, read as plain JSON and handed to consequences, conditions and resolvers.

**Why.**\
The plan's M3 lands the hybrid the contract states - declared reference rules and the application's own consequences under one stopping rule - with every write held to the same rules, needing nothing still being built.

**Alternatives refuted.**\
Serving either row at M3 - the resolver and the context are terms of both rows that M3 does not build.\
Staying on shape-check `0.1.0` until M8 - a consumer's dialect 2 shapes would be refused in the meantime, and `0.2.0` accepts every dialect 1 shape as `0.1.0` did.

---

## D21 - Proposed reading: phases, consequences and conditions as declared and as run

**Proposed by:** the builder of M3, 2026-11-11, for zorg's review, reading `CONTRACT.md`'s *Consequences and the stopping rule* and *Judging and refusals*; it takes the neutral corpus's readings `R25` to `R29`, `R32` and `R36` (`corpus/README.md`).\
**Affects:** `src/declaration.ts`, `src/phases.ts`, `src/planner.ts`.\
**Corrected by `D25` (2026-11-12), after the independent check of `5f6c512`:** the conflict's measure is stated below as the settlement it is; and the last sentence below, on the net-write bound, held only for the expansion after the last phase, as `D25` restates.\
The rest is kept as it was proposed.

**Reading.**\
A declaration's `phases` is a non-empty list of distinct names, in running order, and may be left out by a declaration with no consequence.\
A kind's consequence is `{ id, phase, trigger, run }`, keyed `<kind>.<id>`; its trigger is one clause or a list of them, each `{ created: [kinds] }`, `{ deleted: [kinds] }` or `{ changed: { kind, fields } }`, every kind declared; a phase or a kind it names that the declaration does not is refused, its subject `<kind>.consequences.<id>.phase` or `.trigger` and the fault `undeclared <name>`.\
A kind's condition is `{ id, check }`, keyed `<kind>.<id>`.\
Consequences run in declared order, the kinds as listed and each kind's consequences as listed (`R26`); each runs at most once in a run of its phase, when its turn comes, if the edit so far then holds a change its trigger hears, and is handed every such change (`R27`).\
A change is read against the state the edit found: an entity created, one deleted, or one of the named top-level fields differing, compared as plain data, on an entity present in both; so an entity created and removed in one edit is no change.\
A kind first touched during a phase brings the consequences listening to it, declared after the one that touched it, into the same run.\
`run` is called with `{ matches, graph }`: each match `{ kind, id, before, after, fields }`, the records as the edit found them and as they stand, and `graph` a reader of the edit so far (`D22`); it returns a list of writes in the edit's own form, `create`, `change`, `set` or `remove`, each checked and applied as a requested item is, and a write a requested item could not make is refused with that fault's code, the consequence's key as `details.ruleKey` and the write's identity as `subject`.\
A write of a consequence carries the requested item the changes it heard follow from (`R33`; `D19`): an entity's creation or deletion, or the latest write of a field its trigger names.\
Two different consequences writing one entity, by any write, in one run of a phase is refused as `consequence-conflict` at the second one's write, keyed by the code, the entity as `subject`, `opIndex` -1, and the two in `details.writers` (`R29`; `D23`); a consequence writing what a requested item, a rule or an earlier phase wrote is no fault.\
This settles when the fault is: it exists at the second writer's write, so planning stops there, a third writer never runs, and the measure is always 2.\
After every phase the rules expand from the writes since they last ran; a hold a consequence gained on a target the edit deleted sends that target round again, so `onTargetDelete` acts on its new referrer.\
A condition's `check` is called with a reader and answers a list of `{ subject, measure, sentence }`, each subject named once and each measure above nothing; it is run on the state the edit found, read once per view position, and on the state the edit would leave, and each breach is keyed `<rule key>@<subject>` and refused as `condition-broken` when new or worse, its `sentence` carried verbatim and its `opIndex` -1 (`R32`).\
A condition's breach is reported only where no breach of a reference rule or a shape is, since those name the item they follow from.\
The net-write bound counts the entities only the rules touched as certain writes, since a consequence, like a requested item, may write an entity back as the edit found it; it is judged again on the net writes once the phases are done.

**Why.**\
The contract's stopping rule bounds planning by its phases, and the corpus reads "the next consequence sees it" as covering triggers as well as state; reading each change against the state the edit found makes a trigger hear what the edit does rather than how it was written.

**Alternatives refuted.**\
Fixing a phase's consequences when it begins, as draw's planner does - a consequence listening to a kind an earlier consequence of the phase first touched would not hear the change the contract says it sees.\
Naming the second consequence as the conflict's `ruleKey` and the item it followed from as its `opIndex`, as this branch first built - the fault is between two consequences, not of one item.

---

## D22 - Proposed reading: a consequence or condition cannot change the view

**Proposed by:** the builder of M3, 2026-11-11, for zorg's review, on the brief's purity requirement and `CONTRACT.md`'s "a pure function".\
**Affects:** `src/reader.ts`, `src/phases.ts`, `src/entity-graph.ts`.

**Reading.**\
Everything a consequence or condition is handed is frozen - the matches, each record, every entity and list its reader answers - and its reader answers only during the call it is handed to, throwing when asked afterwards or for a kind the declaration does not hold.\
What it returns is read once as plain JSON through shape-check, running none of its code.\
A consequence that throws, returns what is not plain data or not a list, or reaches for what it was handed is refused as `consequence-failed`, its key as `details.ruleKey` and the entity whose change it heard as `subject`; a condition so failing is refused as `condition-failed`.\
While a graph plans, its `applyChange` and `plan` refuse as `reentrant`, so a function that closes over the graph cannot change the view or start another plan.\
What is not contained: a function that never returns, and a function's writes to its own variables or to the world outside, which no component can prevent; the rule is that none of it reaches the view.

**Why.**\
Planning changes no answer, so nothing the application's functions do may reach the view, and a function's failure is the application's to see, named, rather than an exception from inside planning.

**Alternatives refuted.**\
Copying what each function is handed instead of freezing it - a function's change to its copy would go unseen, where freezing makes it throw in strict-mode code and the plan names it.

---

## D23 - Proposed reading: held writes are judged as every write is, and a refusal concerning one names its writers in `details.writers`, a member owed to zorg

**Proposed by:** the builder of M3, 2026-11-11, for zorg's review, reading `CONTRACT.md`'s *Consequence writes held to request rules*; it takes the corpus's readings `R30` and `R33`.\
**Owed to zorg:** the new member `details.writers`, since the contract's refusal form names `details` as `{ ruleKey, subject, measure, opIndex, sentence }` and no member can name a consequence there; this branch adds it in the code and leaves `CONTRACT.md`'s terms as they are until zorg rules.\
**Affects:** `src/reference-rules.ts`, `src/refusal.ts`, `src/planner.ts`, `src/phases.ts`.\
**Refined by `D25` (2026-11-12):** for a breach of a reference rule or a shape, `writers` names the consequence or rule whose write the breach follows from (the corpus's `R38`), a rule by its key; a condition's breach names those that wrote its subject.\
The text below is kept as it was proposed.

**Reading.**\
Every entity a consequence or a reference rule wrote is judged as it stands in the result by its shape, the reference rules and the conditions, by key and measure, as every entity the edit touched is: refused for a breach it introduces or raises, so an entity that already failed and fails no worse is not (`R30`).\
The refusal names the rule broken - its code and `ruleKey` - the entity in `subject`, and the requested item behind the consequence's matching changes as `opIndex` (`R33`).\
A refusal concerning an entity a consequence wrote names the consequences that wrote it, in any phase, each `<kind>.<id>` in declared order, in `details.writers`: the referrer for a breach of `targets`, `onTargetDelete` or `min`, the new holder for a breach of `exclusivity`, the entity for a shape, and a condition's subject where it names an entity.\
The conflict fault names its two consequences there too (`D21`); a refusal concerning no entity a consequence wrote carries no `writers`.

**Why.**\
The contract asks the refusal to name the consequence, and also names the rule broken, the entity and the item; with `ruleKey` naming the rule, as batch 2's refusals of rule writes do, the consequence needs a member of its own, and the corpus proposes the same one.

**Alternatives refuted.**\
Naming the consequence in `ruleKey` under a code of its own, `held-write`, as this branch first built - the rule broken would then be named nowhere, and a rule write's refusal, which names the rule, would read differently from a consequence write's.\
Carrying the consequence in `sentence` - that member is an application condition's own words, carried verbatim.

---

## D24 - Proposed reading: shapes are judged through shape-check, a requested write at its item and every other write on the result

**Proposed by:** the builder of M3, 2026-11-11, for zorg's review, reading `CONTRACT.md`'s *Judging and refusals*; it takes the corpus's readings `R30` and `R31`.\
**Affects:** `src/declaration.ts`, `src/items.ts`, `src/reference-rules.ts`.

**Reading.**\
A kind's `shape` is a shape document handed to shape-check's `prepareShapeDocument` once, at creation; one shape-check refuses is refused, its subject `<kind>.shape<pointer>: invalid`, the pointer of shape-check's first problem.\
A requested write whose record misfits its kind's shape is refused at its item, before any rule is judged and whether or not the entity fit before, as `shape-misfit` keyed `<kind>.shape`, the entity as `subject`, a measure of 1 and the item as `opIndex` (`R31`); a reference's form is checked before its shape.\
An entity a consequence or a rule wrote is judged on the result, a misfit a breach of measure 1, so one that misfit before and misfits after is not refused (`R30`); its `opIndex` is the latest write that changed a top-level field a newly counted misfit names.\
The view takes in a change or an opening without judging shapes, as it applies no rule (`D12`).

**Why.**\
The contract says a shape misfit of a requested write refuses the plan, without the held writes' exception for an entity that already failed; and a shape is fitted or misfitted, so its measure cannot rise.

**Alternatives refuted.**\
Judging a requested write's shape on the result by its number of misfits, a partial repair allowed, as this branch first built - the contract states the exception for consequence writes alone.

---

## D25 - The independent check's findings on `5f6c512` fixed: the early stop waits for the last expansion, a rule is named among the writers, changes are worked out once per write

**Ruled by:** the builder of M3, 2026-11-12, on the independent check of pull request 6 at `5f6c512`, dispatched by draw's recorder; proposed for zorg's review where it settles what the contract leaves open, and `details.writers` still owed to zorg (`D23`).\
**Affects:** `src/planner.ts`, `src/reference-rules.ts`, `src/scratch.ts`, `src/phases.ts`, `src/declaration.ts`, `test/phases.test.js`, `test/plan-cost.test.js`, `test/plan.test.js`, `test/mutation.test.js`, `test/corpus.test.js`.

**Ruling.**\
The expansion may stop early at the net-write bound only when it is the last of the plan: after the requested items when the declaration has no phase, and otherwise after the last phase.\
Before that, a later phase's consequence may write back what a rule wrote, so an entity the rules alone have touched so far is not yet a certain net write; each earlier expansion runs to its fixed point, which is linear in its writes (`D19`), and the net writes are judged once the phases are done.\
In the last expansion no requested item or consequence can still write, so an entity only the rules touched is a certain net write, as `D19` argues, and stopping when more than the bound are certain refuses only an edit the final count would refuse.\
A rule's write records its key, `<kind>.<field>.<option>` of the reference declaring it: `onTargetDelete` for an unlink or a cascade, `exclusivity` for a steal, `onBelowMin` for a minimum's cascade, `onUnreferenced` for a target deleted unreferenced.\
For a breach of a reference rule or a shape, `details.writers` names the consequence or rule whose write the breach follows from, as its `opIndex` is read (`R38`; `D19`), and is absent where that write was a requested item's; for a condition's breach, which no one write can be read from, it names every consequence and rule that wrote its subject, consequences first, each in declared order.\
Each entity's change over the edit is worked out once per write of it and frozen, and handed as it is to every consequence that hears it; consequences with one trigger share what it hears while nothing has been written since; and what a trigger hears, and the write it follows from, are read in one pass.\
Measured with a Node timing, the best of three or median of five plans, 2,000 entities of a kind each set in one edit: 300 consequences listening with one trigger add about 1 ms to the 19 ms of planning the edit with none, where they cost about 730 ms; 300 with distinct triggers take about 165 ms, each handed all 2,000 of its changes.\
The corpus's three cases of a consequence's write breaking a per-entity rule (`e9e0707`, `b3-16` to `b3-18`, merged unedited) pass with the rest of batch 3.\
The cost of this: an expansion before a phase is bounded only by what the edit sets off, and what it writes is held until the final count refuses it.\
Measured by the builder with a Node timing of one plan each, a hub whose spokes cascade-delete, one phase declared after: 100,000 spokes are refused `too-many-writes` in about 0.46 s, the heap about 138 MB larger by the answer, and 300,000 in about 1.4 s and 481 MB; the independent check of `d234633` measured 0.67 s and 168 MB, and 2.2 s and 590 MB.\
M5's bound on an edit's undo record will need a limit on the steps a plan takes as well, so such an edit is refused before it costs this; that limit is owed to M5.

**Why.**\
An edit that changes nothing cannot write too much; and the contract asks a refusal to name the consequence or rule, so a rule that wrote the entity is named as a consequence is.

**Alternatives refuted.**\
Counting an entity as a certain write once a requested item or consequence can no longer write it - the scratch layer cannot know that before the last phase has run.\
Keeping each consequence's matches apart and caching only the change records - 300 listeners with one trigger would still each read every change, about 290 ms where they now add about 1 ms.

