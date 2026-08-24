import { tally } from "./voting";
import type { Proposal, TallyResult, Vote } from "./types";

/**
 * Results for display.
 *
 * Imported proposals carry the tally the source already published. Those are
 * shown verbatim rather than recomputed, because a recomputed number that
 * disagrees with the vote the DAO actually held would be worse than useless —
 * and some source voting methods (Copeland, for one) are not tallied the same
 * way here. Proposals created on this portal are always tallied from their
 * signed ballots.
 */
export function resultsFor(proposal: Proposal, votes: Vote[]): TallyResult {
  const scores = proposal.source_scores;

  if (proposal.source === "snapshot" && Array.isArray(scores) && scores.length) {
    const total =
      proposal.source_scores_total ?? scores.reduce((a, b) => a + b, 0);

    let winner: number | null = null;
    let best = 0;
    scores.forEach((s, i) => {
      if (s > best) {
        best = s;
        winner = i + 1;
      }
    });

    const quorum = Number(proposal.quorum) || 0;

    // The headline numbers stay as the source published them, but a Copeland
    // result is only checkable if you can see the matchups behind it — so
    // recompute those from the imported ballots and show them alongside.
    const pairwise =
      proposal.voting_system === "copeland" && votes.length > 0
        ? tally("copeland", votes, proposal.choices.length).pairwise
        : undefined;

    return {
      system: proposal.voting_system,
      scores,
      total,
      winner,
      pairwise,
      voterCount: proposal.source_vote_count ?? votes.length,
      scoreUnit: "power",
      quorumReached: quorum <= 0 || total >= quorum,
    };
  }

  return tally(
    proposal.voting_system,
    votes,
    proposal.choices.length,
    Number(proposal.quorum) || 0
  );
}

/**
 * Share of total power per choice, for the compact bars on proposal rows.
 * Returns percentages that sum to 100 (or all zeroes when nothing is cast).
 */
export function choiceShares(results: TallyResult): number[] {
  if (results.total <= 0) return results.scores.map(() => 0);
  return results.scores.map((s) => (s / results.total) * 100);
}
