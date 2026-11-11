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
