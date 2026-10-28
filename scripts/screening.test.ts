/**
 * 11-point check tests. Run with:  npm run test
 *
 * The model's answer is untrusted text, and these are the functions that turn
 * it into "may this go to a vote". Every way it can go wrong here goes wrong
 * towards a pass the DAO never gave, so each one is pinned down.
 */

import { contentHash, parseVerdict } from "../lib/screening";
import { decide, type CriterionResult } from "../lib/screening-criteria";

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}\n          got  ${a}\n          want ${e}`);
}

function all(status: CriterionResult["status"], except: Record<number, CriterionResult["status"]> = {}) {
  return Array.from({ length: 11 }, (_, i) => ({
    id: i + 1,
    status: except[i + 1] ?? status,
    reason: "r",
  }));
}

console.log("\ndecide");
check("funding, all pass", decide(true, all("pass")), true);
check("funding, one blocking flag", decide(true, all("pass", { 4: "flag" })), false);
check("funding, co-funding flag is advisory", decide(true, all("pass", { 8: "flag" })), true);
check("funding, na does not count as pass", decide(true, all("pass", { 1: "na" })), false);
check("no funds, money points skipped", decide(false, all("na", { 10: "pass" })), true);
check("no funds, compliance still blocks", decide(false, all("na", { 10: "flag" })), false);
check("missing answers fail", decide(true, []), false);

console.log("\nparseVerdict");
const json = JSON.stringify({ requests_funds: true, criteria: all("pass") });

check(
  "plain JSON",
  parseVerdict(json).criteria.every((c) => c.status === "pass"),
  true
);
check(
  "think block and fences are cut away",
  parseVerdict(`<think>{"nope": 1}</think>\n\`\`\`json\n${json}\n\`\`\``).criteria.length,
  11
);
check(
  "a missing criterion becomes a flag",
  parseVerdict(
    JSON.stringify({ requests_funds: true, criteria: all("pass").slice(0, 10) })
  ).criteria[10].status,
  "flag"
);
check(
  "unknown status becomes a flag",
  parseVerdict(
    JSON.stringify({ requests_funds: true, criteria: all("pass", { 3: "yes" as never }) })
  ).criteria[2].status,
  "flag"
);
check(
  "na on a funding proposal becomes a flag",
  parseVerdict(JSON.stringify({ requests_funds: true, criteria: all("na") })).criteria[0].status,
  "flag"
);
check(
  "na on compliance becomes a flag even with no funds",
  parseVerdict(JSON.stringify({ requests_funds: false, criteria: all("na") })).criteria[9].status,
  "flag"
);
check(
  "requests_funds defaults to true when missing",
  parseVerdict(JSON.stringify({ criteria: all("pass") })).requests_funds,
  true
);
let threw = false;
try {
  parseVerdict("I cannot help with that.");
} catch {
  threw = true;
}
check("prose with no JSON throws", threw, true);

console.log("\ncontentHash");
check("trim-insensitive", contentHash(" T ", "\nB\n") === contentHash("T", "B"), true);
check("body change changes hash", contentHash("T", "B") === contentHash("T", "B2"), false);
check(
  "title/body boundary cannot be shifted",
  contentHash("ab", "c") === contentHash("a", "bc"),
  false
);

console.log(
  failures === 0
    ? `\n${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`
);

process.exit(failures === 0 ? 0 : 1);
