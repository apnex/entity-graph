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
