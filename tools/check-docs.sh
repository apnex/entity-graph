#!/usr/bin/env bash
# check-docs - hold every tracked markdown file to the mission-kit style rules.
#
# One entry point, so the gate a contributor runs locally and the gate CI runs are the same
# script. The per-rule checkers are vendored from apnex/mission-kit `style/`; each one owns
# exactly one rule and this script only sequences them.
#
#   S6   one sentence per line
#   S8   code-block comments say what the line does
#   S10  horizontal rule between top-level sections
#   S12  code-block introducer is its own paragraph
#   S13  plain ASCII only
#
# Every checker runs even when an earlier one fails, so one run reports everything.
#
# Usage:  tools/check-docs.sh            check every tracked markdown file
#         tools/check-docs.sh FILE...    check the named files
#         tools/check-docs.sh --fix      apply every mechanical fix, then re-check

set -uo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

fix=0
args=()
while [ $# -gt 0 ]; do
	case "$1" in
		--fix) fix=1; shift ;;
		*) args+=("$1"); shift ;;
	esac
done

if [ ${#args[@]} -eq 0 ]; then
	# Tracked and untracked files both, honouring .gitignore. Listing only
	# tracked files made this gate report clean over markdown it had never
	# opened, so a new document passed locally and failed in CI on first add.
	# A file staged for deletion is still in the index, so drop anything that
	# is no longer on disk.
	mapfile -t files < <(
		git ls-files --cached --others --exclude-standard '*.md' \
			| sort -u \
			| while IFS= read -r candidate; do
				[ -f "$candidate" ] && printf '%s\n' "$candidate"
			done
	)
else
	files=("${args[@]}")
fi
[ ${#files[@]} -eq 0 ] && { echo "no markdown files to check."; exit 0; }

if [ "$fix" -eq 1 ]; then
	tools/format-markdown.sh "${files[@]}"
fi

status=0
for rule in s13-plain-ascii s6-one-sentence-per-line s10-section-rules s12-code-block-introducer s8-code-block-comments; do
	tool=$(ls "$root/tools/$rule".* 2>/dev/null | head -1)
	[ -n "$tool" ] || { echo "missing checker for $rule" >&2; status=1; continue; }
	case "$tool" in
		*.mjs) node "$tool" --check "${files[@]}" || status=1 ;;
		*)     "$tool" "${files[@]}" || status=1 ;;
	esac
done

node -e '
const crypto = require("node:crypto");
const fs = require("node:fs");
const banned = new Set([
	"d979885447a413abb6d606a5d0f45c3b7809e6fde2c83f0df3426f1fc9bfed97",
	"780ab09e0c077f85b1cb1970f490a88a7e434dd4e38b769f4c008592bb646a2b",
	"eda594c7094ca8e7b3949e4eb4ecc2388c155ca536263998c7e863d1cbdcfa43",
	"d4c67f5e78e9ba45ad6293d6cd593e793b880c57fce0de4c3963f94ef82f3ae4",
]);
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
let fails = 0;
for (const f of process.argv.slice(1)) {
	if (!fs.existsSync(f)) continue;
	const lines = fs.readFileSync(f, "utf8").split("\n");
	for (let i = 0; i < lines.length; i++) {
		const lower = lines[i].toLowerCase();
		const tokens = new Set([...(lower.match(/[a-z0-9]+/g) || []), ...(lower.match(/[a-z0-9]+(?:\.[a-z0-9]+)+/g) || [])]);
		for (const t of tokens) {
			if (banned.has(sha(t))) {
				console.log(`FAIL  BAN   ${f}:${i + 1}  banned personal name, handle, or email domain`);
				fails++;
			}
		}
	}
}
if (fails > 0) process.exit(1);
' "${files[@]}" || status=1

[ "$status" -eq 0 ] && echo "docs: ${#files[@]} file(s) clean against S6, S8, S10, S12, S13."
exit "$status"
