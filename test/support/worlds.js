// worlds - neutral declarations the tests share: kinds of no application, references of each holding, a cycle.
//
// A library: a shelf holds books, a book stands on one shelf and carries tags.
// A project: a task waits on other tasks (a cycle is possible), a team gathers members.

/** The library and the project in one declaration. */
export const WORLD = {
	kinds: {
		shelf: { references: { books: { targets: ["book"], holds: "many" } } },
		book: { references: { shelf: { targets: ["shelf"], holds: "one" }, tags: { targets: ["tag"], holds: "many" } } },
		tag: {},
		task: { references: { waitsOn: { targets: ["task"], holds: "many" }, team: { targets: ["team"], holds: "one" } } },
		team: { references: { members: { targets: ["member"], holds: "many", exclusivity: "steal", min: 2, onBelowMin: "refuse" } } },
		member: {},
	},
};

/** A record holding the given fields. */
export const rec = (fields = {}) => fields;

/** A put item: the whole state of an entity after the change. */
export const put = (kind, id, record = {}) => ({ kind, id, record });

/** A delete item. */
export const del = (kind, id) => ({ kind, id, deleted: true });
