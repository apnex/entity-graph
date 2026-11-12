/**
 * The scratch layer an edit is planned on (the build plan's `view` and `change-set` modules; docs/DECISIONS.md D15, D19): the
 * view as it stands, with the entities the edit touched laid over it, copy on write -- only what the edit touches is held here,
 * so a plan costs what it touches, not what the view holds. It is the one place a step reaches the plan: each is applied in
 * turn, its reversal read from the state just before it, and logged with the targets it made its entity stop and start
 * holding, so the rules read what changed rather than everything touched. The requested item each write follows from is kept
 * per reference, per target and per presence, so a breach names the item it follows from rather than the entity's last write.
 * The view is only read, so planning changes no answer.
 */
import type { CompiledDeclaration } from "./declaration.js";
import { samePlain } from "./plain-members.js";
import type { Referrer } from "./references.js";
import { deepFreeze, type EntityView, type GraphEntity, type GraphRecord, heldBy } from "./view.js";

/**
 * Who a write follows from (D19, D23): the requested item it follows from, the consequence that wrote it -- null for a requested
 * item or a reference rule -- and its place among the steps, so of two writes following from one item the later is told.
 */
export interface Attribution {
	readonly cause: number;
	readonly by: string | null;
	readonly seq: number;
}

/** The later of two attributions: by the item each follows from, then by step. */
export const later = (a: Attribution | undefined, b: Attribution | undefined): Attribution | undefined =>
	a === undefined ? b : b === undefined ? a : b.cause > a.cause || (b.cause === a.cause && b.seq > a.seq) ? b : a;

/** One write of a plan: an entity's whole state after it, or its deletion. */
export type GraphStep = { op: "put"; kind: string; id: string; record: GraphRecord } | { op: "del"; kind: string; id: string };

/** One applied step as the rules read it: the entity before and after it, and the targets it stopped and started holding, as [field, target]. */
export interface LoggedStep {
	readonly id: string;
	readonly was: GraphEntity | undefined;
	readonly now: GraphEntity | null;
	readonly lost: readonly (readonly [string, string])[];
	readonly gained: readonly (readonly [string, string])[];
}

const order = (a: Referrer, b: Referrer): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.field < b.field ? -1 : a.field > b.field ? 1 : 0);
const NONE: ReadonlyMap<string, readonly string[]> = new Map();
/** The key of one reference of one entity, and of one target it holds through it. */
export const fieldKey = (id: string, field: string): string => `${id}\u0000${field}`;
export const holdingKey = (id: string, field: string, target: string): string => `${id}\u0000${field}\u0000${target}`;

/** The entities a reader or a judge reads: the scratch layer as the edit has it, or the view as the edit found it. */
export interface GraphState {
	get(id: string): GraphEntity | undefined;
	allOf(kind: string): GraphEntity[];
	referrersOf(target: string): Referrer[];
	targetsOf(id: string): ReadonlyMap<string, readonly string[]>;
}

/** The view as a state, as the edit found it. */
export function viewState(view: EntityView): GraphState {
	return { get: (id) => view.get(id), allOf: (kind) => view.all(kind), referrersOf: (t) => view.index.referrersOf(t), targetsOf: (id) => view.index.targetsOf(id) };
}

/** One entity's change over the edit: as the edit found it and as it stands, and its top-level fields that differ, sorted. */
export interface GraphChangeRecord {
	readonly kind: string;
	readonly id: string;
	readonly before: GraphRecord | null;
	readonly after: GraphRecord | null;
	readonly fields: readonly string[];
}

export class Scratch implements GraphState {
	/** Identity -> the entity as the edit has it, or null where the edit deleted it. */
	private readonly laid = new Map<string, GraphEntity | null>();
	/** Target -> laid referrer -> the fields of it holding the target, for the entities laid here alone. */
	private readonly laidBack = new Map<string, Map<string, Set<string>>>();
	/** The steps applied, in order, and each step's reversal, in the same order. */
	readonly steps: GraphStep[] = [];
	private readonly undo: GraphStep[] = [];
	/** Every step applied, as the rules read it. */
	readonly log: LoggedStep[] = [];
	/** Each identity the edit touched, in the order first touched, by kind, and which a requested item or a consequence wrote. */
	readonly touched: string[] = [];
	private readonly seen = new Map<string, number>();
	private readonly byKind = new Map<string, string[]>();
	readonly kindsTouched: string[] = [];
	private readonly free = new Set<string>();
	/**
	 * The requested item each change follows from (D19): the identities the edit deleted, by the deletion; the presence of an
	 * entity, by the item that created or deleted it; a target held through a reference, by the item that made it held; and a
	 * reference, by the item that last left it holding fewer targets, its entity's creation included.
	 */
	readonly deleted = new Map<string, Attribution>();
	readonly presence = new Map<string, Attribution>();
	readonly heldSince = new Map<string, Attribution>();
	readonly shrunk = new Map<string, Attribution>();
	/** Each top-level field of an entity, by the last write that changed it; and each entity, by its last write. */
	readonly fieldCause = new Map<string, Attribution>();
	readonly lastWrite = new Map<string, Attribution>();
	/** The targets an `onUnreferenced: "delete"` reference stopped holding, with the item that led there. */
	readonly released = new Map<string, Attribution>();

	constructor(private readonly view: EntityView, private readonly declaration: CompiledDeclaration) {}

	/** The entity as the edit has it so far. */
	get(id: string): GraphEntity | undefined {
		return this.laid.has(id) ? (this.laid.get(id) ?? undefined) : this.view.get(id);
	}

	/** The entity as the edit found it. */
	before(id: string): GraphEntity | undefined {
		return this.view.get(id);
	}

	/** The targets each reference of an entity holds, as the edit has it, per field in declaration order. */
	targetsOf(id: string): ReadonlyMap<string, readonly string[]> {
		if (!this.laid.has(id)) return this.view.index.targetsOf(id);
		const entity = this.laid.get(id);
		return entity ? this.held(entity) : NONE;
	}

	/** The targets each reference of an entity held when the edit found it. */
	targetsBefore(id: string): ReadonlyMap<string, readonly string[]> {
		return this.view.index.targetsOf(id);
	}

	/** Whether an entity of `kind` held `target` through `field` when the edit found it. */
	heldBefore(id: string, kind: string, field: string, target: string): boolean {
		return this.before(id)?.kind === kind && (this.targetsBefore(id).get(field) ?? []).includes(target);
	}

	/** Every entity holding `target`, as the edit has it, in identity then field order. */
	referrersOf(target: string): Referrer[] {
		const out = this.view.index.referrersOf(target).filter((r) => !this.laid.has(r.id));
		for (const [id, fields] of this.laidBack.get(target) ?? new Map<string, Set<string>>()) {
			const kind = this.laid.get(id)?.kind;
			if (kind !== undefined) for (const field of fields) out.push({ kind, id, field });
		}
		return out.sort(order);
	}

	/** Every entity holding `target` when the edit found it. */
	referrersBefore(target: string): Referrer[] {
		return this.view.index.referrersOf(target);
	}

	/** The entities of a kind as the edit has them, in identity order. */
	allOf(kind: string): GraphEntity[] {
		const out = this.view.all(kind).filter((x) => !this.laid.has(x.id));
		for (const id of this.byKind.get(kind) ?? []) {
			const now = this.laid.get(id);
			if (now) out.push(now);
		}
		return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}

	/** Where an identity stands in the order the edit first touched each. */
	touchOrder(id: string): number {
		return this.seen.get(id) ?? Number.MAX_SAFE_INTEGER;
	}

	/** The identities of a kind the edit touched, in the order first touched. */
	touchedOf(kind: string): readonly string[] {
		return this.byKind.get(kind) ?? [];
	}

	/** An entity's change over the edit, or null where the edit left it as it found it, an entity created and deleted again included. */
	change(id: string): GraphChangeRecord | null {
		const was = this.view.get(id);
		const now = this.get(id);
		if (was === undefined && now === undefined) return null;
		const kind = (now ?? was)!.kind;
		const fields = was !== undefined && now !== undefined ? changedFields(was.record, now.record) : Object.keys((now ?? was)!.record).sort();
		if (was !== undefined && now !== undefined && fields.length === 0) return null;
		return { kind, id, before: was?.record ?? null, after: now?.record ?? null, fields };
	}

	/** The targets an entity's record holds, per reference field in declaration order; the record was checked when written. */
	held(entity: GraphEntity): Map<string, readonly string[]> {
		const out = new Map<string, readonly string[]>();
		for (const ref of this.declaration.kinds.get(entity.kind) ?? []) {
			const targets = heldBy(entity.record, ref) ?? [];
			if (targets.length > 0) out.set(ref.field, targets);
		}
		return out;
	}

	/**
	 * The entities the rules alone touched: each is a net write, since a rule only takes a reference or an entity away, so an
	 * entity no requested item or consequence wrote cannot return to the state the edit found it in (D19, D23).
	 */
	certainWrites(): number {
		return this.touched.length - this.free.size;
	}

	/**
	 * Applies one step, its reversal read from the state just before it: `cause` the requested item it follows from, `by` the
	 * consequence that wrote it or null, and `free` whether a requested item or a consequence wrote it rather than a rule.
	 */
	write(step: GraphStep, cause: number, by: string | null = null, free = false): void {
		const id = step.id;
		const at: Attribution = { cause, by, seq: this.steps.length };
		const was = this.get(id);
		this.undo.push(was === undefined ? { op: "del", kind: step.kind, id } : { op: "put", kind: was.kind, id, record: was.record });
		const before = was ? this.held(was) : NONE;
		this.unlay(id);
		const now = step.op === "put" ? Object.freeze({ kind: step.kind, id, record: deepFreeze(step.record) }) : null;
		this.laid.set(id, now);
		if (now !== null) this.lay(now);
		this.steps.push(step.op === "put" ? { op: "put", kind: step.kind, id, record: now!.record } : step);
		if (!this.seen.has(id)) {
			this.seen.set(id, this.touched.length);
			this.touched.push(id);
			if (!this.byKind.has(step.kind)) {
				this.byKind.set(step.kind, []);
				this.kindsTouched.push(step.kind);
			}
			this.byKind.get(step.kind)!.push(id);
		}
		if (free) this.free.add(id);
		this.lastWrite.set(id, at);
		const after = now ? this.held(now) : NONE;
		const created = now !== null && was?.kind !== now.kind;
		if (created || (now === null && was !== undefined)) this.presence.set(id, at);
		if (now === null && was !== undefined) this.deleted.set(id, at);
		if (now !== null) for (const field of created ? Object.keys(now.record) : changedFields(was!.record, now.record)) this.fieldCause.set(fieldKey(id, field), at);
		const lost: [string, string][] = [];
		const gained: [string, string][] = [];
		for (const ref of this.declaration.kinds.get(was?.kind ?? step.kind) ?? []) {
			const had = before.get(ref.field) ?? [];
			const has = created ? [] : (after.get(ref.field) ?? []);
			const kept = new Set(has);
			for (const target of had) {
				if (kept.has(target)) continue;
				lost.push([ref.field, target]);
				// a target an `onUnreferenced: "delete"` reference stopped holding is a candidate for deletion once nothing holds it
				if (ref.onUnreferenced === "delete") this.released.set(target, at);
			}
			if (!created && now !== null && has.length < had.length) this.shrunk.set(fieldKey(id, ref.field), at);
		}
		if (now !== null) {
			for (const ref of this.declaration.kinds.get(now.kind) ?? []) {
				const had = new Set(created ? [] : (before.get(ref.field) ?? []));
				for (const target of after.get(ref.field) ?? []) {
					if (had.has(target)) continue;
					gained.push([ref.field, target]);
					this.heldSince.set(holdingKey(id, ref.field, target), at);
				}
				if (created) this.shrunk.set(fieldKey(id, ref.field), at);
			}
		}
		this.log.push({ id, was, now, lost, gained });
	}

	private lay(entity: GraphEntity): void {
		for (const [field, targets] of this.held(entity)) {
			for (const target of targets) {
				let referrers = this.laidBack.get(target);
				if (referrers === undefined) this.laidBack.set(target, (referrers = new Map()));
				let via = referrers.get(entity.id);
				if (via === undefined) referrers.set(entity.id, (via = new Set()));
				via.add(field);
			}
		}
	}

	private unlay(id: string): void {
		const entity = this.laid.get(id);
		if (!entity) return;
		for (const targets of this.held(entity).values()) {
			for (const target of targets) {
				const referrers = this.laidBack.get(target);
				referrers?.delete(id);
				if (referrers?.size === 0) this.laidBack.delete(target);
			}
		}
	}

	/** The reversal of the steps, in the order that undoes them. */
	inverse(): GraphStep[] {
		return [...this.undo].reverse();
	}

	/**
	 * The net writes: for each entity touched, in the order first touched, its state after the edit where it differs from
	 * before -- records compared as plain data, whatever their depth or key order (D19).
	 */
	netWrites(): GraphStep[] {
		const out: GraphStep[] = [];
		for (const id of this.touched) {
			const was = this.view.get(id);
			const now = this.get(id);
			if (now === undefined) {
				if (was !== undefined) out.push({ op: "del", kind: was.kind, id });
				continue;
			}
			if (was !== undefined && was.kind === now.kind && samePlain(was.record, now.record)) continue;
			out.push({ op: "put", kind: now.kind, id, record: now.record });
		}
		return out;
	}
}

/** The top-level fields two records differ in, compared as plain data, sorted. */
export function changedFields(a: GraphRecord, b: GraphRecord): string[] {
	return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => Object.hasOwn(a, k) !== Object.hasOwn(b, k) || !samePlain(a[k], b[k])).sort();
}
