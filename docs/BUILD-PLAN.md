# Build plan

How entity-graph is built: its modules, how its neutral corpus is made, its eight milestones, its dependencies and its risks.\
This is the plan for this component, approved by the director as draw's `H31-10` (2026-11-11, draw's `dev/DECISIONS.md`), and carried into this repository with M1 so that zorg reads it here (`D10`).\
It was written by draw's H31 planning agent, a read-only agent, on 2026-11-11, from the brief `drawv2-eval-runs/h26-builds/H31-EG-BUILD-PLAN.md`; every module, size, effort, order and risk below is that agent's judgement, approved as a whole.\
A reference to a file of draw's is draw's file, at draw's pin `8a8b743`, and names draw's mechanism only as the source a module's mechanism is taken from.

Read against, each pin from `git rev-parse` or `git log` [M]:
- entity-graph `1d94b9a` (`origin/main`): the merged contract, `D1` to `D9`, `src/index.ts` holding `export {};`, one test file, `engines >=24`, no `.github/`.
- shape-check `50d96cd` and entity-store `3681bec` (`origin/main`), each at `0.1.0`, their 0.2.0 additions designed and being built (draw's `dev/DECISIONS.md` H31-9).
- zorg's replies: `drawv2 upstream/drawv2-planning-boundaries-reply.md` and `drawv2-planning-contract-drafts-reply.md`.
- drawv2 `8a8b743`: its planner, model and engine are unchanged since `cf8825d`, where the line figures below were measured with draw's counter (`git diff --stat cf8825d 8a8b743` over `planner`, `model`, `engine`, `plugins` and the corpus is empty) [M].

Notation: `[M]` measured, `[I]` inferred; sizes of entity-graph's modules are TypeScript code lines and are all `[I]`.

---

## 1. In one paragraph

entity-graph will be a small library that any application embeds to keep its records honest about how they point at one another.\
The application declares its kinds once: what each record looks like, what it refers to, what happens when a referred-to record goes, what must stay true across records, and any side effects of its own.\
entity-graph then answers "who refers to this?" instantly and dated to a store position, works out everything an edit would do before it happens, lands the whole edit or none of it, refuses with facts an agent can act on, and undoes any landed edit exactly.\
It runs the same in a browser and on a server, and keeps its records in whatever store the application gives it, entity-store being the reference.\
For draw it becomes the engine under every write: about 680 of the 1,086 lines in draw's planner, model and index leave draw (draw's `upstream/drawv2-planning-position.md` section 4) [I], draw's rules become declarations on its kinds, and the mechanism is maintained once for draw, zorg and any later application.

---

## 2. The modules

Its anchored core: nine modules and one adapter, one duty each.\
"From draw" names the code each module's mechanism comes from (draw at `8a8b743`), with its measured code lines; "new" marks what draw does not have in general form.

| # | Module | Duty | Size [I] | From draw |
|---|---|---|---:|---|
| 1 | `declaration` | Check and compile the application's declaration once: kinds, shapes (handed to shape-check), reference fields and their rules, conditions, consequences with triggers as data and phases, intent resolvers; refuse a bad declaration at creation, naming it; build the index from kind to listening consequences | 250-350 | `model/shape.mjs:152-245` (91); `planner/txn.mjs:154-191` triggers (20), `:235-301` composition checks and dispatch index (47). New: reference fields declared field by field, the rule options, shape compilation through shape-check |
| 2 | `view` | Hold the entities by kind and name at a known position; a scratch layer for planning that copies only what an edit touches | 180-250 | `model/model.mjs:148-189` (31), `:34-38` projection (5); `model/ops.mjs:27-50` (20). New: the dated position, and a copy-on-write scratch layer in place of draw's whole-document copy |
| 3 | `references` | The reverse index: `referrersOf`, `targetsOf`, `ownerOf`, `reachable`, kept current from every write and every change taken in | 180-250 | `engine/ivm.mjs:19-48` (27); `engine/relations.mjs:41-51,54-97` (about 45); `engine/store.mjs:59-69` (12); `model/model.mjs:215-222` (8). New: `targetsOf`, `reachable` |
| 4 | `change-set` | What the edit has changed so far: each touched entity's before, after and changed fields, and what a deleted entity was absorbed into | 80-110 | `planner/txn.mjs:111-152` (31), `:93-109` the one place a write reaches the scratch layer (10) |
| 5 | `reference-rules` | Expand the declared rules to a fixed point: `onTargetDelete`, `exclusivity`, a minimum with `onBelowMin`, `onUnreferenced`, the number of targets | 250-350 | **New as a general engine.** Draw states these as code in its plugins: `plugins/groups/group-rules.mjs:31-69` (trim, steal), `plugins/network/network.mjs:124-129` (a cascade), `plugins/network/link-reactions.mjs:40-51` (a cascade), `:205-265` (orphan sweep) |
| 6 | `planner` | `plan(intent, { context })`: resolve each item, validate it, apply it, expand the rules, run the declared phases once each in order with the conflict fault, hold every consequence write to request rules, judge the result by key and measure, answer the writes and the reversal, or a refusal | 300-400 | `planner/txn.mjs:313-450` (`plan`), `:328-360` phases and the conflict fault (24), `:361-376` (13), `:403-421` consequence writes held (10), `:423-448` introduce-or-worsen (8), `:456-528` one item (place `:459-477`), `:58-72` narrowing (12); `model/invariants.mjs:40-58` (9) |
| 7 | `refusal` | `GraphRefusal` in the shared form, `{ part, code, what, why, fix, details }`, `details` holding `{ ruleKey, subject, measure, opIndex, sentence }`; fixed `what`, `why` and `fix` per code | 80-120 | **New**; the form and its fixed texts follow entity-store's `src/store-refusal.ts` |
| 8 | `history` | Record each write's reversal from the state just before it; undo and redo replay, judged; the bounded stack by count, bytes and a pinning predicate with hard limits; the undo record written to the store's note, an edit whose record exceeds the note's bound refused | 200-260 | `planner/txn.mjs:46-109` reversals (32), `:630-686` undo and redo (39); `planner/log.mjs` the bounded ring and its pin (80) |
| 9 | `sync` | The structural `GraphStorePort`; `commit` landing one change of net writes with the planned-from position as its expected position and the undo record as its note; `applyChange` taking in every change in position order; the first fill; an in-memory port for tests | 200-280 | `planner/txn.mjs:553-628` commit, `expect`, version (about 32). Mostly **new** |
| 10 | `./entity-store` adapter | The port over an entity-store store: net writes mapped onto `change`, names as identities, `expectedPosition`, `note`, `changes` | 120-180 | **New**; a subpath, as entity-store's `./file-storage`, taking the store as an argument and importing only its types |
| | **Total** | | **1,840-2,550** | |

**Two things the build settles that draw does differently [M from draw's corpus golden file].**
- In 275 of draw's 647 accepted cases the plan writes one entity more than once (a put, then its drawing order; a set, then a join).
  entity-store takes one write per entity in a change (zorg's reply, answer 1), so `plan` answers both the steps in the order applied, which draw's tabs and its corpus compare, and the net writes per entity, which the store lands; the reversal stays step by step.
- In 513 of the 647 the plan writes more than was asked, up to 14 times as many.
  So the 2,000-write limit binds on net writes after consequences, not on the request; an edit over it is refused, naming the bound, as an edit whose undo record exceeds the note is.

**This revises one earlier estimate.**\
Draw's analysis put entity-graph at 800-1,500 lines (`drawv2-planning-position.md` section 4) [I].\
With the general rule engine, the refusal record, the store port and its adapter, which draw does not have as general code, this plan puts it at about 1,840-2,550 [I].\
Draw's own lines leaving are unchanged; the vendored share at move 7 would be higher than the 28-30% then projected.

---

## 3. How the neutral corpus is made

**Who writes it.**\
An agent other than the implementer, in a separate session, preferably of another model family, as shape-check's corpus is written (its `SD6`).\
It reads only entity-graph's `CONTRACT.md`, `VISION.md` and `docs/DECISIONS.md`; not draw's code, not draw's corpus, and not the implementation.

**What it is written over.**\
Neutral kinds in three small worlds, each exercising different rules, none using any of draw's fourteen listed words (`drawv2 tools/scan-components.mjs:43`):
- a library: shelves, books, and tags deleted once no book carries them (`onUnreferenced: "delete"`);
- a project: tasks, the tasks they wait on, and teams of at least two members, a member taken from another team when added (`exclusivity: "steal"`, a minimum with `onBelowMin`);
- a document: sections, figures and captions, a caption going with its figure (`onTargetDelete: "cascade-delete"`), with one application phase and one whole-set condition of its own.

**What a case is.**\
Each world is a module of declarations, its consequences and conditions small pure functions, since those are code by contract.\
Each case is a JSON file: the world, the starting entities, the edit, any context, and the expected verdict, resulting entities, refusal facts (`code`, `ruleKey`, `subject`, `opIndex`), and what undo and redo must restore.\
Where the contract fixes an order (declared phases, declared order within a phase), the case states it; elsewhere it states the result, not the order of steps.

**What it covers.**\
Every term of the contract: each value of each reference option; chains and cycles of cascades; the stopping rule and the conflict fault; consequence writes held to request rules; the intent resolver against earlier items; the context; each refusal code; introduce-or-worsen and partial repair; faults at the item that faults; undo, redo, `undo(to)`, the stack's bounds and pin, the oversized undo record; the expected position refusing a stale edit; changes taken in from another writer; identity kept across undoing a deletion.\
About 150-250 cases [I], with a seeded generator of random edits over the three worlds checking four properties on every run: planning changes no answer, undo restores, every answer equals a fresh reading at its position (the vision's Exactness), and the same edit planned twice gets the same result (its Agreement).

**How it is held.**\
Written in three waves, each ahead of the milestones it gates (section 4).\
The implementer never edits a case; a case the implementer believes wrong goes back to its author, and any change to it, or to the contract it reads, is recorded as an entity-graph decision.\
It ships as `@apnex/entity-graph/corpus`, so any consumer can run it, as shape-check ships its corpus.

**How it relates to draw's 1,044 cases.**\
The neutral corpus proves the mechanism for any application; draw's cases prove draw's meaning on top of it.\
Draw's cases stay in draw's gate and never enter entity-graph, since they are written in draw's words.\
They are run against entity-graph early, from outside both repositories (section 6), and become draw's gate against every entity-graph release at move 7.

---

## 4. The milestones

Each lands something usable, and each is closed by a gate: the corpus wave it needs, the repository's own tests, and an independent check by an agent who neither wrote the code nor the cases, run on a clean clone before the milestone is called done.\
Effort is in agent-days of building, excluding review and ruling time [I].

| # | Milestone | Lands | Effort | Acceptance | Independent check |
|---|---|---|---:|---|---|
| M1 | **Scaffold, CI, the dated view and references** | A usable dated reverse index: declare kinds and references, take changes in from an in-memory port, answer `referrersOf`, `targetsOf`, `ownerOf`, `reachable` at a position | 4 | Corpus wave A's view cases; the Exactness property over random write streams; `gate.yml` on Node 22 and 24 green; `dated-graph-view` served and the other rows deferred in `export-map.json` | Clean-clone gate; the rows read against the code; five adversarial cases of the checker's own |
| M2 | **Planning with declared rules to a fixed point** | `plan` for plain edits and every reference rule, judged by key and measure, refusals in the shared form | 5 | Wave A's rule and refusal cases; planning changes no answer; cascade cycles end; refusal records exactly the contract's fields | As M1, plus a termination and purity review |
| M3 | **Application phases, the conflict fault, consequence writes held** | The hybrid with its stopping rule: phases once each in order, rules again after each, two writers of one entity a fault, every consequence write held to request rules | 3 | Wave B's phase, conflict and holding cases; the first run of draw's cases (section 6) | As M1, plus the stopping rule checked against zorg's three steps |
| M4 | **Intent resolver and edit context** | Items rewritten against the edit so far; `plan(intent, { context })`; `graph-declaration` and `plan-graph-change` served | 1.5 | Wave B's resolver and context cases | As M1 |
| M5 | **Undo and redo** | Reversals recorded; undo, redo and `undo(to)` replayed and judged; the bounded stack with its pin and hard limits; an edit whose undo record exceeds the note refused; `reversible-history` served | 3 | Wave C's history cases; undo restores across every generated edit; the record's bytes measured against the 512 KiB note | As M1, plus a check that no undo re-runs a consequence |
| M6 | **The store port and the entity-store adapter** | `commit` and `applyChange` over any port; the adapter over entity-store 0.2.0; stale edits refused by expected position; `positioned-graph-sync` served | 3.5 | Wave C's sync cases on the in-memory port and on entity-store; a two-writer test; a restart re-filling the view from the store | As M1, plus the adapter run against entity-store's own contract suite |
| M7 | **Draw's cases, measured** (outside both repositories) | A harness that runs all 1,044 cases against entity-graph and sorts them into exact, equivalent and different, each difference with its cause | 2.5 | A report after M3 and after M6: every case classified, every difference listed | A second agent re-runs the harness and samples twenty classified cases by hand |
| M8 | **Hardening and the first release** | `0.1.0` in the pinned-file form; costs per answer, per edit and per change, and memory per graph, measured and stated; mission-kit's C15 entry moved to `active` by its own pull request | 2 | Every row served and `deferred` empty; the release workflow's draft, download and compare; the consumer test installing with `--omit=dev` and importing every export | A full independent review of the contract against the release, as `W8` and `K21` describe |

**The corpus author's work, in parallel:** wave A (views, references, reference rules, refusals) before M1 ends; wave B (phases, holding, resolver, context) before M3; wave C (history, sync) before M5; about 4 agent-days in all [I].

**Decisions owed before the milestone that needs them**, each from the contract's *Design owed*, recorded as an entity-graph decision:
- M1: how the view is first filled, and what it does when the store no longer holds the position it needs; which way `reachable` follows and what a filter is; what `ownerOf` answers when two containers hold a member.
- M2: what removing the only target of a one-target reference leaves; whether `plan` answers steps, net writes, or both (section 2: draw's corpus needs both).
- M6: whether a change this component committed is taken in again from the stream; how a client reaching the store only through entity-api lands an edit (proposed: out of `0.1.0`, entity-api carrying `change` later, as its contract says).
- Out of scope for `0.1.0`: entity-api's deferred `dated-local-view` (mission-kit `B106`).

---

## 5. Dependencies

| Component | What entity-graph needs | When |
|---|---|---|
| shape-check | `judgeShapeValue` and `prepareShapeDocument` for kinds' shapes, `readPlainJson` for the context and the note; all in `0.1.0` | From M1, on `0.1.0` |
| shape-check `0.2.0` | Dialect 2 (`minimum`, `maximum`, `uniqueItems`), so a consumer's dialect 2 shapes are accepted; entity-graph hands shapes to shape-check and holds no dialect of its own | Pinned before M8; draw needs it at move 4 for its fields |
| entity-store `0.2.0` | The many-write `change`, `expectedPosition`, the `note` and its 512 KiB bound, the note carried on a change's first item | M6, for the adapter and its tests; M1 to M5 run on the in-memory port, so they do not wait |
| entity-store, at run time | Nothing: the adapter takes a store as an argument and imports only its types, so entity-store is a development dependency (the contract's *The store port*) | -- |

The shared fixes apply from the first commit: `engines >=22` and `.nvmrc` 22 (today `>=24`), shape-check as its release file, gate and release workflows from shape-check's, no AGP, and a check that no source imports a module particular to one runtime, since draw's page plans in the browser.\
The workflows were approved by zorg for when building begins (its contract-drafts reply, point 5).

---

## 6. Measuring draw's cases early

**How.**\
A harness in `drawv2-eval-runs`, outside draw's and entity-graph's repositories, since draw does not change before move 4's ruling (H31-9).\
It imports draw's corpus cases (`tests/fixtures/planner-corpus.mjs`, its `CASES` and golden file) and draw's rows read-only, and a local build of entity-graph.\
It declares draw's kinds to entity-graph:
- reference rules on draw's kinds that refer to others;
- the orphan rule with draw's own condition;
- draw's own consequences in its declared phases;
- draw's conditions;
- a resolver for placement and drawing order.
For each case it fills a graph with the case's board, plans the case's ops, and compares the answer with the golden result.

**When.**\
A first run after M3, judging verdicts, failing items and resulting boards.\
A full run after M6, adding undo and refusal facts rendered into draw's sentences.\
Each run gives a count per class and a list of every difference.

**What "passes" means**, as zorg agreed (its planning reply; entity-graph's *Acceptance*):
- **exact**: the same steps, reversal, error and `opIndex` as the golden file;
- **equivalent**: the same verdict and `opIndex`, the same resulting board compared without collection order, undo restoring it, and the same rule key and subject;
- **different**: anything else, listed by case with both results and its cause, and ruled by the director before draw's golden file is frozen again (`drawv2 tests/planner-corpus.test.js:6-7`).

**What to expect [I].**\
Order of steps moves where reference rules replace draw's per-item phases (equivalent, not exact).\
Some refusals become acceptances where references are judged on the result rather than per item (different, ruled).\
Draw's consequences that read an entity just before it is deleted read it from the change set's before-state instead; any that cannot is a contract question raised at once, not bent in the harness.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| The hybrid answers differently from draw's per-item `clear` and `follow` phases (`planner/txn.mjs:361-369`) | Draw's cases measured from M3, not at move 7; each difference classified and ruled; a consequence that truly needs per-item timing raised as a contract question |
| A consequence-heavy edit exceeds entity-store's 2,000 writes or the 512 KiB note | Refused by entity-graph, naming the bound, so it never lands half-undoable; the harness counts how often draw's cases come near either |
| Built around draw, failing the vision's Reuse test (`VISION.md:157-159`) | The neutral corpus by another agent; a word check over `src/` and the corpus for draw's fourteen words in entity-graph's own gate, as the four components draw extracted carry; zorg's `BL33` as the second adoption |
| Cost: draw's planner copies the whole document per plan (`model/model.mjs:34-38`), and draw's server would now hold indices for up to 500 of its documents | A copy-on-write scratch layer; costs and memory per graph measured at M2 and M8 and stated, as the vision's Leanness asks |
| Identity: entity-store forms ids from positions, so recreating a deleted entity changes its id | Entities named by the application, used as entity-store names, as the contract's *Identity across undo* states; an application without names is out of `0.1.0` |
| The corpus author and the implementer read the contract differently | Every disagreement settled by a recorded entity-graph decision, never by editing a case quietly |
| entity-store `0.2.0` slips | M1 to M5 need only the in-memory port; M6 moves, not the rest |
| Draw tabs and the corpus compare steps, the store takes net writes | `plan` answers both (decision owed at M2) |
| Rulings queue on one director | One ruling for this plan; the decisions owed above taken by the builders as entity-graph decisions, reported, unless one changes the contract |

---

## 8. Total effort, order, and the first step

| Who | Agent-days [I] |
|---|---:|
| The implementer, M1 to M8 | 24.5 (range 20-29) |
| The corpus author, three waves | 4 |
| Independent checks, about half a day per milestone | 4 |
| **Total** | **about 32 (range 27-38)** |

**Order.**
- M1, M2, M3 and M4 in sequence, with the corpus waves ahead of them.
- M5 and M6 next. M6 waits only on entity-store `0.2.0`, which is being built now.
- M7 runs after M3 and again after M6.
- M8 last.
- If the director wants zorg's `BL33` able to adopt earlier, a `0.1.0` can be cut after M2, with the rows still to come deferred. This plan does not assume it.

**The first milestone to start on the director's ruling:** M1, the scaffold, CI, the dated view and references, with the corpus author starting wave A beside it.
It needs nothing still being built, and it lands a dated reverse index that both draw's relations index and zorg's lookups could use.
