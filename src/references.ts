/**
 * The reference index (CONTRACT.md `dated-graph-view`; the build plan's `references` module): for each entity, the targets
 * each of its references holds, and for each target, the entities and fields that refer to it. Kept current from every
 * entity taken in, so a lookup costs the targets or referrers it answers, and keeping it costs the references that changed.
 * A reference to an identity the view does not hold is kept, since the record holds it.
 */

/** A referrer: the entity holding the reference, and the reference's field. */
export interface Referrer {
	readonly kind: string;
	readonly id: string;
	readonly field: string;
}

interface Held {
	readonly kind: string;
	readonly fields: ReadonlyMap<string, readonly string[]>;
}

const order = (a: Referrer, b: Referrer): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.field < b.field ? -1 : a.field > b.field ? 1 : 0);

export class ReferenceIndex {
	/** Referrer identity -> its kind and, per reference field in declaration order, the targets held in record order. */
	private readonly held = new Map<string, Held>();
	/** Target identity -> referrer identity -> the fields of that referrer holding it. */
	private readonly back = new Map<string, Map<string, Set<string>>>();

	/** Takes in the whole state of an entity after a change: the references it held go, the ones it holds now come. */
	put(id: string, kind: string, fields: ReadonlyMap<string, readonly string[]>): void {
		this.drop(id); // the references it held before this change
		this.held.set(id, { kind, fields });
		for (const [field, targets] of fields) {
			for (const target of targets) {
				let referrers = this.back.get(target);
				if (referrers === undefined) this.back.set(target, (referrers = new Map()));
				let via = referrers.get(id);
				if (via === undefined) referrers.set(id, (via = new Set()));
				via.add(field);
			}
		}
	}

	/** Takes in a deletion: every reference the entity held goes. References to it stay, as the records hold them. */
	remove(id: string): void {
		this.drop(id); // a deleted entity refers to nothing
	}

	private drop(id: string): void {
		const was = this.held.get(id);
		if (was === undefined) return;
		this.held.delete(id);
		for (const targets of was.fields.values()) {
			for (const target of targets) {
				const referrers = this.back.get(target);
				if (referrers === undefined) continue;
				referrers.delete(id);
				if (referrers.size === 0) this.back.delete(target);
			}
		}
	}

	/** Every referrer of `target`, in identity then field order. */
	referrersOf(target: string): Referrer[] {
		const out: Referrer[] = [];
		for (const [id, via] of this.back.get(target) ?? new Map<string, Set<string>>()) {
			const kind = this.held.get(id)?.kind;
			if (kind === undefined) continue;
			for (const field of via) out.push({ kind, id, field });
		}
		return out.sort(order);
	}

	/** The references an entity holds: per field in declaration order, its targets in record order; none for an entity not held. */
	targetsOf(id: string): ReadonlyMap<string, readonly string[]> {
		return this.held.get(id)?.fields ?? new Map();
	}
}
