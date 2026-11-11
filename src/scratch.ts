/**
 * The scratch layer an edit is planned on (the build plan's `view` and `change-set` modules; docs/DECISIONS.md D15): the view
 * as it stands, with the entities the edit touched laid over it, copy on write -- only what the edit touches is held here, so a
 * plan costs what it touches, not what the view holds. It is the one place a step reaches the plan: each is applied in turn,
 * its reversal read from the state just before it, and the requested item that led to it kept with the entity it wrote.
 * The view is only read, so planning changes no answer.
 */
import type { CompiledDeclaration } from "./declaration.js";
import type { Referrer } from "./references.js";
import { deepFreeze, type EntityView, type GraphEntity, type GraphRecord, heldBy } from "./view.js";

/** One write of a plan: an entity's whole state after it, or its deletion. */
export type GraphStep = { op: "put"; kind: string; id: string; record: GraphRecord } | { op: "del"; kind: string; id: string };

const order = (a: Referrer, b: Referrer): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.field < b.field ? -1 : a.field > b.field ? 1 : 0);

export class Scratch {
	/** Identity -> the entity as the edit has it, or null where the edit deleted it. */
	private readonly laid = new Map<string, GraphEntity | null>();
	/** Target -> laid referrer -> the fields of it holding the target, for the entities laid here alone. */
	private readonly laidBack = new Map<string, Map<string, Set<string>>>();
	/** The steps applied, in order; and their reversal, in the order that undoes them. */
	readonly steps: GraphStep[] = [];
	readonly inverse: GraphStep[] = [];
	/** Each identity the edit touched, in the order first touched, and the requested item that led to its last write. */
	readonly touched: string[] = [];
	readonly cause = new Map<string, number>();
	/** The identities the edit deleted, and the targets an `onUnreferenced: "delete"` reference stopped holding, with the item that led there. */
	readonly deleted = new Map<string, number>();
	readonly released = new Map<string, number>();

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
		return entity ? this.held(entity) : new Map();
	}

	/** The targets each reference of an entity held when the edit found it. */
	targetsBefore(id: string): ReadonlyMap<string, readonly string[]> {
		return this.view.index.targetsOf(id);
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

	/** The targets an entity's record holds, per reference field in declaration order; the record was checked when written. */
	held(entity: GraphEntity): Map<string, readonly string[]> {
		const out = new Map<string, readonly string[]>();
		for (const ref of this.declaration.kinds.get(entity.kind) ?? []) {
			const targets = heldBy(entity.record, ref) ?? [];
			if (targets.length > 0) out.set(ref.field, targets);
		}
		return out;
	}

	/** Applies one step, its reversal read from the state just before it, `cause` the requested item that led to it. */
	write(step: GraphStep, cause: number): void {
		const was = this.get(step.id);
		this.inverse.unshift(was === undefined ? { op: "del", kind: step.kind, id: step.id } : { op: "put", kind: was.kind, id: was.id, record: was.record });
		const lost = was ? this.held(was) : new Map<string, readonly string[]>();
		this.unlay(step.id);
		const now = step.op === "put" ? Object.freeze({ kind: step.kind, id: step.id, record: deepFreeze(step.record) }) : null;
		this.laid.set(step.id, now);
		if (now !== null) this.lay(now);
		this.steps.push(step.op === "put" ? { op: "put", kind: step.kind, id: step.id, record: now!.record } : step);
		if (!this.cause.has(step.id)) this.touched.push(step.id);
		this.cause.set(step.id, cause);
		if (step.op === "del" && was !== undefined) this.deleted.set(step.id, cause);
		// a target an `onUnreferenced: "delete"` reference stopped holding is a candidate for deletion once nothing holds it
		const kept = now ? this.held(now) : new Map<string, readonly string[]>();
		for (const ref of this.declaration.kinds.get(was?.kind ?? step.kind) ?? []) {
			if (ref.onUnreferenced !== "delete") continue;
			const still = new Set(kept.get(ref.field) ?? []);
			for (const target of lost.get(ref.field) ?? []) if (!still.has(target)) this.released.set(target, cause);
		}
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

	/** The net writes: for each entity touched, in the order first touched, its state after the edit where it differs from before. */
	netWrites(): GraphStep[] {
		const out: GraphStep[] = [];
		for (const id of this.touched) {
			const was = this.view.get(id);
			const now = this.get(id);
			if (now === undefined) { if (was !== undefined) out.push({ op: "del", kind: was.kind, id }); continue; }
			if (was !== undefined && was.kind === now.kind && JSON.stringify(was.record) === JSON.stringify(now.record)) continue;
			out.push({ op: "put", kind: now.kind, id, record: now.record });
		}
		return out;
	}
}
