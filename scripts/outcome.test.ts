/**
 * What a closed proposal is reported to have decided. Run with:  npm run test
 *
 * `outcomeOf` is the single answer to the only question a governance link is
 * asked, and four surfaces now read it: the proposals list, the row on that
 * list, the proposal page, and the card a link unfurls into in Discord or X.
 * They were consolidated onto it precisely so they could not disagree — which
 * also means a regression here misreports a DAO decision in four places at
 * once, quietly, with every screen agreeing on the wrong answer.
 *
 * The cases below are the ones where being wrong changes what the DAO is told
 * happened, not the ones that are easy to write.
 */

import { outcomeOf } from "../lib/outcome";
import type { TallyResult } from "../lib/types";

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

/** A tally with the fields outcomeOf reads; the rest are along for the ride. */
function tally(part: Partial<TallyResult>): TallyResult {
  return {
    system: "single-choice",
    scores: [],
    total: 0,
    winner: null,
    quorumReached: true,
    voterCount: 0,
    participation: 0,
    scoreUnit: "power",
    ...part,
  };
}

const forAgainst = { choices: ["For", "Against", "Abstain"] };

console.log("\nnothing was decided");
{
  check(
    "no votes at all",
    outcomeOf(forAgainst, tally({ total: 0, winner: null })).kind,
    "no-votes"
  );

  // total > 0 with no winner is a tie the tally could not break. It is not a
  // decision, and reporting it as one would invent a result.
  check(
    "power cast but no winner",
    outcomeOf(forAgainst, tally({ total: 10, winner: null })).kind,
    "no-votes"
  );
}

console.log("\nquorum is checked before the winner");
{
  /*
    The ordering that matters most in the file.

    A vote can be entirely one-sided and still have failed, because the DAO's
    own rule is that too few people took part for it to count. If the winner
    were read first, this would report "Passed" — a proposal announced as
    carried that the DAO's rules say did not carry.
  */
  check(
    "a unanimous For that missed quorum did not pass",
    outcomeOf(forAgainst, tally({ scores: [100, 0, 0], total: 100, winner: 1, quorumReached: false })).kind,
    "no-quorum"
  );

  check(
    "a unanimous Against that missed quorum is not a rejection either",
    outcomeOf(forAgainst, tally({ scores: [0, 100, 0], total: 100, winner: 2, quorumReached: false })).kind,
    "no-quorum"
  );

  // No votes and no quorum: report the emptier fact, which explains itself.
  check(
    "no votes outranks no quorum",
    outcomeOf(forAgainst, tally({ total: 0, winner: null, quorumReached: false })).kind,
    "no-votes"
  );
}

console.log("\nyes and no are decisions");
{
  check(
    "For carries",
    outcomeOf(forAgainst, tally({ scores: [7, 3, 0], total: 10, winner: 1 })).label,
    "Passed"
  );
  check(
    "Against defeats",
    outcomeOf(forAgainst, tally({ scores: [3, 7, 0], total: 10, winner: 2 })).label,
    "Rejected"
  );

  // The share of the winning choice, printed in the tooltip and the card.
  check(
    "the detail quotes the winner's share",
    outcomeOf(forAgainst, tally({ scores: [7, 3, 0], total: 10, winner: 1 })).detail,
    "Carried with 70% of the voting power."
  );

  for (const [word, expected] of [
    ["Yes", "Passed"],
    ["Approve", "Passed"],
    ["Accept", "Passed"],
    ["In favour", "Passed"],
    ["In favor", "Passed"],
    ["Aye", "Passed"],
    ["No", "Rejected"],
    ["Reject", "Rejected"],
    ["Decline", "Rejected"],
    ["Nay", "Rejected"],
    ["Oppose", "Rejected"],
  ] as const) {
    check(
      `"${word}" reads as ${expected}`,
      outcomeOf({ choices: [word, "Other"] }, tally({ scores: [1, 0], total: 1, winner: 1 })).label,
      expected
    );
  }

  check(
    "case and surrounding space do not matter",
    outcomeOf({ choices: ["  fOr  ", "Against"] }, tally({ scores: [1, 0], total: 1, winner: 1 })).label,
    "Passed"
  );
}

console.log("\na choice that merely starts with a decision word is not one");
{
  /*
    The regexes are anchored and end at a word boundary for this reason. The
    DAO's real history contains "Formalise the previously agreed structure…",
    and a prefix match on /^for/ would announce that as Passed on every screen
    including the card that gets shared.
  */
  check(
    "Formalise is not For",
    outcomeOf({ choices: ["Formalise the treasury structure", "Something else"] },
      tally({ scores: [1, 0], total: 1, winner: 1 })).kind,
    "winner"
  );
  check(
    "Nayland is not Nay",
    outcomeOf({ choices: ["Nayland", "Other"] }, tally({ scores: [1, 0], total: 1, winner: 1 })).kind,
    "winner"
  );
  check(
    "Norman is not No",
    outcomeOf({ choices: ["Norman", "Other"] }, tally({ scores: [1, 0], total: 1, winner: 1 })).kind,
    "winner"
  );
  check(
    "Approve is still Approve",
    outcomeOf({ choices: ["Approve", "Other"] }, tally({ scores: [1, 0], total: 1, winner: 1 })).kind,
    "passed"
  );
}

console.log("\nan election has a winner, not a verdict");
{
  const election = { choices: ["Buffy", "Willow", "Xander"] };

  // Saying a candidate "Passed" would be an invention: nobody voted on a
  // proposition, they picked a person.
  const r = outcomeOf(election, tally({ scores: [5, 3, 2], total: 10, winner: 1 }));
  check("the label is the winning choice", r.label, "Buffy");
  check("the kind is winner, not passed", r.kind, "winner");
  check("the detail names the winner", r.detail, "Buffy led with 50% of the voting power.");

  // A vote whose choices are numbered: the badge said a bare "6", which is
  // why the card now prefixes it and the badge carries a cup.
  check(
    "a numbered choice still comes back as its own name",
    outcomeOf({ choices: ["1", "2", "3"] }, tally({ scores: [0, 9, 0], total: 9, winner: 2 })).label,
    "2"
  );
}

console.log("\nmalformed input is answered, not thrown at");
{
  // winner is 1-indexed; a tally naming a choice that does not exist must not
  // crash the list for every other proposal on the page.
  check(
    "a winner past the end of choices",
    outcomeOf({ choices: ["For", "Against"] }, tally({ scores: [1, 0], total: 1, winner: 9 })).kind,
    "winner"
  );
  check(
    "no choices at all",
    outcomeOf({ choices: [] }, tally({ total: 1, winner: 1 })).kind,
    "winner"
  );
}

console.log(
  failures === 0
    ? `\n${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`
);

process.exit(failures === 0 ? 0 : 1);
