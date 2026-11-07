# entity-graph - Vision

**Status: draft, 2026-11-01 (zorg's `docs/BACKLOG.md`, `BL33`, under `D35`); awaits cold reading and the director's ratification.**\
This document states why entity-graph exists and what it will never be.\
It carries no current state, no roadmap, and no schedule.

Holding this document authorises nothing.\
It does not ratify a decision, admit a component to any registry, or approve a contract change.\
A change of direction is recorded as a decision first and absorbed here afterwards.

---

## North star

> Keep an in-memory graph of declared references between typed entities, dated by the store position it reflects, and plan every edit with its cascades, reactions, result invariants and inverse into one atomic change before anything is written.

Five terms in that sentence carry weight, so this document defines them rather than leaving them to the reader.

**Declared references** means an application states as data which fields of which kinds point to which target kinds, what cardinality or exclusivity each holds, and what happens when a referenced target is deleted - refuse the delete, delete the referrer with it, or unlink the reference (with an optional minimum-member threshold below which the referrer itself dissolves).\
No kind and no reference rule is built in.

**In-memory graph, dated by position** means every forward and reverse reference index lives in memory, stamped with the single monotonic `position` of the underlying store or stream it reflects.\
Every traversal - who references this entity, what does it reference, which exclusive container owns it, what is reachable from it - is synchronous and side-effect-free.

**Plan every edit on a scratch projection** means a proposed intent (one or more creates, updates or deletes) is evaluated against a scratch copy of the current state without mutating the live view.\
The planner expands declarative cascades (`cascade-delete`, `unlink`, `steal`, `onBelowMin`) and any pure per-kind reaction hook to a fixed point, narrows every update patch to the keys that actually changed, and computes the exact inverse of each forward write from the state immediately before it.

**Result invariants** means referential integrity and each kind's pure invariant check are evaluated once on the **resulting** post-cascade state, never per intermediate step.\
A batch may pass through a transient state that would be illegal on its own and still end valid.\
Each violation carries a stable rule-and-subject key and a numeric measure, so the planner refuses any edit that introduces a new violation or worsens an existing one, while permitting a partial repair that reduces an existing violation's measure.

**One atomic change** means the planned forward writes either land together as a single positioned change in the store beneath (or on the local projection, with the exact inverse recorded for undo and redo) or are refused whole with a structured explanation, leaving the live graph untouched.

---

## Why it exists

An entity store keeps records, validates each record's own shape, and orders changes by position (`entity-store`, `C4`).\
As soon as records point to one another - links to endpoints and waypoints, groups to members, tasks to dependencies - three problems appear that a single-record store cannot answer on its own:

1. **Reverse lookups:** answering *"what links touch this node?"* or *"which group owns this member?"* requires scanning every record unless an incremental reverse index is kept in step with every change.
2. **Cascades and multi-step edits:** deleting a node must delete the links anchored to it, strip a deleted waypoint from the routes that bend through it, and dissolve a group left with fewer than two members - all in one atomic change, and identically in the browser preview and on the server.
3. **Rules written in two places:** when referential checks are attached to individual operations instead of the resulting state, or written once for incremental edits and a second time for whole-document loads, the two copies drift (`drawv2`'s `B81` to `B85`).

entity-graph solves all three in one neutral mechanism: reference edges are declared once as data, reverse indices are maintained incrementally off the change stream, and one pure planner computes the resulting writes, their invariants, and their inverses before any write commits.

---

## What it is

An embeddable, runtime-neutral library that sits over `entity-store` (`C4`) on a host, or over a dated stream of changes (`entity-api`, `C6`) in a client.\
The application supplies its kinds, their reference declarations, and any pure per-kind reaction or result-invariant functions. entity-graph maintains the synchronous in-memory view and indices, plans intents into flat atomic write batches with their inverses, and either commits them to `entity-store` or applies incoming positioned changes from a stream.

---

## What it is not

**Not the durable store.**\
It writes no files, keeps no append-only log on disk, and does not assign store positions on its own; `entity-store` (`C4`) owns durability, history bounds, repeat recognition and log compaction.

**Not a single-entity shape validator.**\
Checking whether one entity's own fields fit its schema belongs to `shape-check` (`C3`). entity-graph checks what crosses entity boundaries: references, exclusivity, cascades and whole-graph invariants.

**Not a network service or transport.**\
It never listens and never sends.\
Carrying changes and calls across processes belongs to `entity-api` (`C6`), `operation-call` (`C5`) and `agp` (`C1`).

**Not an authority.**\
It never decides which principal may make a change; the application's policy decides before committing, and `access-grants` (`BL20`) is a separate concern.

**Not the owner of domain geometry or layout.**\
Grid arithmetic belongs to `snap-grid` (`C11`), pointer gestures to `input-binding` (`C12`) and `input-capture` (`C13`), and SVG rendering to `vector-scene` (`C14`).\
Where a domain rule depends on geometry (such as straight-link capacity between two nodes), the application supplies it as a pure reaction or invariant function on that kind's row; entity-graph runs the hook and knows nothing of coordinates.

---

## What success means

Four dimensions.\
They are not weighted, and they do not collapse.

**Exactness.**\
Every reverse index agrees with a fresh full scan after any sequence of planned commits, undo/redo steps, or streamed changes, and no rejected plan ever mutates the live view.

**Single-source rules.**\
Every referential rule and cascade is stated once on the kind declaration and checked on the resulting state, so incremental edits, batch imports, optimistic client previews and server commits never disagree.

**Leanness.**\
Reads and reverse-index lookups are synchronous and $O(1)$ or $O(\text{degree})$, index maintenance is $O(\text{changed references})$, and planning touches only a scratch projection.

**Reuse.**\
Both a diagramming canvas (`drawv2`) and a non-visual graph consumer (such as a dependency or knowledge graph over `zorg`) adopt it without a fork or a domain-specific branch in the core.

---

## Authority

Held by the director.\
Drafted by anyone; ratified only by the director.

This statement is amended, never quietly rewritten.\
A ruling that changes direction is recorded as a decision and absorbed here, so the reasoning survives the change.

Where this narrative and a verified record disagree about state, the record governs.
