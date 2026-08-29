/**
 * Tally tests. Run with:  npm run test
 *
 * These cover the counting rules the DAO's results actually depend on. A bug
 * in here would not throw or look wrong on screen — it would quietly declare
 * the wrong winner — so the cases are written against known-correct outcomes
 * rather than against whatever the implementation currently returns.
 */

import { tally } from "../lib/voting";
import type { Vote } from "../lib/types";

let failures = 0;
let checks = 0;

function ballot(power: number, choice: Vote["choice"]): Vote {
  return {
    id: Math.random().toString(36).slice(2),
    proposal_id: "p",
    voter: "0x0000000000000000000000000000000000000000",
    choice,
    voting_power: power,
    reason: null,
    signature: null,
    signed_at: null,
    created_at: new Date().toISOString(),
  };
}

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

// --------------------------------------------------------------- copeland
console.log("\ncopeland");

{
  // Option 1 is ranked first on every ballot, so it wins both its matchups.
  // Options 2 and 3 split their head-to-head, taking half a point each.
  const r = tally("copeland", [ballot(1, [1, 2, 3]), ballot(1, [1, 3, 2])], 3);
  check("unanimous first preference wins", r.winner, 1);
  check("draw splits the point", r.scores, [2, 0.5, 0.5]);
}

{
  // Condorcet cycle: A beats B, B beats C, C beats A. Nobody is a true winner
  // and every option must score exactly one matchup win.
  const r = tally(
    "copeland",
    [ballot(1, [1, 2, 3]), ballot(1, [2, 3, 1]), ballot(1, [3, 1, 2])],
    3
  );
  check("cycle leaves every option tied", r.scores, [1, 1, 1]);
  check("cycle still resolves deterministically", r.winner, 1);
}

{
  // Matchups are decided by voting power, never by number of ballots.
  const r = tally("copeland", [ballot(100, [2, 1]), ballot(1, [1, 2])], 2);
  check("power decides a matchup, not headcount", r.winner, 2);
}

{
  // Omitting an option ranks it last — but tied with the other omissions,
  // not beaten by them.
  const r = tally("copeland", [ballot(1, [3])], 3);
  check("partial ballot elects what it ranked", r.winner, 3);
  check("omitted options tie with each other", r.scores, [0.5, 0.5, 2]);
}

{
  const r = tally("copeland", [ballot(7, [1, 2]), ballot(3, [2, 1])], 2);
  check("pairwise support is reported", r.pairwise, [
    { a: 1, b: 2, supportA: 7, supportB: 3, outcome: 1 },
  ]);
}

{
  check("no ballots elects nobody", tally("copeland", [], 3).winner, null);
  check(
    "zero-power ballots elect nobody",
    tally("copeland", [ballot(0, [1, 2, 3])], 3).winner,
    null
  );
}

// ---------------------------------------------------------- ranked-choice
console.log("\nranked-choice");

{
  // 1 leads on first preferences but 3 is eliminated and transfers to 2,
  // which is the whole point of instant-runoff: the leader can still lose.
  const r = tally(
    "ranked-choice",
    [
      ballot(4, [1, 2, 3]),
      ballot(3, [2, 1, 3]),
      ballot(2, [3, 2, 1]),
    ],
    3
  );
  check("transfers can overturn the first-round lead", r.winner, 2);
}

// ------------------------------------------------------------ other rules
console.log("\nother systems");

{
  const r = tally("single-choice", [ballot(5, 1), ballot(9, 2)], 2);
  check("single-choice sums power per option", r.scores, [5, 9]);
}

{
  // Approval gives each approved option the voter's full weight, so the
  // scores deliberately sum to more than the power cast.
  const r = tally("approval", [ballot(5, [1, 2])], 2);
  check("approval gives full weight to each pick", r.scores, [5, 5]);
}

{
  // The denominator the results panel divides by. Summing the scores would
  // report each of these as 50% when in truth every voter approved both, so
  // participation counts each voter once however many boxes they ticked.
  const both = tally("approval", [ballot(1, [1, 2]), ballot(1, [1, 2])], 3);
  check("approval participation counts voters, not approvals", both.participation, 2);
  check("approval scores still sum above participation", both.total, 4);
  check(
    "a choice everyone approved is a full share of the power cast",
    (both.scores[0] / both.participation) * 100,
    100
  );

  // And a choice nobody picked stays at nothing.
  check("an unapproved choice scores zero", both.scores[2], 0);

  // Single choice is unaffected: there, the two denominators coincide.
  const single = tally("single-choice", [ballot(3, 1), ballot(1, 2)], 2);
  check("single choice participation equals its total", single.participation, single.total);
}

{
  // Weighted splits power by share of the weights, not by raw weight.
  const r = tally("weighted", [ballot(9, { "1": 2, "2": 1 })], 2);
  check("weighted splits power proportionally", r.scores, [6, 3]);
}

{
  const r = tally("single-choice", [ballot(10, 1)], 2, 50);
  check("quorum below threshold is not reached", r.quorumReached, false);
  check(
    "quorum at threshold is reached",
    tally("single-choice", [ballot(50, 1)], 2, 50).quorumReached,
    true
  );
}

console.log(
  failures === 0
    ? `\n${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`
);

process.exit(failures === 0 ? 0 : 1);
