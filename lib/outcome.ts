import type { ProposalListItem, TallyResult } from "./types";

export type OutcomeKind =
  | "passed"
  | "rejected"
  | "winner"
  | "no-quorum"
  | "no-votes";

export interface Outcome {
  kind: OutcomeKind;
  /** Short label for the badge — "Passed", "Rejected", or a choice name. */
  label: string;
  /** Longer form for tooltips, where there is room to say why. */
  detail: string;
}

/**
 * Choice names that mean "yes" and "no" in a governance vote. A ballot whose
 * winning choice matches one of these is a decision that can be reported as
 * passed or rejected; anything else — an election, a multi-option allocation —
 * only has a winner, and saying "Passed" about it would be an invention.
 */
const YES = /^(for|yes|approve|approved|accept|in favou?r|aye|支持)\b/i;
const NO = /^(against|no|reject|rejected|decline|nay|oppose)\b/i;

/**
 * What actually happened to a closed proposal.
 *
 * Quorum is checked first: a vote that never reached quorum did not pass, no
 * matter how one-sided the tally looked, and showing it as passed would
 * misreport the DAO's own rules.
 */
export function outcomeOf(
  proposal: Pick<ProposalListItem, "choices">,
  results: TallyResult
): Outcome {
  if (results.total <= 0 || results.winner == null) {
    return {
      kind: "no-votes",
      label: "No votes",
      detail: "Closed without a single ballot cast.",
    };
  }

  if (!results.quorumReached) {
    return {
      kind: "no-quorum",
      label: "No quorum",
      detail: "Closed without reaching the quorum this proposal required.",
    };
  }

  const winning = proposal.choices[results.winner - 1] ?? "";
  const share =
    results.total > 0
      ? ((results.scores[results.winner - 1] ?? 0) / results.total) * 100
      : 0;

  if (YES.test(winning.trim())) {
    return {
      kind: "passed",
      label: "Passed",
      detail: `Carried with ${share.toFixed(0)}% of the voting power.`,
    };
  }

  if (NO.test(winning.trim())) {
    return {
      kind: "rejected",
      label: "Rejected",
      detail: `Defeated with ${share.toFixed(0)}% voting against.`,
    };
  }

  return {
    kind: "winner",
    label: winning,
    detail: `${winning} led with ${share.toFixed(0)}% of the voting power.`,
  };
}
