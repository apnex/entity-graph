// entity-store-suite - entity-store's own contract suite, run against the stores the ./entity-store adapter is tested over, in
// memory and on a change log file (the build plan's M6; docs/DECISIONS.md D43). The suite's cases call a store's own operations,
// so they apply to the store beneath the adapter rather than to the port it presents; the adapter's behaviour over these stores is
// tested in store-port.test.js and by the corpus's batches 5 and 6. The harness is built as entity-store builds its own.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createMemoryStoragePort, openEntityStore } from "@apnex/entity-store";
import { registerEntityStoreSuite } from "@apnex/entity-store/contract-suite";
import { createFileStoragePort } from "@apnex/entity-store/file-storage";

function harness(storage) {
	let ids = 0;
	return {
		async open(options, time) {
			let now = time;
			const clock = { now: () => now };
			const dir = storage === "file" ? fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "entity-graph-suite-")) : undefined;
			const memory = storage === "memory" ? createMemoryStoragePort() : undefined;
			const files = [];
			const port = () => (memory ?? (files.push(createFileStoragePort(path.join(dir, "changes.log"))), files.at(-1)));
			const openStore = () => {
				const opening = openEntityStore({ ...options, storage: port(), clock });
				if (!opening.opened) throw new Error(`the store did not open: ${JSON.stringify(opening.refusal)}`);
				return opening.store;
			};
			let store = openStore();
			return {
				setTime(ms) { now = ms; },
				newWriteId() { return `suite-write-${++ids}`; },
				async call(operation, input, caller = {}) {
					const write = { writer: caller.writer ?? "alice", writeId: caller.writeId ?? `suite-write-${++ids}` };
					switch (operation) {
						case "create": return store.create(input, write);
						case "update": return store.update(input, write);
						case "delete": return store.delete(input, write);
						case "read": return store.read(input);
						case "find": return store.find(input);
						case "history-bound": return store.historyBound();
						case "changes": return store.changes(input);
						case "follow": return store.follow(input);
						default: throw new Error(`no operation ${operation}`);
					}
				},
				async restart() { store = openStore(); },
				async close() {
					for (const f of files) f.close();
					if (dir) fs.rmSync(dir, { recursive: true, force: true });
				},
			};
		},
	};
}

for (const storage of ["memory", "file"]) registerEntityStoreSuite((name, run) => test(`entity-store on ${storage}: ${name}`, run), harness(storage));
