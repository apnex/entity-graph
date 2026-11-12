# entity-graph

Let an application declare once how its entities refer to one another and what must stay true of them, so it sees who refers to what as of a known position, and every edit, with all its consequences, lands whole or not at all and can be undone exactly.

**Status: `0.1.0`, the first release, every row served (`D10`, `D15`, `D20`, `D26`, `D32`, `D40`, `D44`).**\
A graph made from a declaration of kinds and their references takes in each change in position order, whole or not at all, and answers who refers to what, what an entity refers to, which containers hold a member, and what can be reached, each answer stating the position it reflects.\
It plans an edit, with an optional context and each item first rewritten by its kind's intent resolver, with every declared reference rule to a fixed point and the application's consequences in its declared phases, under one stopping rule, judged on the state it would leave by the reference rules, the kinds' shapes and the conditions over the whole set, and answers the steps, their reversal and the net writes, or refuses naming the rule, the entity and the item that led there.\
Over a store port it commits an edit as one positioned change carrying its undo record, and undoes and redoes landed edits by replaying their records, judged as any edit is, within the bounds the application states for its history.\
It fills its view from the store and takes in the store's changes in position order, reads its history back from the store's notes after a restart, and lands over entity-store through the `./entity-store` adapter.

It belongs to the component set composed by zorg (`apnex/zorg`, `BL33`) and drawv2 (`apnex/drawv2`), and is released only by its own CI, as a tarball attached to a GitHub release with its SHA-512 beside it, which a consumer names in its `package.json`: `https://github.com/apnex/entity-graph/releases/download/v0.1.0/apnex-entity-graph-0.1.0.tgz` for `0.1.0`.

---

## Use

A graph over a store port, here the in-memory one, with a book that goes with its shelf:
```js
import { createEntityGraph, createMemoryGraphPort } from "@apnex/entity-graph";

const declaration = {
	kinds: [
		{ kind: "shelf" },
		{ kind: "book", references: [{ field: "shelf", targets: ["shelf"], holds: "one", onTargetDelete: "cascade-delete" }] },
	],
};
const { graph } = createEntityGraph(declaration, undefined, { port: createMemoryGraphPort(), writer: "librarian" });

graph.commit({ items: [{ op: "create", kind: "shelf", id: "s1", record: {} }, { op: "create", kind: "book", id: "b1", record: { shelf: "s1" } }] });
graph.referrersOf("s1"); // { ok: true, position: 1, referrers: [{ kind: "book", id: "b1", field: "shelf" }] }
graph.commit({ items: [{ op: "remove", kind: "shelf", id: "s1" }] }); // lands two deletes, the shelf and its book
graph.undo(); // lands both again, at position 3
```

Over entity-store, an opened store is passed to the adapter, which imports nothing of entity-store at run time:
```js
import { createEntityStorePort } from "@apnex/entity-graph/entity-store";

const port = createEntityStorePort(store, { writer: "librarian" });
```

The neutral corpus ships as `@apnex/entity-graph/corpus`, its world module as `@apnex/entity-graph/corpus/worlds/document`, so a consumer can run it against its own use (`corpus/README.md`).

---

## Costs

Measured by `tools/measure-costs.mjs` on Node 22, medians in milliseconds; the method and every row are in `docs/DECISIONS.md` `D44`.\
An answer about one entity, and an edit, cost what they touch, not what the graph holds, and a list costs what it lists:

| Cost | 1,000 entities | 10,000 entities | 100,000 entities |
|---|---:|---:|---:|
| get | 0.0011 | 0.0009 | 0.0011 |
| referrersOf a box (about 100 referrers) | 0.046 | 0.044 | 0.075 |
| all items | 0.108 | 1.0 | 20 |
| plan 100 creations | 1.9 | 1.6 | 1.7 |
| plan 1,000 creations | 10 | 10 | 12 |
| applyChange of 100 writes | 0.773 | 0.622 | 0.920 |
| undo 100 creations | 3.1 | 3.2 | 3.2 |
| memory per graph | 1.1 MB (1137 B per entity) | 9.7 MB (1022 B per entity) | 95.0 MB (996 B per entity) |

Its code builds to 150,458 bytes of JavaScript, 36,262 compressed, and its packed file, the corpus included, is 151,695 bytes.

---

## Documents

- `VISION.md` - why it exists, and what it will never be.
- `CONTRACT.md` - what a consumer can depend on, one capability per row.
- `docs/DECISIONS.md` - the rulings about this component.
- `docs/BUILD-PLAN.md` - how it is built, milestone by milestone.
- `corpus/` - the neutral corpus, written from the contract by an agent other than the implementer; every case runs in the gate.

To run the tests from a clean checkout:
```sh
npm ci
npm test
```
