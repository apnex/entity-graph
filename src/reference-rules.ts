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
import { type Attribution, fieldKey, type GraphStep, holdingKey, later, type Scratch } from "./scratch.js";
import type { GraphEntity, GraphRecord } from "./view.js";

/** One breach of a condition: its rule key `<kind>.<id>`, the subject the condition named, its measure and its own sentence. */
export interface ConditionReading {
	readonly ruleKey: string;
	readonly subject: string;
	readonly measure: number;
	readonly sentence: string;
}

/** What a refusal for a broken rule states: its code, rule key, subject, measure, the item it follows from, and a condition's sentence. */
export interface Verdict {
	readonly code: "rule-broken" | "shape-misfit" | "condition-broken" | "held-write";
	readonly ruleKey: string;
	readonly subject: string;
	readonly measure: number;
	readonly opIndex: number;
	readonly sentence: string | null;
}

/** A breach as read in one state, with what it is read from: the entity and reference, and the targets, holders or misfits it counts. */
interface Reading {
	readonly key: string;
	readonly ruleKey: string;
	readonly subject: string;
	readonly measure: number;
	readonly rule: "targets" | "onTargetDelete" | "min" | "exclusivity" | "shape";
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
 * Expands the declared rules over the edit so far, until nothing more follows (D18, D19, D23). It keeps what it has read, so
 * after each phase it reads only the writes made since it last ran: the planner runs it once after the requested items and
 * once after each phase. A hold gained on a target the edit deleted -- as a consequence can make after the deletion was
 * expanded -- sends the target round again, so `onTargetDelete` acts on its new referrer too.
 */
export class RuleExpander {
	// what the writes since each phase last ran changed: deletions, steal holdings, entities, and targets that lost a holder
	private read = 0;
	private readonly deletions: string[] = [];
	private readonly stealing = new Map<string, Set<string>>(); // target -> "kind\0field" of the steal references to read for it
	private readonly written = new Set<string>();
	private readonly unheld = new Set<string>();

	constructor(private readonly s: Scratch, private readonly d: CompiledDeclaration) {}

	private steal(kind: string, field: string, target: string): void {
		if (refOf(this.d, kind, field)?.exclusivity !== "steal") return;
		if (!this.stealing.has(target)) this.stealing.set(target, new Set());
		this.stealing.get(target)!.add(`${kind}\u0000${field}`);
	}

	private drain(): void {
		const s = this.s;
		for (; this.read < s.log.length; this.read++) {
			const { id, was, now, lost, gained } = s.log[this.read]!;
			if (now === null && was !== undefined) this.deletions.push(id);
			if (now !== null) this.written.add(id);
			for (const [field, target] of lost) {
				this.steal(was!.kind, field, target);
				this.unheld.add(target);
			}
			for (const [field, target] of gained) {
				this.steal(now!.kind, field, target);
				if (s.get(target) === undefined && s.deleted.has(target)) this.deletions.push(target);
			}
		}
	}

	/** True at the fixed point; false where it stopped because more than `bound` net writes are certain (D19). */
	run(bound: number): boolean {
		const { s, d } = this;
		const put = (entity: GraphEntity, record: GraphRecord, cause: number) => s.write({ op: "put", kind: entity.kind, id: entity.id, record }, cause);
		const remove = (entity: GraphEntity, cause: number) => s.write({ op: "del", kind: entity.kind, id: entity.id }, cause);
		const over = () => s.certainWrites() > bound;
		for (;;) {
			let changed = false;
			// onTargetDelete, for each target deleted since this phase last ran; one deleted during it waits for the next round
			this.drain();
			for (const target of this.deletions.splice(0)) {
				if (s.get(target) !== undefined) continue;
				const cause = s.deleted.get(target)?.cause ?? -1;
				for (const r of s.referrersOf(target)) {
					const holder = s.get(r.id);
					const ref = refOf(d, r.kind, r.field);
					if (holder === undefined || ref === undefined || ref.onTargetDelete === "refuse") continue;
					if (ref.onTargetDelete === "cascade-delete") remove(holder, cause);
					else put(holder, without(holder.record, ref, target), cause);
					changed = true;
					if (over()) return false;
				}
			}
			// exclusivity: steal, for each target whose holders through a steal reference changed
			this.drain();
			const pairs = [...this.stealing];
			this.stealing.clear();
			for (const [target, refs] of pairs) {
				for (const kf of refs) {
					const [kind, field] = kf.split("\u0000") as [string, string];
					const ref = refOf(d, kind, field)!;
					const holders = s.referrersOf(target).filter((r) => r.kind === kind && r.field === field);
					if (holders.length < 2) continue;
					const fresh = holders.filter((r) => !s.heldBefore(r.id, kind, field, target));
					if (fresh.length !== 1) continue; // none new, a standing breach; two or more new, judged below
					const cause = s.heldSince.get(holdingKey(fresh[0]!.id, field, target))?.cause ?? -1;
					for (const r of holders) {
						if (r.id === fresh[0]!.id) continue;
						const holder = s.get(r.id)!;
						put(holder, without(holder.record, ref, target), cause);
						changed = true;
						if (over()) return false;
					}
				}
			}
			// onBelowMin: cascade-delete, for each entity written since this phase last ran that the edit found and left further
			// below a minimum than it found it; one the edit created is judged instead (D19)
			this.drain();
			const entities = [...this.written];
			this.written.clear();
			for (const id of entities) {
				const entity = s.get(id);
				if (entity === undefined || s.before(id)?.kind !== entity.kind) continue;
				for (const ref of d.kinds.get(entity.kind) ?? []) {
					if (ref.min === null || ref.onBelowMin !== "cascade-delete") continue;
					const now = s.targetsOf(id).get(ref.field)?.length ?? 0;
					const was = s.targetsBefore(id).get(ref.field)?.length ?? 0;
					if (now < ref.min && now < was) {
						remove(entity, s.shrunk.get(fieldKey(id, ref.field))?.cause ?? -1);
						changed = true;
						if (over()) return false;
						break;
					}
				}
			}
			// onUnreferenced: delete, for each target a reference declaring it stopped holding, once nothing holds it
			this.drain();
			const targets = [...this.unheld];
			this.unheld.clear();
			for (const target of targets) {
				const released = s.released.get(target);
				const entity = s.get(target);
				if (released === undefined || entity === undefined || s.referrersOf(target).length > 0) continue;
				s.released.delete(target);
				remove(entity, released.cause);
				changed = true;
				if (over()) return false;
			}
			if (!changed) break; // the fixed point: no rule has anything more to do
		}
		return true;
	}
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

/** An entity's misfits against its kind's shape (D24), each named `<pointer> <keyword>`, as a breach measured by how many. */
function shapeBreach(d: CompiledDeclaration, entity: GraphEntity): Reading | null {
	const shape = d.shapes.get(entity.kind);
	if (shape === undefined) return null;
	const verdict = shape.judge(entity.record as never);
	if (verdict.verdict !== "misfit") return null;
	const counted = verdict.misfits.map((m) => `${m.pointer} ${m.keyword}`);
	return { key: `${entity.kind}.shape@${entity.id}`, ruleKey: `${entity.kind}.shape`, subject: entity.id, measure: counted.length, rule: "shape", id: entity.id, kind: entity.kind, field: "", counted };
}

/** The top-level field a misfit's pointer names, its JSON pointer escapes undone. */
const fieldOfMisfit = (counted: string): string => counted.slice(1, counted.indexOf(" ")).split("/")[0]!.replace(/~1/g, "/").replace(/~0/g, "~");

/**
 * Judges the edit (D18, D19, D21, D23, D24): the breaches of the reference rules and shapes the edit introduced or worsened,
 * read in both states over what it can have changed, each refused for the item it follows from; and, if none, the breaches
 * of the conditions, which follow from the edit as a whole. A breach whose write was a consequence's, of an entity that did not
 * already fail before the edit, is refused as that consequence's write held to the rules a requested write meets. A
 * referrer's breaches about an entity change only where the entity's presence or kind does, so the referrers of an entity
 * whose record alone changed are not read; and a breach of exclusivity worsens only through a new holder, which the edit
 * touched.
 */
export function judge(s: Scratch, d: CompiledDeclaration, conditionsBefore: ReadonlyMap<string, ConditionReading>, conditionsAfter: ReadonlyMap<string, ConditionReading>): Verdict | null {
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
	const touched = new Set(s.touched);
	const read = (after: boolean): Map<string, Reading> => {
		const get = (id: string) => (after ? s.get(id) : s.before(id));
		const out = new Map<string, Reading>();
		const wasPresent = (t: string) => after && s.before(t) !== undefined;
		for (const id of entities) {
			const entity = get(id);
			if (entity === undefined) continue;
			for (const b of entityBreaches(d, entity, after ? s.targetsOf(id) : s.targetsBefore(id), get, wasPresent)) out.set(b.key, b);
			// a shape reads its entity's record alone, so only an entity the edit wrote can misfit anew
			const misfit = touched.has(id) ? shapeBreach(d, entity) : null;
			if (misfit !== null) out.set(misfit.key, misfit);
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
	// whether an entity failed a rule a requested write of it meets, before the edit: its shape, its references, a condition about it
	const failedBefore = (id: string): boolean => {
		for (const b of before.values()) if (b.rule === "exclusivity" ? b.counted.includes(id) : b.id === id) return true;
		for (const c of conditionsBefore.values()) if (c.subject === id) return true;
		return false;
	};
	const found: (Verdict & { key: string })[] = [];
	for (const b of read(true).values()) {
		const was = before.get(b.key);
		if (b.measure <= (was?.measure ?? 0)) continue; // neither introduced nor worsened
		const { at, entity } = attributionOf(s, b, was);
		const held = at !== undefined && at.by !== null && !failedBefore(entity);
		found.push(held
			? { key: b.key, code: "held-write", ruleKey: at.by!, subject: entity, measure: b.measure, opIndex: at.cause, sentence: null }
			: { key: b.key, code: b.rule === "shape" ? "shape-misfit" : "rule-broken", ruleKey: b.ruleKey, subject: b.subject, measure: b.measure, opIndex: at?.cause ?? -1, sentence: null });
	}
	found.sort((a, b) => a.opIndex - b.opIndex || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	if (found.length > 0) {
		const { key: _key, ...verdict } = found[0]!;
		return verdict;
	}
	// the conditions, by key: one about an entity a consequence last wrote, which did not fail before, is that consequence's
	const keys = [...conditionsAfter.keys()].sort();
	for (const key of keys) {
		const c = conditionsAfter.get(key)!;
		if (c.measure <= (conditionsBefore.get(key)?.measure ?? 0)) continue;
		const last = s.lastWrite.get(c.subject);
		if (last !== undefined && last.by !== null && s.get(c.subject) !== undefined && !failedBefore(c.subject)) return { code: "held-write", ruleKey: last.by, subject: c.subject, measure: c.measure, opIndex: last.cause, sentence: c.sentence };
		return { code: "condition-broken", ruleKey: c.ruleKey, subject: c.subject, measure: c.measure, opIndex: -1, sentence: c.sentence };
	}
	return null;
}

/**
 * The write a breach follows from (the corpus's R21; D19, D23), read from what the breach counts that it did not count before
 * the edit, and the entity that write concerns: for `min`, the write that last left the reference holding fewer targets, its
 * entity's creation included; for `exclusivity`, the latest of the writes that made each new holder hold the target, and that
 * holder; for `targets` and `onTargetDelete`, the latest over the targets newly counted, each by the write that made the
 * reference hold it where the edit did, and otherwise by the write that created or deleted the target; and for a shape, the
 * latest over the misfits newly counted, each by the write that last changed the field it names.
 */
function attributionOf(s: Scratch, b: Reading, was: Reading | undefined): { at: Attribution | undefined; entity: string } {
	if (b.rule === "min") return { at: s.shrunk.get(fieldKey(b.id, b.field)), entity: b.id };
	const before = new Set(was?.counted ?? []);
	let at: Attribution | undefined;
	let entity = b.id;
	for (const one of b.counted) {
		if (before.has(one)) continue;
		if (b.rule === "shape") {
			at = later(at, s.fieldCause.get(fieldKey(b.id, fieldOfMisfit(one))) ?? s.lastWrite.get(b.id));
		} else if (b.rule === "exclusivity") {
			if (s.heldBefore(one, b.kind, b.field, b.id)) continue;
			const next = later(at, s.heldSince.get(holdingKey(one, b.field, b.id)));
			if (next !== at) entity = one;
			at = next;
		} else {
			at = later(at, s.heldBefore(b.id, b.kind, b.field, one) ? s.presence.get(one) : s.heldSince.get(holdingKey(b.id, b.field, one)));
		}
	}
	return { at, entity };
}

export type { GraphStep };
