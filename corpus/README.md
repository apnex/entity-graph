# entity-graph neutral corpus

This is the neutral corpus that `CONTRACT.md` *Acceptance* asks for.
It was written from `CONTRACT.md`, `VISION.md` and `docs/DECISIONS.md` alone, by an agent other than the implementer, over kinds of no application.
The implementer never edits a case.
A case the implementer believes wrong goes back to its author, and any change to a case, or to a reading below, is recorded as an entity-graph decision.

---

## Batches

| Batch | Directory | Covers |
|---|---|---|
| 1 | `batch-1/` | Milestone M1: declaring kinds and their reference fields, refusals of a bad declaration, entities held by kind and id at a known position, changes taken in, and the answers `targetsOf`, `referrersOf`, `ownerOf` and `reachable`, each dated to a position |

Planning, reference rules applied by planning, consequences, phases, resolvers, context, undo and the store port belong to later batches.

---

## The case format

The contract defines no corpus format, so this one is the corpus's own.
Each case is one JSON file, self-contained, holding its own declaration.
Every key below is required unless marked optional.

```json
{
  "case": "b1-01-single-reference",
  "batch": 1,
  "summary": "One sentence saying what the case shows.",
  "covers": ["dated-graph-view"],
  "readings": ["R1", "R2"],
  "declare": { "kinds": [] },
  "verdict": "accepted",
  "steps": []
}
```

- `case` is the file name without `.json`.
- `covers` names the contract rows, and terms of the rows, the case exercises.
- `readings` names every reading in the section *Readings* below that the expected answers depend on, so a ruling against a reading finds every case it touches.
- `verdict` is `"accepted"` when the declaration is accepted and `"refused"` when it is refused.
- An accepted case carries `steps` and no `refusal`; a refused case carries `refusal` and no `steps`.

### The declaration

`declare` is `{ "kinds": [ <kind>, ... ] }`, a list rather than an object, so that a duplicate kind can be written.

A kind is `{ "kind": <name>, "references": [ <reference>, ... ] }`, a list again, so that a duplicate field can be written.

A reference is an object with these keys:

- `field`: the record field that holds the reference.
- `targets`: the list of kinds it may target.
- `holds`: `"one"` or `"many"`, how many targets it holds.
- `onTargetDelete`: `"refuse"`, `"cascade-delete"` or `"unlink"`.
- `exclusivity` (optional): `"refuse"` or `"steal"`; absent means a target may have any number of referrers through this field.
- `min` (optional): a minimum number of targets, given together with `onBelowMin`.
- `onBelowMin` (optional): `"refuse"` or `"cascade-delete"`, given together with `min`.
- `onUnreferenced` (optional): `"keep"` or `"delete"`, `"keep"` when absent.

Batch 1 declares no shapes, conditions, consequences, phases or intent resolvers.
A harness whose API requires a shape for each kind supplies one that admits every record in the case.
A harness maps this declaration onto the implementation's declaration form; the mapping may rename keys but may not add, drop or default a rule.

### Entities and records

An entity is `{ "kind": <kind>, "id": <id>, "record": <plain JSON object> }`.
A `"one"` reference field holds a target id as a string, or `null` for no target.
A `"many"` reference field holds a list of target ids, empty for no target.
Every other field of a record is plain data and is never a reference, whatever its value looks like.

### Steps

Steps run in order.
The first step is a `start` step, and there is exactly one.

- `{ "start": { "position": <integer>, "entities": [ <entity>, ... ] } }`: the store holds exactly these entities at this position.
  The harness fills the view from such a store, or lands all of them as one change at this position into an empty view; the answers must not differ.
- `{ "take": { "position": <integer>, "writes": [ <write>, ... ] } }`: one change the store placed at this position, by any writer, taken in by the view.
  Positions strictly increase from step to step.
  The writes of one change name distinct entities.
- `{ "ask": { "position": <integer>, "questions": [ <question>, ... ] } }`: the questions are asked in order against the view as it stands.
  `position()` must answer this position, and every answer the implementation dates must state it.

A write is one of:

- `{ "op": "put", "kind": <kind>, "id": <id>, "record": <record> }`: the entity exists after the change with exactly this record, created or replaced.
- `{ "op": "del", "kind": <kind>, "id": <id> }`: the entity does not exist after the change.

A harness maps each write onto the change record the implementation takes in.
No case uses a partial update, so no case depends on what a `set` merges.

### Questions

Each question carries its expected `answer`.

| Question | Keys | `answer` |
|---|---|---|
| `get` | `kind`, `id` | the record, or `null` when the entity is absent |
| `all` | `kind` | the ids of every entity of that kind |
| `targetsOf` | `id` | every `{ "field", "id" }` pair: a reference field of the entity and one target id it holds |
| `targetsOf` | `id`, `field` | the target ids held in that one field |
| `referrersOf` | `id` | every `{ "kind", "id", "field" }` triple: an entity, and the field through which it holds the asked id |
| `ownerOf` | `member`, `containerKind` | the id of the entity of `containerKind` that holds `member`, or `null` |
| `reachable` | `from` | the ids reachable from `from` by following references |

Every list in an answer is compared without regard to order (*Acceptance*, "compared without regard to the order of a collection").
No answer holds the same element twice.
If the implementation's `referrersOf` or `targetsOf` answers ids only, the harness compares the distinct ids of the expected answer and reports the case as passing equivalently rather than exactly.
Filters (`referrersOf(targetId, filter?)`, `reachable(fromId, filter?)`) are not used, since what a filter is stays owed.

### A refused declaration

```json
"refusal": { "reason": "target-kind-undeclared", "part": "entity-graph", "names": ["note", "tags", "tag"] }
```

- The declaration is refused when the graph is created, and no graph exists to ask.
- `part` is the shared refusal form's `part`, `"entity-graph"`.
- `reason` is a label of this corpus, not a code the contract names; the contract names no codes, so a harness keeps a map from each label to the implementation's code, one code per label.
- `names` lists the strings the refusal must carry, in `details` or in its text, so the declaration at fault can be found: always the kind, and the field when the fault is in a reference.
- Each refused case holds exactly one fault, so it does not matter whether the implementation reports the first fault or every fault.

The labels used in batch 1 are `target-kind-undeclared`, `no-target-kind`, `duplicate-kind`, `duplicate-reference-field`, `target-count-undeclared`, `onTargetDelete-undeclared`, `onTargetDelete-invalid`, `exclusivity-invalid`, `onUnreferenced-invalid`, `min-without-onBelowMin`, `onBelowMin-without-min`, `onBelowMin-invalid`, `min-invalid` and `unknown-reference-option`.

---

## Readings

Where the contract leaves a question open, the corpus takes one reading and says so here.
Each is a reading, not a ruling, and is open to an entity-graph decision.

- **R1. Identity.** Every id in a case is unique across all kinds, and a reference holds its target's id as a string.
  The surface names entities by id alone (`referrersOf(targetId)`, `targetsOf(id)`, `reachable(fromId)`), so the corpus never gives two kinds the same id and does not depend on whether ids are unique per kind.
- **R2. How many targets.** The contract says a reference declares "how many targets it holds" without a form.
  The corpus writes `holds: "one" | "many"`, a `"one"` field holding an id or `null`, a `"many"` field holding a list.
- **R3. Changes are reflected as the store placed them.** Taking in a change applies no reference rule (`VISION.md`, *Not a gate on other writers*).
  A deleted target leaves its referrers' references in place.
  A reference to an absent target, to a target of a kind the reference does not allow, an exclusive target held twice, and a reference below its minimum are each indexed as they stand.
- **R4. Answers read the references present entities hold.** `targetsOf` lists every id an entity holds, and `referrersOf(x)` and `ownerOf(x, k)` find the holders of `x`, whether or not `x` is present, since an answer is "what a fresh reading of the store's entities" gives (`VISION.md`, *Exactness*).
  An absent entity holds nothing, so `targetsOf` and `reachable` from it answer empty.
- **R5. Direction of `reachable`.** It follows references forward, from the entity holding a reference to its target, through every reference field of every kind, transitively ("what can be reached from it by following references").
- **R5a. The start of `reachable`.** The answer is every id reached by a path of one or more references, so the start appears only when a cycle leads back to it.
- **R5b. Absent targets in `reachable`.** An absent target that is held is reached, as R4 makes it a target, and leads nowhere further.
- **R6. `ownerOf`.** `ownerOf(member, containerKind)` answers the id of the entity of `containerKind` holding `member` in any of its reference fields, directly and not transitively, or `null` when none does.
  What it answers when two such entities hold the member stays owed, and no case asks it.
- **R7. Positions.** After the start, `position()` is the start's position, and after a change is taken in, it is that change's position.
- **R7a. Gaps.** Positions strictly increase but need not be consecutive, since the contract requires only position order.
- **R8. Rename.** The contract names no rename, so a rename is a delete and a create in one change, and referrers that are not rewritten keep the old id.
- **R9. Declaration refusals.** A bad declaration is refused when the graph is created, in the shared refusal form with `part: "entity-graph"`, naming the kind and field at fault.
  The contract fixes `GraphRefusal` for plans and names no codes for a declaration, so the corpus asserts its own labels through a harness map.
- **R10. Required and optional rule options.** `targets`, the count a reference holds and `onTargetDelete` are required, since the contract says a reference declares each of them and gives none a default.
  `exclusivity` is optional, absent meaning not exclusive, since both of its values make a target exclusive.
  `onUnreferenced` is optional, with `"keep"` its stated default.
- **R11. `min` and `onBelowMin` go together.** `min` is declared "with `onBelowMin`", so either without the other is refused.
  `min` is a number of targets, so a negative `min` is refused.
- **R12. No unknown rule option.** A reference carrying an option the contract does not name is refused rather than ignored.
  The declaration is held to a declared shape (`graph-declaration` requires `shape-check:declared-shape-validation`), and an ignored misspelt rule would be a rule silently not kept.
- **R13. Declaration order.** A reference may target a kind declared later in the list.

---

## Checking the files

The corpus author ran one check of form over the files, and no other code.
It checks that each case parses as JSON, carries the keys above, is named for its file, and keeps ids unique across kinds.
It checks that an accepted case starts with one `start` step, keeps positions strictly increasing, asks at the position of the last step before it, and writes each entity at most once per change.
It checks that no answer repeats an element, every reading and label a case names is listed here, every file is plain ASCII under 16 KiB, and no case uses a drawing's words.
Every expected answer was worked out by hand from the contract text.
