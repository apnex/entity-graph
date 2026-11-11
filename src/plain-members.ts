/**
 * Reading an input's members as plain data, running none of its code (docs/DECISIONS.md D10): an object's own enumerable
 * data members, or a list's items, copied once, so a getter, a Proxy whose trap throws, a prototype other than an object's or
 * a list's, or a list with members of its own beyond its items is refused rather than read. Plain JSON is read through
 * shape-check's `readPlainJson`; this reads the declaration's objects and lists, which may hold the functions later
 * milestones read and which plain JSON cannot hold.
 */

/** An object's own members, copied onto an object with no prototype, or null when it is not plain data. */
export function membersOf(value: unknown): Record<string, unknown> | null {
	try {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
		const proto: unknown = Object.getPrototypeOf(value);
		if (proto !== Object.prototype && proto !== null) return null;
		const out: Record<string, unknown> = Object.create(null);
		for (const key of Reflect.ownKeys(value)) {
			const d = Object.getOwnPropertyDescriptor(value, key);
			if (typeof key !== "string" || d === undefined || !("value" in d) || !d.enumerable) return null;
			out[key] = d.value;
		}
		return out;
	} catch {
		return null;
	}
}

/** A list's items, copied, or null when it is not a plain list. */
export function itemsOf(value: unknown): unknown[] | null {
	try {
		if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
		const length = (Object.getOwnPropertyDescriptor(value, "length") as PropertyDescriptor).value as number;
		const keys = Reflect.ownKeys(value);
		if (keys.length !== length + 1) return null;
		const out: unknown[] = [];
		for (let i = 0; i < length; i++) {
			const d = Object.getOwnPropertyDescriptor(value, String(i));
			if (d === undefined || !("value" in d)) return null;
			out.push(d.value);
		}
		return out;
	} catch {
		return null;
	}
}

/**
 * Whether two plain JSON values are equal, an object's members compared whatever their order and a list's items in order
 * (docs/DECISIONS.md D19). It walks with a stack of its own rather than recursing, so a value of any depth plain JSON can hold
 * is compared, and stops at the first part shared, as a record's untouched members are after a change of named fields.
 */
export function samePlain(a: unknown, b: unknown): boolean {
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
		if (keys.length !== Object.keys(right).length) return false;
		for (const key of keys) {
			if (!Object.hasOwn(right, key)) return false;
			pending.push([left[key], right[key]]);
		}
	}
	return true;
}
