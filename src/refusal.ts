/**
 * The refusal record (CONTRACT.md, *Judging and refusals*): the shared refusal form, `{ part, code, what, why, fix, details }`,
 * with `part: "entity-graph"` and `details` carrying `{ ruleKey, subject, measure, opIndex, sentence }`. Each code has one fixed
 * `what`, `why` and `fix`; the facts of the case are in `details`, and the words a person or an agent finally reads are the
 * application's to choose from them.
 */

/** The codes M1 refuses with (docs/DECISIONS.md D10): a declaration, an opening, a change taken in, or a question. */
export type GraphRefusalCode =
	| "invalid-declaration"
	| "invalid-opening"
	| "invalid-change"
	| "stale-position"
	| "empty-change"
	| "too-many-items"
	| "undeclared-kind"
	| "duplicate-item"
	| "identity-taken"
	| "not-found"
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
		what: "The change was refused: it holds more items than a change may.",
		why: "A change holds at most GRAPH_LIMITS.maxChangeItems items, the bound the store beneath places on one change.",
		fix: "Split the change, or check where it came from.",
	},
	"undeclared-kind": {
		what: "The change was refused: an item names a kind the declaration does not.",
		why: "The component answers only for the kinds it was declared with, so an entity of another kind cannot be held.",
		fix: "Declare the kind, or keep its entities out of the changes this graph takes in.",
	},
	"duplicate-item": {
		what: "The change was refused: two items name one entity.",
		why: "A change writes each entity once.",
		fix: "Send one item per entity, holding its state after the change.",
	},
	"identity-taken": {
		what: "The change was refused: an item's identity is held by an entity of another kind.",
		why: "An identity names one entity across every kind of the graph, since references hold identities alone.",
		fix: "Give the entity an identity no entity of another kind holds.",
	},
	"not-found": {
		what: "The change was refused: an item deletes an entity the view does not hold.",
		why: "A deletion names an entity that exists at the change's position.",
		fix: "Check the kind and identity of the deletion, and that no change before it was missed.",
	},
	"not-plain": {
		what: "The change was refused: an item, or its record, is not plain JSON.",
		why: "A change is read as plain JSON, running none of its code, and an entity's record is an object of named fields.",
		fix: "Send each item, and each record, as plain JSON; details.opIndex names the first that is not.",
	},
	"invalid-reference": {
		what: "The change was refused: an item holds a reference in a form its declaration does not allow.",
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
