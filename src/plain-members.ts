/**
 * Reading an input's members as plain data, running none of its code (docs/DECISIONS.md D10): an object's own enumerable
 * data members, or a list's items, copied once, so a getter, a Proxy whose trap throws, a prototype other than an object's or
 * a list's, or a list with members of its own beyond its items is refused rather than read. Plain JSON is read through
 * shape-check's `readPlainJson`; this reads the declaration's objects and lists, which may hold the functions consequences,
 * conditions and resolvers are and which plain JSON cannot hold.
 *
 * Promises (zorg's D54 and D55; docs/DECISIONS.md D30): a native promise met as a member or an item is refused, since no part of a
 * declaration is one, unless `plainNext` says the caller reads the values as plain JSON next, which refuses it there and observes
 * it; and whenever a value is refused, the value itself, every member or item read from it so far and anything a Proxy's trap
 * threw are handed to shape-check's `observePromises`, so a promise among them that rejects leaves no unhandled rejection.
 */
import { observePromises, readPlainJson } from "@apnex/shape-check";

/**
 * Observes every native promise in a value, walking all of it: shape-check's walk stops after 1,000 objects, so a promise past
 * them in a large refused value would go unhandled (docs/DECISIONS.md D31).
 */
export function observeAll(value: unknown): void {
	observePromises(value, Number.POSITIVE_INFINITY);
}

/** shape-check's plain-JSON reading, and, on refusal, every promise in the value observed however far into it (D31). */
export function readPlain(value: unknown): ReturnType<typeof readPlainJson> {
	const read = readPlainJson(value as never);
	if (!read.ok) observeAll(value);
	return read;
}

/** An object's own members, copied onto an object with no prototype, or null when it is not plain data. */
export function membersOf(value: unknown, plainNext = false): Record<string, unknown> | null {
	const captured: unknown[] = [value];
	const refused = (thrown?: unknown): null => {
		observeAll([...captured, thrown]);
		return null;
	};
	try {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return refused();
		const proto: unknown = Object.getPrototypeOf(value);
		if (proto !== Object.prototype && proto !== null) return refused();
		const out: Record<string, unknown> = Object.create(null);
		for (const key of Reflect.ownKeys(value)) {
			const d = Object.getOwnPropertyDescriptor(value, key);
			if (d !== undefined && "value" in d) captured.push(d.value);
			if (typeof key !== "string" || d === undefined || !("value" in d) || !d.enumerable) return refused();
			if (!plainNext && d.value instanceof Promise) return refused();
			out[key] = d.value;
		}
		return out;
	} catch (thrown) {
		return refused(thrown);
	}
}

/** A list's items, copied, or null when it is not a plain list. */
export function itemsOf(value: unknown, plainNext = false): unknown[] | null {
	const captured: unknown[] = [value];
	const refused = (thrown?: unknown): null => {
		observeAll([...captured, thrown]);
		return null;
	};
	try {
		if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return refused();
		const length = (Object.getOwnPropertyDescriptor(value, "length") as PropertyDescriptor).value as number;
		const keys = Reflect.ownKeys(value);
		if (keys.length !== length + 1) return refused();
		const out: unknown[] = [];
		for (let i = 0; i < length; i++) {
			const d = Object.getOwnPropertyDescriptor(value, String(i));
			if (d !== undefined && "value" in d) captured.push(d.value);
			if (d === undefined || !("value" in d)) return refused();
			if (!plainNext && d.value instanceof Promise) return refused();
			out.push(d.value);
		}
		return out;
	} catch (thrown) {
		return refused(thrown);
	}
}

/**
 * Whether two plain JSON values are equal, an object's members compared whatever their order - or, `ordered`, in their order too
 * (D31) - and a list's items in order (docs/DECISIONS.md D19). It walks with a stack of its own rather than recursing, so a value of any depth plain JSON can hold
 * is compared, and stops at the first part shared, as a record's untouched members are after a change of named fields.
 */
export function samePlain(a: unknown, b: unknown, ordered = false): boolean {
	const pending: [unknown, unknown][] = [[a, b]];
	while (pending.length > 0) {
		const [x, y] = pending.pop()!;
		if (x === y) continue;
		if (typeof x !== "object" || typeof y !== "object" || x === null || y === null || Array.isArray(x) !== Array.isArray(y)) return false;
		if (Array.isArray(x)) {
			const list = y as unknown[];
			if (x.length !== list.length) return false;
			for (let i = 0; i < x.length; i++) pending.push([x[i], list[i]]);
			continue;
		}
		const left = x as Record<string, unknown>;
		const right = y as Record<string, unknown>;
		const keys = Object.keys(left);
		const others = Object.keys(right);
		if (keys.length !== others.length) return false;
		for (const [n, key] of keys.entries()) {
			if (ordered ? others[n] !== key : !Object.hasOwn(right, key)) return false;
			pending.push([left[key], right[key]]);
		}
	}
	return true;
}
