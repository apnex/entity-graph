# entity-graph

Let an application declare once how its entities refer to one another and what must stay true of them, so it sees who refers to what as of a known position, and every edit, with all its consequences, lands whole or not at all and can be undone exactly.

**Status: M6 of eight built, every row served, unreleased (`D10`, `D15`, `D20`, `D26`, `D32`, `D40`).**\
A graph made from a declaration of kinds and their references takes in each change in position order, whole or not at all, and answers who refers to what, what an entity refers to, which containers hold a member, and what can be reached, each answer stating the position it reflects.\
It plans an edit, with an optional context and each item first rewritten by its kind's intent resolver, with every declared reference rule to a fixed point and the application's consequences in its declared phases, under one stopping rule, judged on the state it would leave by the reference rules, the kinds' shapes and the conditions over the whole set, and answers the steps, their reversal and the net writes, or refuses naming the rule, the entity and the item that led there.\
Over a store port it commits an edit as one positioned change carrying its undo record, and undoes and redoes landed edits by replaying their records, judged as any edit is, within the bounds the application states for its history.\
It fills its view from the store and takes in the store's changes in position order, reads its history back from the store's notes after a restart, and lands over entity-store through the `./entity-store` adapter.\
The first release comes in the last milestone (`docs/BUILD-PLAN.md`).

- `VISION.md` - why it exists, and what it will never be.
- `CONTRACT.md` - what a consumer can depend on, one capability per row.
- `docs/DECISIONS.md` - the rulings about this component.
- `docs/BUILD-PLAN.md` - how it is built, milestone by milestone.
- `corpus/` - the neutral corpus, written from the contract by an agent other than the implementer; every case runs in the gate.

It belongs to the component set composed by zorg (`apnex/zorg`, `BL33`) and drawv2 (`apnex/drawv2`).
