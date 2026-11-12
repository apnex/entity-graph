/**
 * The refusal record (CONTRACT.md, *Judging and refusals*): the shared refusal form, `{ part, code, what, why, fix, details }`,
 * with `part: "entity-graph"` and `details` carrying `{ ruleKey, subject, measure, opIndex, sentence }`. Each code has one fixed
 * `what`, `why` and `fix`; the facts of the case are in `details`, and the words a person or an agent finally reads are the
 * application's to choose from them.
 */

/** The codes refused with (docs/DECISIONS.md D10, D15): a declaration, an opening, a change taken in, an edit planned, or a question. */
export type GraphRefusalCode =
	| "invalid-declaration"
	| "invalid-opening"
	| "invalid-change"
	| "invalid-edit"
	| "empty-edit"
	| "unknown-operation"
	| "rule-broken"
	| "shape-misfit"
	| "condition-broken"
	| "condition-failed"
	| "consequence-failed"
	| "consequence-conflict"
	| "resolver-failed"
	| "invalid-context"
	| "reentrant"
	| "too-many-writes"
	| "too-many-steps"
	| "store-moved"
	| "note-bound"
	| "nothing-to-undo"
	| "nothing-to-redo"
	| "undo-target-unknown"
	| "history-superseded"
	| "history-unreadable"
	| "store-failed"
	| "no-store"
	| "invalid-options"
	| "stale-position"
	| "empty-change"
	| "too-many-items"
	| "undeclared-kind"
	| "duplicate-item"
	| "identity-taken"
	| "entity-absent"
	| "entity-present"
	| "not-plain"
	| "invalid-reference"
	| "invalid-query";

/** The facts a refusal carries: the stable key of what was broken, what it concerns, how much, where in the request, and an application's sentence. */
export interface GraphRefusalDetails {
	ruleKey: string;
	subject: string;
	measure: number;
	opIndex: number;
	sentence: string | null;
	/**
	 * The consequences and reference rules behind a refusal (CONTRACT.md *Judging and refusals*; docs/DECISIONS.md D23, D25, D30,
	 * accepted by zorg): the two consequences of a `consequence-conflict`; the consequence `<kind>.<id>` or rule
	 * `<kind>.<field>.<option>` whose write a reference-rule or shape breach follows from; for a condition's breach, those that
	 * wrote its subject, sorted, consequences first, each in declared order. Omitted where a requested item alone wrote the entity.
	 */
	writers?: readonly string[];
}

/** A refusal in the shared form. */
export interface GraphRefusal {
	part: "entity-graph";
	code: GraphRefusalCode;
	what: string;
	why: string;
	fix: string;
	details: GraphRefusalDetails;
}

const TEXTS: Readonly<Record<GraphRefusalCode, { what: string; why: string; fix: string }>> = {
	"invalid-declaration": {
		what: "The declaration was refused.",
		why: "The kinds are declared as plain data in a list, each reference naming its field, the declared kinds it may target, how many targets it holds and what a target's deletion does, each option one the contract allows.",
		fix: "Correct the member named in details.subject and create the graph again.",
	},
	"invalid-opening": {
		what: "The graph was not opened: its opening is not one the component can read.",
		why: "An opening is plain data stating the position its entities reflect, a whole number from 0, and those entities, each a kind, an identity and a whole record.",
		fix: "Send the opening in that form, or none to open an empty graph at position 0; details.subject names the part that is not.",
	},
	"invalid-change": {
		what: "The change was refused: it is not a change the component can read.",
		why: "A change is plain data stating a whole-number position from 0 and a list of items, each an entity's kind and identity with its whole record, or with `deleted: true`.",
		fix: "Send the change in that form; details.subject names the part that is not.",
	},
	"stale-position": {
		what: "The change was refused: its position is not after the view's.",
		why: "Changes are taken in in position order, so every answer stays true at the position it states.",
		fix: "Take in only the changes after the view's position, in order.",
	},
	"empty-change": {
		what: "The change was refused: it holds no item.",
		why: "A change taken in is one or more writes that landed together.",
		fix: "Send a change holding at least one item.",
	},
	"too-many-items": {
		what: "Refused: the change or the edit holds more items than one may.",
		why: "A change taken in, and an edit planned, each hold at most 2,000 items, the bound the store beneath places on one change.",
		fix: "Split the change or the edit, or check where it came from.",
	},
	"invalid-edit": {
		what: "The edit was refused: it is not an edit the component can read.",
		why: "An edit is plain data holding a list of items, each an operation - create with a whole record, change to a whole record, set with named fields, or remove - and an entity's kind and identity.",
		fix: "Send the edit in that form; details.subject names the part that is not.",
	},
	"empty-edit": {
		what: "The edit was refused: it holds no item.",
		why: "An edit is one or more creations, changes and removals asked for together.",
		fix: "Send an edit holding at least one item.",
	},
	"unknown-operation": {
		what: "The edit was refused: an item names no known operation.",
		why: "An item's operation is create, change, set or remove.",
		fix: "Name one of them in the item at details.opIndex.",
	},
	"rule-broken": {
		what: "The edit was refused: it would leave a declared rule more broken than it found it.",
		why: "An edit is judged on the state it would leave, each breach of a rule by its key and measure; one it introduces, or whose measure it raises, refuses it.",
		fix: "Change the edit so the rule in details.ruleKey holds for the entity in details.subject, or holds no worse than before; details.opIndex names the requested item that led there.",
	},
	"shape-misfit": {
		what: "The edit was refused: a record it writes does not fit its kind's shape.",
		why: "A kind's records are judged against the shape it declares, through shape-check: a requested write that misfits is refused at its item, and an entity a consequence or a rule wrote that misfits when the edit found it fitting refuses the edit.",
		fix: "Change the edit, or the consequence in details.writers, so the record of the entity in details.subject fits its kind's shape.",
	},
	"condition-broken": {
		what: "The edit was refused: it would leave one of the application's conditions more broken than it found it.",
		why: "A condition over the whole set is judged on the state the edit would leave, each breach by its subject and measure; one the edit introduces, or whose measure it raises, refuses it.",
		fix: "Change the edit so the condition in details.ruleKey holds for details.subject, or holds no worse than before; details.sentence is the condition's own account.",
	},
	"condition-failed": {
		what: "The edit was refused: one of the application's conditions did not answer.",
		why: "A condition answers a list of breaches, each a subject, a measure above nothing and a sentence, as plain data; one that throws, answers otherwise, or reaches for what it was handed, cannot be judged.",
		fix: "Correct the condition in details.ruleKey.",
	},
	"consequence-failed": {
		what: "The edit was refused: one of the application's consequences did not answer.",
		why: "A consequence answers a list of writes as plain data; one that throws, answers otherwise, or reaches for what it was handed, cannot be applied.",
		fix: "Correct the consequence in details.ruleKey; details.subject is the entity whose change it heard.",
	},
	"consequence-conflict": {
		what: "The edit was refused: two consequences wrote one entity in one run of a phase.",
		why: "Within a run of a phase each entity is written by one consequence at most, and two writing it is a fault, never resolved by letting one win.",
		fix: "Change the consequences in details.writers so one of them writes the entity in details.subject, or move one to another phase.",
	},
	"resolver-failed": {
		what: "The edit was refused: a kind's intent resolver did not answer.",
		why: "An intent resolver answers the writes one requested item stands for, as a plain list; one that throws, answers otherwise, or reaches for what it was handed, cannot be applied.",
		fix: "Correct the resolver in details.ruleKey; details.opIndex is the item it was handed.",
	},
	"invalid-context": {
		what: "The edit was refused: its context is not plain JSON.",
		why: "A plan's context is read once as plain JSON before any item, running none of its code, and handed as it is to consequences, conditions and resolvers.",
		fix: "Send a context of plain JSON values - objects, lists, strings, finite numbers, booleans and null - without functions, cycles or class instances.",
	},
	"too-many-steps": {
		what: "The edit was refused: planning it took more steps than a plan may.",
		why: "A plan takes at most 20,000 steps - each a write of one entity, requested or consequence - so an expansion is refused before it costs more than its undo record could hold.",
		fix: "Split the edit into smaller edits; details.measure is the step at which planning stopped.",
	},
	"store-moved": {
		what: "Refused: the store has moved since the position this was planned from.",
		why: "A change lands with the position it was planned from as its expected position, which covers every entity, read or written; a store that has moved refuses it, and the answers stay as they were.",
		fix: "Take the store's changes in, then commit, undo or redo again.",
	},
	"note-bound": {
		what: "Refused: its undo record would not fit the store's bound on a note.",
		why: "A change carries its undo record in its note, so every change that lands can be undone, and the store bounds a note; details.measure is the record's size in bytes of canonical UTF-8 JSON.",
		fix: "Split the edit into smaller edits.",
	},
	"nothing-to-undo": {
		what: "Refused: the history holds no landed edit not yet undone.",
		why: "An undo replays the reversal of an edit the history holds; an edit undone already, evicted, or never landed by this graph is not held.",
		fix: "Nothing to do; or commit an edit first.",
	},
	"nothing-to-redo": {
		what: "Refused: the history holds no undone edit.",
		why: "A redo replays an edit an undo reversed; an edit committed after the undo discards what was undone.",
		fix: "Nothing to do.",
	},
	"undo-target-unknown": {
		what: "Refused: the undo names no landed edit the history holds and has not undone.",
		why: "An undo down to an edit names the position where that edit landed, and the history must hold it, not yet undone.",
		fix: "Name the position of an edit the history holds; history() lists them.",
	},
	"history-superseded": {
		what: "Refused: an entity the undo or redo would write no longer stands as the edit left it.",
		why: "A reversal is applied only to the state it was recorded against; a change since, by another writer, to an entity it writes would be overwritten.",
		fix: "Edit the entity in details.subject as it now stands instead.",
	},
	"history-unreadable": {
		what: "Refused: the undo record of an edit could not be read back from the store.",
		why: "An edit's undo record is kept in the note on the change that landed it, and is read back from the store to undo or redo it.",
		fix: "Check the store's change at details.subject, whose note is not an undo record this component wrote.",
	},
	"store-failed": {
		what: "Refused: the store port answered what it may not.",
		why: "A store port answers each call synchronously in plain data: a change landed at a position after the one expected, or refused with the store's position; or the changes after a position, in order.",
		fix: "Correct the store port; details.subject names the call.",
	},
	"no-store": {
		what: "Refused: the graph has no store port to land an edit through.",
		why: "A commit, an undo and a redo land as positioned changes in the store beneath, through the port the graph was made with.",
		fix: "Make the graph with a store port in its options.",
	},
	"invalid-options": {
		what: "The graph's options were refused: they are not options the component can read.",
		why: "A graph's options name a store port, an object answering noteBound, position(), change() and changes(), and the history's bounds: count, bytes, hardCount and hardBytes, whole numbers from 1 with each hard limit at least its bound, and pin, a function.",
		fix: "Send the options in that form; details.subject names the part that is not.",
	},
	"reentrant": {
		what: "Refused: the graph was asked to change or plan while it was planning.",
		why: "A consequence or condition is called while the graph plans, and may read what it is handed but may not change the view or start another plan.",
		fix: "Return writes from the consequence instead, and take a change in once the plan has answered; details.subject names the call refused.",
	},
	"too-many-writes": {
		what: "The edit was refused: what it would write, with everything the rules make of it, is more than one change may hold.",
		why: "A plan's net writes, one per entity it changes, are at most 2,000 after the rules, the bound the store beneath places on one change.",
		fix: "Split the edit into smaller edits; details.measure is how many net writes it would make, or, where planning stopped at the bound, how many were already certain.",
	},
	"undeclared-kind": {
		what: "Refused: an item names a kind the declaration does not.",
		why: "The component answers only for the kinds it was declared with, so an entity of another kind cannot be held.",
		fix: "Declare the kind, or keep its entities out of the changes this graph takes in.",
	},
	"duplicate-item": {
		what: "Refused: two items name one entity.",
		why: "A change writes each entity once.",
		fix: "Send one item per entity, holding its state after the change.",
	},
	"identity-taken": {
		what: "Refused: an item's identity is held by an entity of another kind.",
		why: "An identity names one entity across every kind of the graph, since references hold identities alone.",
		fix: "Give the entity an identity no entity of another kind holds.",
	},
	"entity-absent": {
		what: "Refused: an item deletes or changes an entity absent at that point.",
		why: "A deletion, or a change, names an entity of that kind that exists at that point in the change or the edit.",
		fix: "Check the kind and identity of the item at details.opIndex, and the items before it.",
	},
	"entity-present": {
		what: "The edit was refused: an item creates an entity present at that point.",
		why: "A creation names an entity absent at that point in the edit; a present one is changed, not created.",
		fix: "Change the entity instead, or create one of another identity.",
	},
	"not-plain": {
		what: "Refused: an item, or its record, is not plain JSON.",
		why: "A change or an edit is read as plain JSON, running none of its code, and an entity's record is an object of named fields.",
		fix: "Send each item, and each record, as plain JSON; details.opIndex names the first that is not.",
	},
	"invalid-reference": {
		what: "Refused: an item holds a reference in a form its declaration does not allow.",
		why: "A reference holding one target holds an identity or null, and one holding many holds a list of distinct identities.",
		fix: "Hold the reference named in details.subject as its declaration says.",
	},
	"invalid-query": {
		what: "The question was refused.",
		why: "A question names identities as strings, and kinds and reference fields the declaration holds.",
		fix: "Ask about the kinds and fields the graph was declared with; details.subject names the part that is not one.",
	},
};

/** A refusal of `code`, concerning `subject`, at `opIndex` (`-1` for the request as a whole). */
export function refuse(code: GraphRefusalCode, subject: string, opIndex = -1): GraphRefusal {
	const text = TEXTS[code];
	return { part: "entity-graph", code, what: text.what, why: text.why, fix: text.fix, details: { ruleKey: code, subject, measure: 1, opIndex, sentence: null } };
}
