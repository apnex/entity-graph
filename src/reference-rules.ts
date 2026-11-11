/**
 * The reference rules (CONTRACT.md *Reference rules*, *Judging and refusals*; the build plan's `reference-rules` module;
 * docs/DECISIONS.md D16 to D18): what each declared option makes of an edit, expanded until nothing more follows, and the
 * breaches the result holds, each with a stable key and a numeric measure, judged against the state the edit found.
 *
 * Expansion (D18): for a target the edit deleted, each referrer holding it is deleted (`onTargetDelete: "cascade-delete"`) or
 * stops holding it (`"unlink"`; the only target of a one-target reference leaves null, D16); a target a new holder takes
 * under `exclusivity: "steal"` is taken from the referrer that held it; an entity the edit left below a reference's minimum
 * is deleted (`onBelowMin: "cascade-delete"`); and a target an `onUnreferenced: "delete"` reference stopped holding is
 * deleted once nothing holds it. Every rule only removes a reference or an entity, so expansion ends.
 *
 * Judging: a reference holding an identity no entity holds, or one of a kind it may not target, breaks its `targets` rule
 * (`onTargetDelete` where the edit deleted that target under `"refuse"`); a target held through an exclusive reference by
 * more than one referrer breaks `exclusivity`; an entity holding fewer targets than a minimum breaks `min`. The breaches are
 * read only where the edit can have changed them -- the entities it touched, their targets and their referrers -- in both
 * states, and the edit is refused for a breach it introduces or whose measure it raises; a partial repair is allowed.
 */
import type { CompiledDeclaration, CompiledReference } from "./declaration.js";
import type { GraphStep, Scratch } from "./scratch.js";
import type { GraphEntity, GraphRecord } from "./view.js";

/** One breach: its stable key, the rule's key and the entity it concerns, its measure, and the requested item that led there. */
export interface Breach {
	readonly key: string;
	readonly ruleKey: string;
	readonly subject: string;
	readonly measure: number;
	readonly opIndex: number;
}

/** The record with `target` no longer held through `ref`: a one-target reference left null, a list without it. */
function without(record: GraphRecord, ref: CompiledReference, target: string): GraphRecord {
	const value = record[ref.field];
	return { ...record, [ref.field]: ref.holds === "one" ? null : (value as string[]).filter((t) => t !== target) };
}

const refOf = (d: CompiledDeclaration, kind: string, field: string): CompiledReference | undefined => d.kinds.get(kind)?.find((r) => r.field === field);

/** Expands the declared rules over the edit so far, until nothing more follows. */
export function expandRules(s: Scratch, d: CompiledDeclaration): void {
	const put = (entity: GraphEntity, record: GraphRecord, cause: number) => s.write({ op: "put", kind: entity.kind, id: entity.id, record }, cause);
	const remove = (entity: GraphEntity, cause: number) => s.write({ op: "del", kind: entity.kind, id: entity.id }, cause);
	for (;;) {
		let changed = false;
		// onTargetDelete, for each target the edit deleted and has not put back
		for (const [target, cause] of [...s.deleted]) {
			if (s.get(target) !== undefined) continue;
			for (const r of s.referrersOf(target)) {
				const holder = s.get(r.id);
				const ref = refOf(d, r.kind, r.field);
				if (holder === undefined || ref === undefined || ref.onTargetDelete === "refuse") continue;
				if (ref.onTargetDelete === "cascade-delete") remove(holder, cause);
				else put(holder, without(holder.record, ref, target), cause);
				changed = true;
			}
		}
		// exclusivity: steal, for each target an entity the edit wrote holds through an exclusive reference
		for (const id of [...s.touched]) {
			const entity = s.get(id);
			if (entity === undefined) continue;
			for (const [field, targets] of s.targetsOf(id)) {
				const ref = refOf(d, entity.kind, field);
				if (ref?.exclusivity !== "steal") continue;
				for (const target of targets) {
					const holders = s.referrersOf(target).filter((r) => r.kind === entity.kind && r.field === field);
					if (holders.length < 2) continue;
					const fresh = holders.filter((r) => !(s.targetsBefore(r.id).get(field) ?? []).includes(target) || s.before(r.id)?.kind !== r.kind);
					if (fresh.length !== 1) continue;   // none new, a standing breach; two or more new, judged below
					for (const r of holders) {
						if (r.id === fresh[0]!.id) continue;
						const holder = s.get(r.id)!;
						put(holder, without(holder.record, ref, target), s.cause.get(fresh[0]!.id) ?? -1);
						changed = true;
					}
				}
			}
		}
		// onBelowMin: cascade-delete, for each entity the edit wrote and left further below a minimum than it found it
		for (const id of [...s.touched]) {
			const entity = s.get(id);
			if (entity === undefined) continue;
			for (const ref of d.kinds.get(entity.kind) ?? []) {
				if (ref.min === null || ref.onBelowMin !== "cascade-delete") continue;
				const now = ref.min - (s.targetsOf(id).get(ref.field)?.length ?? 0);
				const was = s.before(id)?.kind === entity.kind ? ref.min - (s.targetsBefore(id).get(ref.field)?.length ?? 0) : 0;
				if (now > 0 && now > was) { remove(entity, s.cause.get(id) ?? -1); changed = true; break; }
			}
		}
		// onUnreferenced: delete, for each target a reference declaring it stopped holding, once nothing holds it
		for (const [target, cause] of [...s.released]) {
			const entity = s.get(target);
			if (entity === undefined || s.referrersOf(target).length > 0) continue;
			s.released.delete(target);
			remove(entity, cause);
			changed = true;
		}
		if (!changed) break; // the fixed point: no rule has anything more to do
	}
}

/** The breaches an entity's references hold in one state: `get` reads that state's entities, `targets` its references. */
function entityBreaches(d: CompiledDeclaration, entity: GraphEntity, targets: ReadonlyMap<string, readonly string[]>, get: (id: string) => GraphEntity | undefined, deletedRefuse: (target: string) => boolean): Omit<Breach, "opIndex">[] {
	const out: Omit<Breach, "opIndex">[] = [];
	for (const ref of d.kinds.get(entity.kind) ?? []) {
		const held = targets.get(ref.field) ?? [];
		const bad = held.filter((t) => { const k = get(t)?.kind; return k === undefined || !ref.targets.includes(k); });
		if (bad.length > 0) {
			const rule = bad.some(deletedRefuse) && ref.onTargetDelete === "refuse" ? "onTargetDelete" : "targets";
			out.push({ key: `${entity.kind}.${ref.field}.targets@${entity.id}`, ruleKey: `${entity.kind}.${ref.field}.${rule}`, subject: `${entity.kind}:${entity.id}`, measure: bad.length });
		}
		if (ref.min !== null && held.length < ref.min) {
			out.push({ key: `${entity.kind}.${ref.field}.min@${entity.id}`, ruleKey: `${entity.kind}.${ref.field}.min`, subject: `${entity.kind}:${entity.id}`, measure: ref.min - held.length });
		}
	}
	return out;
}

/**
 * The breaches the edit introduced or worsened, in key order, each with the requested item that led there: read in both states
 * over what the edit can have changed -- the entities it touched, the referrers of each, and each target an exclusive reference
 * of theirs held.
 */
export function newBreaches(s: Scratch, d: CompiledDeclaration): Breach[] {
	const entities = new Set<string>();
	const exclusive = new Map<string, Set<string>>();   // target -> "kind.field" of the exclusive references to read for it
	for (const id of s.touched) {
		entities.add(id);
		for (const r of [...s.referrersOf(id), ...s.referrersBefore(id)]) entities.add(r.id);
	}
	for (const id of entities) {
		for (const [entity, targets] of [[s.get(id), s.targetsOf(id)], [s.before(id), s.targetsBefore(id)]] as const) {
			if (entity === undefined) continue;
			for (const [field, held] of targets) {
				if (refOf(d, entity.kind, field)?.exclusivity == null) continue;
				for (const t of held) { if (!exclusive.has(t)) exclusive.set(t, new Set()); exclusive.get(t)!.add(`${entity.kind}.${field}`); }
			}
		}
	}
	const read = (after: boolean): Map<string, Omit<Breach, "opIndex">> => {
		const get = (id: string) => (after ? s.get(id) : s.before(id));
		const out = new Map<string, Omit<Breach, "opIndex">>();
		const deletedRefuse = (t: string) => after && s.deleted.has(t) && s.before(t) !== undefined;
		for (const id of entities) {
			const entity = get(id);
			if (entity === undefined) continue;
			for (const b of entityBreaches(d, entity, after ? s.targetsOf(id) : s.targetsBefore(id), get, deletedRefuse)) out.set(b.key, b);
		}
		for (const [target, refs] of exclusive) {
			const referrers = after ? s.referrersOf(target) : s.referrersBefore(target);
			for (const kf of refs) {
				const holders = referrers.filter((r) => `${r.kind}.${r.field}` === kf);
				if (holders.length < 2) continue;
				const kind = get(target)?.kind ?? "?";
				out.set(`${kf}.exclusivity@${target}`, { key: `${kf}.exclusivity@${target}`, ruleKey: `${kf}.exclusivity`, subject: `${kind}:${target}`, measure: holders.length - 1 });
			}
		}
		return out;
	};
	const before = read(false);
	const found: Breach[] = [];
	for (const b of read(true).values()) {
		if (b.measure > (before.get(b.key)?.measure ?? 0)) found.push({ ...b, opIndex: causeOf(s, b) }); // introduced, or worsened
	}
	return found.sort((a, b) => (a.opIndex - b.opIndex) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The requested item that led to a breach: its entity's last write, or for a breach of a target, its newest holder's. */
function causeOf(s: Scratch, b: Omit<Breach, "opIndex">): number {
	const at = b.key.lastIndexOf("@");
	const id = b.key.slice(at + 1);
	if (b.ruleKey.endsWith(".exclusivity")) {
		const kf = b.key.slice(0, b.key.indexOf(".exclusivity@"));
		const holders = s.referrersOf(id).filter((r) => `${r.kind}.${r.field}` === kf).map((r) => s.cause.get(r.id) ?? -1);
		return Math.max(-1, ...holders);
	}
	if (s.cause.has(id)) return s.cause.get(id)!;
	// an entity the edit did not write: its breach came from a target the edit deleted or changed
	let found = -1;
	for (const targets of s.targetsOf(id).values()) for (const t of targets) found = Math.max(found, s.cause.get(t) ?? -1);
	return found;
}

export type { GraphStep };
