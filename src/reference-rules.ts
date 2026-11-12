/**
 * The reference rules (CONTRACT.md *Reference rules*, *Judging and refusals*; the build plan's `reference-rules` module;
 * docs/DECISIONS.md D16 to D19): what each declared option makes of an edit, expanded until nothing more follows, and the
 * breaches the result holds, each with a stable key and a numeric measure, judged against the state the edit found.
 *
 * Expansion (D18, D19): for a target the edit deleted, each referrer holding it is deleted (`onTargetDelete: "cascade-delete"`)
 * or stops holding it (`"unlink"`; the only target of a one-target reference leaves null, D16); a target a new holder takes
 * under `exclusivity: "steal"` is taken from every referrer that held it before; an entity the edit found and left below a
 * reference's minimum, and below what it held, is deleted (`onBelowMin: "cascade-delete"`); and a target an
 * `onUnreferenced: "delete"` reference stopped holding is deleted once nothing holds it. Every rule only removes a reference or
 * an entity, so expansion ends. Each round runs the four in that order, and each reads only what the writes since it last ran
 * changed, so a cascade costs what it writes; it stops as soon as the net writes are certain to pass the bound.
 *
 * Judging (the corpus's R18; D19): a reference holding an identity absent before and after the edit, or one of a kind it may
 * not target, breaks `targets`; one holding a target the edit deleted, where the deletion is refused, breaks `onTargetDelete`;
 * a target held through an exclusive reference by more than one referrer breaks `exclusivity`; an entity holding fewer targets
 * than a reference's minimum breaks `min`. The breaches are read only where the edit can have changed them -- the entities it
 * touched, the referrers of those whose presence or kind it changed, and the targets their exclusive references hold -- in both
 * states, and the edit is refused for a breach it introduces or whose measure it raises; a partial repair is allowed.
 */
import type { CompiledDeclaration, CompiledReference } from "./declaration.js";
import { fieldKey, type GraphStep, holdingKey, type Scratch } from "./scratch.js";
import type { GraphEntity, GraphRecord } from "./view.js";

/** One breach: its stable key, the rule's key and the entity it concerns, its measure, and the requested item that led there. */
export interface Breach {
	readonly key: string;
	readonly ruleKey: string;
	readonly subject: string;
	readonly measure: number;
	readonly opIndex: number;
}

/** A breach as read in one state, with what it is read from: the entity and reference, and the targets or holders it counts. */
interface Reading {
	readonly key: string;
	readonly ruleKey: string;
	readonly subject: string;
	readonly measure: number;
	readonly rule: "targets" | "onTargetDelete" | "min" | "exclusivity";
	readonly id: string;
	readonly kind: string;
	readonly field: string;
	readonly counted: readonly string[];
}

/** The record with `target` no longer held through `ref`: a one-target reference left null, a list without it. */
function without(record: GraphRecord, ref: CompiledReference, target: string): GraphRecord {
	const value = record[ref.field];
	return { ...record, [ref.field]: ref.holds === "one" ? null : (value as string[]).filter((t) => t !== target) };
}

const refOf = (d: CompiledDeclaration, kind: string, field: string): CompiledReference | undefined => d.kinds.get(kind)?.find((r) => r.field === field);

/**
 * Expands the declared rules over the edit so far, until nothing more follows: true at the fixed point, false where it stopped
 * because more than `bound` net writes are certain (D19).
 */
export function expandRules(s: Scratch, d: CompiledDeclaration, bound: number): boolean {
	const put = (entity: GraphEntity, record: GraphRecord, cause: number) => s.write({ op: "put", kind: entity.kind, id: entity.id, record }, cause);
	const remove = (entity: GraphEntity, cause: number) => s.write({ op: "del", kind: entity.kind, id: entity.id }, cause);
	const over = () => s.certainWrites() > bound;
	// what the writes since each phase last ran changed: deletions, steal holdings, entities, and targets that lost a holder
	const deletions: string[] = [];
	const stealing = new Map<string, Set<string>>(); // target -> "kind\0field" of the steal references to read for it
	const written = new Set<string>();
	const unheld = new Set<string>();
	let read = 0;
	const steal = (kind: string, field: string, target: string) => {
		if (refOf(d, kind, field)?.exclusivity !== "steal") return;
		if (!stealing.has(target)) stealing.set(target, new Set());
		stealing.get(target)!.add(`${kind}\u0000${field}`);
	};
	const drain = () => {
		for (; read < s.log.length; read++) {
			const { id, was, now, lost, gained } = s.log[read]!;
			if (now === null && was !== undefined) deletions.push(id);
			if (now !== null) written.add(id);
			for (const [field, target] of lost) {
				steal(was!.kind, field, target);
				unheld.add(target);
			}
			for (const [field, target] of gained) steal(now!.kind, field, target);
		}
	};
	for (;;) {
		let changed = false;
		// onTargetDelete, for each target deleted since this phase last ran; one deleted during it waits for the next round
		drain();
		for (const target of deletions.splice(0)) {
			if (s.get(target) !== undefined) continue;
			for (const r of s.referrersOf(target)) {
				const holder = s.get(r.id);
				const ref = refOf(d, r.kind, r.field);
				if (holder === undefined || ref === undefined || ref.onTargetDelete === "refuse") continue;
				if (ref.onTargetDelete === "cascade-delete") remove(holder, s.deleted.get(target) ?? -1);
				else put(holder, without(holder.record, ref, target), s.deleted.get(target) ?? -1);
				changed = true;
				if (over()) return false;
			}
		}
		// exclusivity: steal, for each target whose holders through a steal reference changed
		drain();
		const pairs = [...stealing];
		stealing.clear();
		for (const [target, refs] of pairs) {
			for (const kf of refs) {
				const [kind, field] = kf.split("\u0000") as [string, string];
				const ref = refOf(d, kind, field)!;
				const holders = s.referrersOf(target).filter((r) => r.kind === kind && r.field === field);
				if (holders.length < 2) continue;
				const fresh = holders.filter((r) => !s.heldBefore(r.id, kind, field, target));
				if (fresh.length !== 1) continue; // none new, a standing breach; two or more new, judged below
				const cause = s.heldSince.get(holdingKey(fresh[0]!.id, field, target)) ?? -1;
				for (const r of holders) {
					if (r.id === fresh[0]!.id) continue;
					const holder = s.get(r.id)!;
					put(holder, without(holder.record, ref, target), cause);
					changed = true;
					if (over()) return false;
				}
			}
		}
		// onBelowMin: cascade-delete, for each entity written since this phase last ran that the edit found and left further below
		// a minimum than it found it; one the edit created is judged instead (D19)
		drain();
		const entities = [...written];
		written.clear();
		for (const id of entities) {
			const entity = s.get(id);
			if (entity === undefined || s.before(id)?.kind !== entity.kind) continue;
			for (const ref of d.kinds.get(entity.kind) ?? []) {
				if (ref.min === null || ref.onBelowMin !== "cascade-delete") continue;
				const now = s.targetsOf(id).get(ref.field)?.length ?? 0;
				const was = s.targetsBefore(id).get(ref.field)?.length ?? 0;
				if (now < ref.min && now < was) {
					remove(entity, s.shrunk.get(fieldKey(id, ref.field)) ?? -1);
					changed = true;
					if (over()) return false;
					break;
				}
			}
		}
		// onUnreferenced: delete, for each target a reference declaring it stopped holding, once nothing holds it
		drain();
		const targets = [...unheld];
		unheld.clear();
		for (const target of targets) {
			const cause = s.released.get(target);
			const entity = s.get(target);
			if (cause === undefined || entity === undefined || s.referrersOf(target).length > 0) continue;
			s.released.delete(target);
			remove(entity, cause);
			changed = true;
			if (over()) return false;
		}
		if (!changed) break; // the fixed point: no rule has anything more to do
	}
	return true;
}

/**
 * The breaches an entity's references hold in one state (the corpus's R18; D18, D19): `get` reads that state's entities and
 * `wasPresent` whether an identity was present when the edit found it -- never, for the state before.
 */
function entityBreaches(d: CompiledDeclaration, entity: GraphEntity, targets: ReadonlyMap<string, readonly string[]>, get: (id: string) => GraphEntity | undefined, wasPresent: (id: string) => boolean): Reading[] {
	const out: Reading[] = [];
	const breach = (ref: CompiledReference, rule: Reading["rule"], measure: number, counted: readonly string[]) =>
		out.push({ key: `${entity.kind}.${ref.field}.${rule}@${entity.id}`, ruleKey: `${entity.kind}.${ref.field}.${rule}`, subject: entity.id, measure, rule, id: entity.id, kind: entity.kind, field: ref.field, counted });
	for (const ref of d.kinds.get(entity.kind) ?? []) {
		const held = targets.get(ref.field) ?? [];
		// targets: absent as the edit found it and absent after it, or present and of a kind the reference may not target
		const bad = held.filter((t) => { const now = get(t); return now === undefined ? !wasPresent(t) : !ref.targets.includes(now.kind); });
		if (bad.length > 0) breach(ref, "targets", bad.length, bad);
		// onTargetDelete: targets the edit deleted, held through a reference whose deletion is refused
		const deleted = ref.onTargetDelete === "refuse" ? held.filter((t) => get(t) === undefined && wasPresent(t)) : [];
		if (deleted.length > 0) breach(ref, "onTargetDelete", deleted.length, deleted);
		// min: fewer targets than the minimum, whatever falling below it does; one the edit found and left below it under
		// "cascade-delete" is gone by now, so what is read here is one the edit created below it (D19), or a standing breach
		if (ref.min !== null && held.length < ref.min) breach(ref, "min", ref.min - held.length, []);
	}
	return out;
}

/**
 * The breaches the edit introduced or worsened, in order of the item each follows from and then of key: read in both states
 * over what the edit can have changed (D19). A referrer's breaches about an entity change only where the entity's presence or
 * kind does, so the referrers of an entity whose record alone changed are not read; and a breach of exclusivity worsens only
 * through a new holder, which the edit touched.
 */
export function newBreaches(s: Scratch, d: CompiledDeclaration): Breach[] {
	const entities = new Set<string>();
	const exclusive = new Map<string, Map<string, readonly [string, string]>>(); // target -> "kind.field" -> [kind, field], the exclusive references to read for it
	for (const id of s.touched) {
		entities.add(id);
		const was = s.before(id);
		const now = s.get(id);
		if (was?.kind !== now?.kind) for (const r of [...s.referrersOf(id), ...s.referrersBefore(id)]) entities.add(r.id);
		for (const [entity, targets] of [[now, s.targetsOf(id)], [was, s.targetsBefore(id)]] as const) {
			if (entity === undefined) continue;
			for (const [field, held] of targets) {
				if (refOf(d, entity.kind, field)?.exclusivity == null) continue;
				for (const t of held) {
					if (!exclusive.has(t)) exclusive.set(t, new Map());
					exclusive.get(t)!.set(`${entity.kind}.${field}`, [entity.kind, field]);
				}
			}
		}
	}
	const read = (after: boolean): Map<string, Reading> => {
		const get = (id: string) => (after ? s.get(id) : s.before(id));
		const out = new Map<string, Reading>();
		const wasPresent = (t: string) => after && s.before(t) !== undefined;
		for (const id of entities) {
			const entity = get(id);
			if (entity === undefined) continue;
			for (const b of entityBreaches(d, entity, after ? s.targetsOf(id) : s.targetsBefore(id), get, wasPresent)) out.set(b.key, b);
		}
		for (const [target, refs] of exclusive) {
			const referrers = after ? s.referrersOf(target) : s.referrersBefore(target);
			for (const [kf, [kind, field]] of refs) {
				const holders = referrers.filter((r) => r.kind === kind && r.field === field);
				if (holders.length < 2) continue;
				out.set(`${kf}.exclusivity@${target}`, { key: `${kf}.exclusivity@${target}`, ruleKey: `${kf}.exclusivity`, subject: target, measure: holders.length - 1, rule: "exclusivity", id: target, kind, field, counted: holders.map((h) => h.id) });
			}
		}
		return out;
	};
	const before = read(false);
	const found: Breach[] = [];
	for (const b of read(true).values()) {
		const was = before.get(b.key);
		if (b.measure > (was?.measure ?? 0)) found.push({ key: b.key, ruleKey: b.ruleKey, subject: b.subject, measure: b.measure, opIndex: causeOf(s, b, was) }); // introduced, or worsened
	}
	return found.sort((a, b) => a.opIndex - b.opIndex || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * The requested item a breach follows from (the corpus's R21; D19), read from what the breach counts that it did not count
 * before: for `min`, the item that last left the reference holding fewer targets, its entity's creation included; for
 * `exclusivity`, the newest of the holders the edit made, each by the item that made it hold the target; and for `targets`
 * and `onTargetDelete`, the latest of the targets newly counted, each by the item that made the reference hold it where the
 * edit did, and otherwise by the item that created or deleted the target. A write of the entity that changed none of these
 * is no cause.
 */
function causeOf(s: Scratch, b: Reading, was: Reading | undefined): number {
	if (b.rule === "min") return s.shrunk.get(fieldKey(b.id, b.field)) ?? -1;
	const before = new Set(was?.counted ?? []);
	let found = -1;
	for (const one of b.counted) {
		if (before.has(one)) continue;
		if (b.rule === "exclusivity") {
			if (!s.heldBefore(one, b.kind, b.field, b.id)) found = Math.max(found, s.heldSince.get(holdingKey(one, b.field, b.id)) ?? -1);
			continue;
		}
		const cause = s.heldBefore(b.id, b.kind, b.field, one) ? s.presence.get(one) : s.heldSince.get(holdingKey(b.id, b.field, one));
		found = Math.max(found, cause ?? -1);
	}
	return found;
}

export type { GraphStep };
