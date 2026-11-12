# entity-graph

Let an application declare once how its entities refer to one another and what must stay true of them, so it sees who refers to what as of a known position, and every edit, with all its consequences, lands whole or not at all and can be undone exactly.

**Status: M3 of eight built, unreleased (`D10`, `D15`, `D20`).**\
A graph made from a declaration of kinds and their references takes in each change in position order, whole or not at all, and answers who refers to what, what an entity refers to, which containers hold a member, and what can be reached, each answer stating the position it reflects.\
It plans an edit with every declared reference rule to a fixed point and the application's consequences in its declared phases, under one stopping rule, judged on the state it would leave by the reference rules, the kinds' shapes and the conditions over the whole set, and answers the steps, their reversal and the net writes, or refuses naming the rule, the entity and the item that led there.\
Intent resolvers and the edit context, undo and the store port come in later milestones (`docs/BUILD-PLAN.md`).

- `VISION.md` - why it exists, and what it will never be.
- `CONTRACT.md` - what a consumer can depend on, one capability per row.
- `docs/DECISIONS.md` - the rulings about this component.
- `docs/BUILD-PLAN.md` - how it is built, milestone by milestone.
- `corpus/` - the neutral corpus, written from the contract by an agent other than the implementer; every case runs in the gate.

It belongs to the component set composed by zorg (`apnex/zorg`, `BL33`) and drawv2 (`apnex/drawv2`).
