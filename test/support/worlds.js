// worlds - neutral declarations the tests share: kinds of no application, references of each holding, a cycle.
//
// A library: a shelf holds books, a book stands on one shelf and carries tags.
// A project: a task waits on other tasks (a cycle is possible), a team gathers members.

const ref = (field, targets, holds, options = {}) => ({ field, targets, holds, onTargetDelete: "unlink", ...options });

/** The library and the project in one declaration. */
export const WORLD = {
	kinds: [
		{ kind: "shelf", references: [ref("books", ["book"], "many")] },
		{ kind: "book", references: [ref("shelf", ["shelf"], "one"), ref("tags", ["tag"], "many")] },
		{ kind: "tag" },
		{ kind: "task", references: [ref("waitsOn", ["task"], "many"), ref("team", ["team"], "one")] },
		{ kind: "team", references: [ref("members", ["member"], "many", { exclusivity: "steal", min: 2, onBelowMin: "refuse" })] },
		{ kind: "member" },
	],
};

/** Each kind's references, by kind, in declaration order. */
export const REFERENCES = Object.fromEntries(WORLD.kinds.map((k) => [k.kind, k.references ?? []]));

/** A put item: the whole state of an entity after the change. */
export const put = (kind, id, record = {}) => ({ kind, id, record });

/** A delete item. */
export const del = (kind, id) => ({ kind, id, deleted: true });
