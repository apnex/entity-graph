# entity-graph - Vision

**Status: ratified by the director, 2026-11-07 (`docs/DECISIONS.md`, `D7`), restated under the rulings `D2` to `D6`; enduring.**\
This document states why `entity-graph` exists and what it will never be.\
It carries no current state, no roadmap, and no schedule.\
One section is point-in-time and says so: "Questions left open", the last, names the questions the director's rulings leave to the design effort, and everything above it is meant to endure.

Holding this document authorises nothing.\
It does not ratify a decision, admit a component to any registry, or approve a contract change.\
A change of direction is recorded as a decision first and absorbed here afterwards.

---

## North star

> Let an application declare once how its entities refer to one another and what must stay true of them, so it sees who refers to what as of a known position, and every edit, with all its consequences, lands whole or not at all and can be undone exactly.

Eight terms in that sentence carry weight, so this document defines them rather than leaving them to the reader.

**Declare once** means the application states in one place what each of its kinds refers to and what must stay true, as data wherever data can say it, and every part of the application that reads or edits its entities works from that one statement.\
No kind and no rule is built in.

**How its entities refer to one another** means which entities each entity points at, under the rules the application declares for each reference.\
An entity is a record the application keeps, of a kind it names.\
A reference rule says, for example, which kinds a reference may point to, how many targets it may hold, whether a target may belong to one referrer only, and what becomes of the referrer when its target is deleted.

**What must stay true of them** means those reference rules together with any condition the application states over its entities as a whole.\
An edit is judged by the state it would leave, never by the order of its steps, so an edit may pass through a state that would be wrong on its own and still be allowed.\
No edit may leave a rule more broken than it found it, and an edit that repairs part of what is broken is allowed.

**Who refers to what** means a reader can ask what an entity refers to, what refers to it, and what can be reached from it by following references, and asking changes nothing.

**As of a known position** means every answer says which position in the store's single order of changes it reflects, and is true of the entities as they stood at that position.\
An edit that has not landed never appears in an answer; what it would do is shown apart, stating the position it was planned from.

**With all its consequences** means every further change an edit implies, through a declared rule or through a consequence the application states for one of its kinds, and every change those imply in turn, is part of the same edit.\
An edit is any set of creations, changes and removals asked for together.\
A caller can see everything an edit would do, consequences included, before the edit is made.

**Lands whole or not at all** means every part of an edit, its consequences included, takes effect, or none of it does.\
A refused edit leaves every answer as it was, and says which rule it would break, where, and which part of the edit led there.

**Can be undone exactly** means an edit that has landed can be reversed by a later edit that restores every entity the first one changed, its consequences included, as it was before, identity included.\
An undo is an edit like any other, held to every commitment in this section; the consequences it carries are those of the edit it reverses, restored as they were recorded rather than worked out again (`D8`).\
This is the goal, and the last section names a question it leaves open.

---

## Why it exists

Applications keep entities that point at one another: links at the nodes they join, groups at their members, tasks at the tasks they wait on.\
A store that keeps each entity as its own record, with every change in one order, answers questions about one record well.\
It does not solve, on its own, the four problems that appear once records point at one another:

1. **Reverse lookups:** a record says what it refers to and never what refers to it, so asking what points at an entity means reading every record.
2. **Consequences:** deleting a node must also remove the links that join it and may leave a group too small to keep, and if those consequences land apart from the edit, a reader can find references that point at nothing.
3. **Rules in more than one place:** when a rule is written into each operation, or once for single edits and again for loading a whole set, or once for a preview and again for the commit, the copies drift, and the same edit is allowed in one place and refused in another.
4. **Undo:** an edit that took its consequences with it must be undone with them, or undo brings back a node without the links it lost.

An agent told only that an edit failed guesses at which consequence broke which rule.\
One told the rule, the entity, and the part of its edit that led there fixes it once.

`entity-graph` exists so an application states its rules once, and all four are answered from that one statement.

---

## What it is

An embeddable library, or several if the design splits it (`D5`), that keeps a view of the entities in a store and of the references among them.\
It sits over a store that gives every change one position in one order, or over a stream of that store's changes.\
The application supplies its kinds, the references and rules each kind declares, and any consequence of its own that the rules cannot express.

For that application it does three things: it answers who refers to what as of a known position, it plans each edit with all its consequences and lands it whole or refuses it, and it undoes an edit that has landed.

How the view is kept current, where it is kept, and how an edit's consequences and its undo are worked out are the design effort's to choose, and nothing here prefers one way over another (`D2`).\
Every way is judged by the same dimensions, under "What success means".

It is embedded by an application that owns its own process, configuration, and storage.

---

## What it is not

Every entry below holds whatever the design turns out to be.\
A proposal that crosses one is a change of direction, recorded as a decision before any design for it begins.

**Not the record.**\
The store beneath keeps every entity, gives every change its position, and holds the history, and `entity-graph` does none of these on its own account; whatever it keeps to answer or to undo is never the record.\
Whether it keeps a copy of its own view anywhere, to start faster or for any other reason, is the design effort's choice, so long as the copy says which position it reflects and the store governs wherever the two disagree.

**Not a judge of one entity's shape.**\
Whether one entity's own fields fit its kind is someone else's judgement.\
`entity-graph` judges what lies between entities: references, membership, and the conditions an application states over the whole.

**Not the owner of meaning.**\
It knows the references and rules each kind declares, never what a kind means.

**Not an authority.**\
It judges what an edit does, never who asked for it.\
Whether the asker may make the edit is decided by the application before it asks.

**Not a gate on other writers.**\
It judges the edits it is asked to plan, and cannot refuse a change that reaches the store by another path.\
Such a change is reflected as the store placed it, even where it breaks a rule.

**Not a query engine or a scheduler.**\
It answers who refers to what, and what can be reached by following references.\
It holds no query language, no pattern matching, and no ranking; a richer question is the application's to build from those answers.\
It schedules no work: where references record that one task waits on another, deciding what to do first is the application's.

**Not a notifier.**\
It never sends to anyone who has not asked.\
A caller that makes an edit, or hands it a change, may be told what that did; that is still a caller asking.

**Not a network service.**\
It listens on no network and sends over none.\
Carrying edits and changes between processes is someone else's job.

**Not the owner of geometry, layout, or drawing.**\
It knows nothing of where anything sits, how it is drawn, or how a user points at it.\
A rule that depends on them, for example whether two shapes overlap, is supplied by the application, and `entity-graph` applies it without understanding it.\
Choosing where anything sits belongs to the application or another component, never to `entity-graph`.

A proposal that answers one of the questions in the last section is neither in nor out here.\
It goes to the design effort, bounded by what that section says any answer must keep.

---

## What success means

Six dimensions.\
They are not weighted, and they do not collapse.

**Exactness.**\
Every answer is what a fresh reading of the store's entities at the position it reports would give, after any sequence of edits, undos, and changes taken in from the store.\
No refused edit changes any answer, and no answer ever reflects part of an edit.\
The measure is that answers checked against a fresh reading at the same position show no difference.

**Agreement.**\
The same edit, planned from the same state, gets the same result wherever it is planned: in a preview or a commit, alone or within a bulk load.\
The measure is that the same edits, planned from the same states along every path the application uses, show no case where two paths disagree.

**Reversibility.**\
Every edit that landed can be undone, and undoing it restores exactly what it changed.\
The measure is that an undo that lands leaves every entity its edit changed, its identity included, as it was before that edit.\
That is the goal; how identity survives undoing a deletion is the open question below.

**Legibility.**\
A refusal says which rule the edit would break, which entity it concerns, and which part of the requested edit led there, even when that entity is one the caller never named.\
The measure is that every refusal carries enough to act on.

**Leanness.**\
It is small to embed, and cheap per answer, per edit planned, and per change taken in.\
The measure is per-answer, per-edit and per-change cost, and code size, stated and small.

**Reuse.**\
A visual application and a non-visual one adopt it with kinds of their own, without a variant, a fork, or a branch in the core for their domain.\
At least one of them must be an application `entity-graph` was not designed around, because adoption by an application it was designed around shows only that the design fits the case it was drawn from.\
The measure is two such adoptions, with no change to the core made for either.

A programme strong on five of these and weak on one has one unmet dimension, and which one it is says more than any average of the six.

---

## Authority

Held by the director.\
Drafted by anyone; ratified only by the director.

This statement is amended, never quietly rewritten.\
A ruling that changes direction is recorded as a decision and absorbed here, so the reasoning survives the change.

Where this narrative and a verified record disagree about state, the record governs.\
Where an implementation does not serve what this document states, the defect is in the implementation, not here (`D4`).

---

## Questions left open

This section is point-in-time.\
It names, in one place, the questions the director's rulings leave to the design effort, and a question leaves it only when a recorded decision answers it.\
Every answer keeps every commitment above, and an answer that cannot is a change of direction, recorded as a decision first.

**One component, or several (`D5`).**\
This document holds one scope: a dated view of declared references between entities, planning edits against declared rules, and reversibility.\
The cross-project synthesis recorded in zorg (zorg's `D32` and `D35`) kept apart three candidates that cover it: a change planner, an entity view, and change undo.\
Whether `entity-graph` stays one component or splits along those lines is owed by the design effort, and calling it one library above does not decide the question.\
If it splits, the rules stay declared once, and this document is amended to say which component keeps which commitment.

**How an edit lands whole (`D3`).**\
That an edit lands whole or not at all, leaving every answer as it was when it does not, stays fixed.\
How a host achieves that is owed by the design effort, and this document commits `entity-store` (`C4`), or any other store, to nothing beyond what *What it is* asks of the store beneath; in particular, it does not require the store to take several writes as one change.

**How identity survives undo (`D6`).**\
That an edit can be undone exactly stays the goal.\
The `entity-store` definition (`C4`) forms each identity from the position of the change that created the entity, so recreating a deleted entity cannot restore its identity.\
How identity survives undo is owed by the design effort.

**How conflicting edits are resolved (`D6`).**\
Two edits planned from the same position may each be allowed alone and conflict together, and so may an edit and a change that lands while it is being planned, or an undo and a change that landed after the edit it reverses.\
How such conflicts are resolved, whether by refusing one, planning it again against the newer state, or combining the two, is owed by the design effort.\
Whatever the answer, what lands is an edit judged in full against a known state, landing whole or not at all, and no answer claims a position it does not reflect.
