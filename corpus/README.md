# entity-graph neutral corpus

This is the neutral corpus that `CONTRACT.md` *Acceptance* asks for.\
It was written from `CONTRACT.md`, `VISION.md` and `docs/DECISIONS.md` alone, by an agent other than the implementer, over kinds of no application.\
The implementer never edits a case.\
A case the implementer believes wrong goes back to its author, and any change to a case, or to a reading below, is recorded as an entity-graph decision.

---

## Batches

| Batch | Directory | Covers |
|---|---|---|
| 1 | `batch-1/` | Milestone M1: declaring kinds and their reference fields, refusals of a bad declaration, entities held by kind and id at a known position, changes taken in, and the answers `targetsOf`, `referrersOf`, `ownerOf` and `reachable`, each dated to a position |
| 2 | `batch-2/` | Milestone M2: planning an edit with every declared reference rule, to a fixed point, judged on the state it would leave, refused with the facts the contract names, and changing no answer |

Application consequences, phases, conditions over the whole set, shapes, resolvers, context, undo and the store port belong to later batches.

---

## The case format

The contract defines no corpus format, so this one is the corpus's own.\
Each case is one JSON file, self-contained, holding its own declaration.\
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

Batch 1 declares no shapes, conditions, consequences, phases or intent resolvers.\
A harness whose API requires a shape for each kind supplies one that admits every record in the case.\
A harness maps this declaration onto the implementation's declaration form; the mapping may rename keys but may not add, drop or default a rule.

### Entities and records

An entity is `{ "kind": <kind>, "id": <id>, "record": <plain JSON object> }`.\
A `"one"` reference field holds a target id as a string, or `null` for no target.\
A `"many"` reference field holds a list of target ids, empty for no target.\
Every other field of a record is plain data and is never a reference, whatever its value looks like.

### Steps

Steps run in order.\
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

A harness maps each write onto the change record the implementation takes in.\
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

Every list in an answer is compared without regard to order (*Acceptance*, "compared without regard to the order of a collection").\
No answer holds the same element twice.\
If the implementation's `referrersOf` or `targetsOf` answers ids only, the harness compares the distinct ids of the expected answer and reports the case as passing equivalently rather than exactly.\
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

## Planning steps (batch 2)

Batch 2 keeps every form above and adds one step, `plan`, which asks the graph to plan an edit against the view as it stands.\
A plan lands nothing, so a `take` that follows a plan is a change from the store, not the plan landing.

```json
{ "plan": { "position": 4, "edit": [ <item>, ... ], "outcome": "accepted", "writes": [ <write>, ... ] } }
```

```json
{ "plan": { "position": 4, "edit": [ <item>, ... ], "outcome": "refused", "refusal": { "part": "entity-graph", "code": "reference-rule", "ruleKey": "book.shelf.onTargetDelete", "subject": "b1", "measure": 1, "opIndex": 0 } } }
```

- `position` is the position the plan must state it was planned from, which is the view's position.
- `edit` is the list of requested items, in the order asked.
- `outcome` is `"accepted"` or `"refused"`; an accepted plan carries `writes` and no `refusal`, a refused one carries `refusal` and no `writes`.

### Items

An item is one of:

- `{ "op": "create", "kind": <kind>, "id": <id>, "record": <record> }`: the entity is absent at that point in the edit and exists after it with this record.
- `{ "op": "change", "kind": <kind>, "id": <id>, "record": <record> }`: the entity is present at that point in the edit and holds this record after it.
- `{ "op": "remove", "kind": <kind>, "id": <id> }`: the entity is present at that point in the edit and is absent after it.

A `change` item states the entity's whole record.\
No case leaves out of a `change` a field the entity held, so a harness may map `change` onto a write that replaces a record or onto one that sets the fields named, and get the same record.\
One case names one operation the contract does not, to be refused.

### An accepted plan

`writes` are the plan's net writes: one write for every entity whose state after the edit differs from its state before, in the form of a `take` step's writes.\
A `put` carries the entity's whole record after the edit, whether the edit created or changed it; a `del` names an entity present before the edit and absent after it.\
An entity the edit created and removed again, or left with the record it had, has no write.\
`writes` is compared without regard to order, and every entity it does not name is unchanged.\
The resulting entities are the view's entities with `writes` applied, so a harness comparing equivalently compares those.\
No case asserts the order of a plan's steps, its reversal, or the steps themselves (`R15`).

### A refused plan

`refusal` holds the facts of the `GraphRefusal` the contract names: `part`, `code`, and from `details` the `ruleKey`, `subject`, `measure` and `opIndex`.\
`what`, `why`, `fix` and `details.sentence` are not asserted, since no batch 2 case declares an application condition whose sentence could be carried.\
`code` is a label of this corpus, mapped by a harness to the implementation's code, one code per label, as a declaration's `reason` is.\
`ruleKey`, `subject`, `measure` and `opIndex` are compared exactly, under the readings `R18` to `R22`.\
Each refused plan breaks exactly one rule once, or holds exactly one fault, so it does not matter which of several breaches an implementation would report.

The codes used in batch 2 are:

| `code` | Refused for | `ruleKey` |
|---|---|---|
| `reference-rule` | a declared reference rule the edit would break, judged on the state it would leave | `<kind>.<field>.<option>`, the option being `targets`, `onTargetDelete`, `exclusivity` or `min` |
| `invalid-reference` | a requested record holding a reference in a form its declaration cannot hold, at the item | `<kind>.<field>.holds` |
| `unknown-operation` | an item naming no operation the edit knows, at the item | `unknown-operation` |
| `entity-absent` | a `change` or `remove` of an entity absent at that point in the edit, at the item | `entity-absent` |
| `entity-present` | a `create` of an entity present at that point in the edit, at the item | `entity-present` |
| `identity-taken` | a `create` of an id an entity of another kind holds, at the item | `identity-taken` |
| `undeclared-kind` | an item naming a kind the declaration does not hold, at the item | `undeclared-kind` |

### Planning changes no answer

After every `plan` step, refused or accepted, the harness checks that the view is as it was before the step: the same position, and for every declared kind the same entities with the same records.\
Many cases also ask questions after a plan, and those answers are the ones the view gave before it.

### The three worlds

Batch 2 is written over three small worlds, each declared in full in every case that uses it.

- A library: a `shelf` features one `book` (`featured`, unlinked when the book goes); a `book` stands on one `shelf` (`shelf`, the shelf's removal refused while a book stands on it) and carries `tag`s (`tags`, unlinked, a tag deleted once the edit leaves no book carrying it).
- A project: a `team` and a `committee` each hold at least two `person`s (`members`, unlinked, a member taken from the team or committee that held it); a team falling below two is deleted, and a committee falling below two refuses the edit; a `task` waits on `task`s (`waitsOn`, unlinked), is assigned to one `team` (`assignee`, unlinked, the team kept when no task is assigned to it) and is owned by one `person` (`owner`, unlinked, an owner taken from the task that held it).
- A document: a `section` sits in a parent `section` (`parent`, deleted with it) and cites `figure`s (`cites`, a cited figure's removal refused); a `figure` sits in one `section` (`section`, deleted with it); a `caption` belongs to one `figure` (`figure`, deleted with it, a figure holding one caption only, a second refused).

---

## Readings

Where the contract leaves a question open, the corpus takes one reading and says so here.\
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

Readings `R14` onwards are batch 2's.

- **R14. Items, and one expansion.** An edit's items are applied in the order asked to a copy of the view, each checked for faults against the copy as the items before it left it, and only then are the reference rules expanded, once, to a fixed point.
  The stopping rule says planning "ends after at most one expansion more than there are phases", which leaves one expansion for the requested items, not one per item.
  So no item sees another item's consequences, and a `change` of an entity a later rule deletes is no fault.
- **R15. What a plan answers (owed at M2).** A plan answers at least its net writes, one per entity whose state the edit changes, a `put` with the whole record or a `del`, with the position it was planned from.
  The corpus asserts those and nothing else of an accepted plan; whether a plan also answers its steps is the implementation's, and no case asserts steps, since the contract fixes no order among the consequences of reference rules.
- **R16. Removing the only target of a one-target reference (owed at M2).** It leaves the reference holding `null`, the referrer kept, whether the target was unlinked by its deletion or taken by `exclusivity: "steal"`.
  A `null` one-target reference holds no target, as batch 1's `R2` reads, and is then judged by any `min` the reference declares.
- **R17. What each rule does in the expansion.** Each rule acts only on what the edit changed, so a breach already in the view that the edit does not touch is left as it is.
  `onTargetDelete` acts on a present referrer holding a target the edit deleted: `"unlink"` takes the target out of a list or sets a one-target reference to `null` (`R16`), `"cascade-delete"` deletes the referrer, and `"refuse"` does nothing and leaves the breach to judgement.
  `exclusivity: "steal"` acts on a target held through the reference by more than one present referrer, at least one of which the edit made a holder: every referrer that held it before the edit loses it as `"unlink"` would take it.
  `onBelowMin: "cascade-delete"` deletes a present referrer holding fewer targets than its minimum and fewer than it held before the edit.
  `onUnreferenced: "delete"` deletes a present target that a reference declaring it held before or during the edit, and that no reference of any field holds after it.
  A deletion by any rule is a deletion the edit made, so the rules act on it in turn, until nothing changes.
- **R18. Judging by key and measure.** After the expansion, each breach is identified by its `ruleKey` and `subject` and has a measure; the plan is refused when a breach is new or its measure is higher than in the view before the edit, and allowed otherwise, partial repairs included.
  The rule keys are `<kind>.<field>.<option>`, naming the kind and the reference that declare the rule and the option broken.
  A `targets` breach is a referrer holding through the field targets that are absent and were absent before the edit, or present and of a kind the field may not target, measured by how many.
  An `onTargetDelete` breach is a referrer holding through a `"refuse"` field targets the edit deleted, measured by how many.
  An `exclusivity` breach is a target held through a `"refuse"` field by more than one referrer, measured by the number of its referrers less one.
  A `min` breach is a referrer holding through a field whose `onBelowMin` is `"refuse"` fewer targets than its minimum, measured by how many fewer.
- **R19. The subject.** The subject is the identity of the entity concerned: the referrer for `targets`, `onTargetDelete`, `min` and `holds`, and the target for `exclusivity`, which is the entity held more than once.
  It may be an entity the edit never named.
- **R20. A reference to an absent entity.** A requested reference to an id no entity holds after the edit breaks `targets`, since an absent entity is of no kind the reference may target.
  A target created anywhere in the same edit is present after it, whatever the order of the items.
- **R21. The item that led there.** `opIndex` is the index of the requested item whose write the breach follows from, through every consequence between; no case asks for a breach two items cause only together.
- **R22. Faults in the request.** A request fault is refused at the first item that faults, before any rule is judged, with the code as its `ruleKey` (`D10`'s proposed reading), the item's id as its `subject`, and a measure of 1.
  A `remove` of an absent entity is a change to it, and so a fault, as a `change` is; a `create` of an id an entity already holds is a fault, `entity-present` when that entity is of the same kind and `identity-taken` (`D14`) when of another.
  A reference held in a form its declaration cannot hold, such as a list in a one-target reference, is refused at the item, as `invalid-reference`, with the field's `holds` as its `ruleKey`.
- **R23. Planning changes no answer.** A plan, accepted or refused, leaves the view exactly as it was, including its position, as the `plan-graph-change` row says.
- **R24. Codes.** The contract names no code for a refusal of a plan, so the corpus's codes are labels a harness maps, one implementation code per label.

---

## Checking the files

The corpus author ran one check of form over the files, and no other code.\
It checks that each case parses as JSON, carries the keys above, is named for its file, and keeps ids unique across kinds.\
It checks that an accepted case starts with one `start` step, keeps positions strictly increasing, asks at the position of the last step before it, and writes each entity at most once per change.\
It checks that no answer repeats an element, every reading and label a case names is listed here, every file is plain ASCII under 16 KiB, and no case uses a drawing's words.\
For batch 2 it also checks that each `plan` step states the view's position, carries the keys of its outcome, and writes each entity at most once, and that the items of an accepted plan name only declared kinds and keep ids unique across kinds.\
Every expected answer was worked out by hand from the contract text, in both batches.
