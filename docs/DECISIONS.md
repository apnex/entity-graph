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
