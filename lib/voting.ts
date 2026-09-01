import { countIdentities, identityKey } from "./identity";
import type {
  PairwiseResult,
  TallyResult,
  TallyRound,
  Vote,
  VoteChoice,
  VotingSystem,
} from "./types";

export const VOTING_SYSTEMS: {
  value: VotingSystem;
  label: string;
  description: string;
}[] = [
  {
    value: "single-choice",
    label: "Single choice",
    description: "Each voter picks one option. Voting power goes to that option.",
  },
  {
    value: "approval",
    label: "Approval",
    description:
      "Voters approve as many options as they like. Each approved option receives their full voting power.",
  },
  {
    value: "weighted",
    label: "Weighted",
    description:
      "Voters split their power across options. Useful for budget allocation.",
  },
  {
    value: "quadratic",
    label: "Quadratic",
    description:
      "Power is square-rooted per option, so large holders count for less. Reduces whale dominance.",
  },
  {
    value: "ranked-choice",
    label: "Ranked choice",
    description:
      "Voters rank options. Lowest option is eliminated each round until one holds a majority.",
  },
  {
    value: "copeland",
    label: "Copeland",
    description:
      "Voters rank options. Every option is compared head-to-head against every other, and the one that wins the most matchups wins. Used for multi-seat elections.",
  },
  {
    value: "one-person-one-vote",
    label: "One person, one vote",
    description:
      "Every identity-verified address gets exactly one vote regardless of holdings.",
  },
];

/** Validate a submitted choice against the proposal shape. Throws on bad input. */
export function validateChoice(
  system: VotingSystem,
  choice: VoteChoice,
  choiceCount: number
): void {
  const inRange = (n: number) =>
    Number.isInteger(n) && n >= 1 && n <= choiceCount;

  switch (system) {
    case "single-choice":
    case "one-person-one-vote": {
      if (typeof choice !== "number" || !inRange(choice)) {
        throw new Error("Pick one option.");
      }
      return;
    }
    case "approval": {
      if (!Array.isArray(choice) || choice.length === 0) {
        throw new Error("Approve at least one option.");
      }
      if (!choice.every(inRange)) throw new Error("Option out of range.");
      if (new Set(choice).size !== choice.length) {
        throw new Error("Each option can only be approved once.");
      }
      return;
    }
    case "ranked-choice": {
      if (!Array.isArray(choice) || choice.length !== choiceCount) {
        throw new Error("Rank every option.");
      }
      if (!choice.every(inRange)) throw new Error("Option out of range.");
      if (new Set(choice).size !== choice.length) {
        throw new Error("Each option can only appear once in the ranking.");
      }
      return;
    }
    case "copeland": {
      // A partial ranking is meaningful here: anything left off is simply
      // ranked below everything named, tied with the other omissions.
      if (!Array.isArray(choice) || choice.length === 0) {
        throw new Error("Rank at least one option.");
      }
      if (choice.length > choiceCount) throw new Error("Too many options ranked.");
      if (!choice.every(inRange)) throw new Error("Option out of range.");
      if (new Set(choice).size !== choice.length) {
        throw new Error("Each option can only appear once in the ranking.");
      }
      return;
    }
    case "weighted":
    case "quadratic": {
      if (
        typeof choice !== "object" ||
        choice === null ||
        Array.isArray(choice)
      ) {
        throw new Error("Assign weight to at least one option.");
      }
      const entries = Object.entries(choice as Record<string, number>);
      if (entries.length === 0) throw new Error("Assign weight to at least one option.");
      let sum = 0;
      for (const [k, v] of entries) {
        if (!inRange(Number(k))) throw new Error("Option out of range.");
        if (typeof v !== "number" || v < 0 || !Number.isFinite(v)) {
          throw new Error("Weights must be zero or greater.");
        }
        sum += v;
      }
      if (sum <= 0) throw new Error("Total weight must be greater than zero.");
      return;
    }
    default:
      throw new Error("Unknown voting system.");
  }
}

/** Sum voting power per option for every non-ranked system. */
function tallyDirect(
  system: VotingSystem,
  votes: Vote[],
  choiceCount: number
): number[] {
  const scores = new Array(choiceCount).fill(0);

  for (const vote of votes) {
    const power = vote.voting_power;
    if (power <= 0) continue;
    const choice = vote.choice;

    if (system === "single-choice" || system === "one-person-one-vote") {
      const index = (choice as number) - 1;
      if (scores[index] !== undefined) scores[index] += power;
      continue;
    }

    if (system === "approval") {
      for (const c of choice as number[]) {
        const index = c - 1;
        if (scores[index] !== undefined) scores[index] += power;
      }
      continue;
    }

    // weighted + quadratic share the same input shape
    const weights = choice as Record<string, number>;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total <= 0) continue;

    for (const [key, weight] of Object.entries(weights)) {
      const index = Number(key) - 1;
      if (scores[index] === undefined || weight <= 0) continue;
      const portion = power * (weight / total);
      scores[index] += system === "quadratic" ? Math.sqrt(portion) : portion;
    }
  }

  return scores;
}

/**
 * Instant-runoff. Each round counts every voter's highest-ranked option that
 * is still standing. If nobody holds a majority, the lowest option is
 * eliminated and the round runs again.
 */
function tallyRankedChoice(
  votes: Vote[],
  choiceCount: number
): { scores: number[]; rounds: TallyRound[]; winner: number | null } {
  const standing = new Set<number>(
    Array.from({ length: choiceCount }, (_, i) => i + 1)
  );
  const rounds: TallyRound[] = [];
  let finalScores = new Array(choiceCount).fill(0);
  let winner: number | null = null;

  for (let round = 1; round <= choiceCount; round++) {
    const scores = new Array(choiceCount).fill(0);
    let activePower = 0;

    for (const vote of votes) {
      if (vote.voting_power <= 0) continue;
      const ranking = vote.choice as number[];
      const pick = ranking.find((c) => standing.has(c));
      if (pick === undefined) continue; // ballot exhausted
      scores[pick - 1] += vote.voting_power;
      activePower += vote.voting_power;
    }

    finalScores = scores;

    // Highest standing option this round
    let leader: number | null = null;
    for (const c of standing) {
      if (leader === null || scores[c - 1] > scores[leader - 1]) leader = c;
    }

    if (leader === null || activePower === 0) {
      rounds.push({ round, scores: [...scores], eliminated: null, active_power: activePower });
      break;
    }

    const hasMajority = scores[leader - 1] > activePower / 2;

    if (hasMajority || standing.size <= 1) {
      winner = leader;
      rounds.push({ round, scores: [...scores], eliminated: null, active_power: activePower });
      break;
    }

    // Eliminate the weakest standing option
    let loser: number | null = null;
    for (const c of standing) {
      if (loser === null || scores[c - 1] < scores[loser - 1]) loser = c;
    }
    if (loser === null) break;

    standing.delete(loser);
    rounds.push({ round, scores: [...scores], eliminated: loser, active_power: activePower });
  }

  return { scores: finalScores, rounds, winner };
}


/**
 * Copeland. Every option is run head-to-head against every other option: for
 * each pair, the voting power that ranked A above B is weighed against the
 * power that ranked B above A. Winning a matchup scores 1, a draw scores 0.5.
 *
 * Rankings may be partial. An option a voter left off their ballot is treated
 * as ranked below every option they did name, and tied with the other options
 * they also omitted — so omitting an option is not the same as opposing it.
 *
 * This is the method the DAO's own High Council election used, which is why
 * it exists here rather than being approximated with instant-runoff: the two
 * can and do disagree about who wins.
 */
function tallyCopeland(
  votes: Vote[],
  choiceCount: number
): { scores: number[]; pairwise: PairwiseResult[]; ranking: number[]; winner: number | null } {
  // rank[voter][option] — lower is better. Unranked options share the worst
  // position, which makes them tie with each other and lose to everything named.
  const ballots: { power: number; rank: number[] }[] = [];

  for (const vote of votes) {
    if (vote.voting_power <= 0) continue;
    const order = Array.isArray(vote.choice) ? (vote.choice as number[]) : null;
    if (!order || order.length === 0) continue;

    const rank = new Array(choiceCount + 1).fill(choiceCount + 1);
    order.forEach((option, position) => {
      if (option >= 1 && option <= choiceCount) rank[option] = position;
    });
    ballots.push({ power: vote.voting_power, rank });
  }

  const scores = new Array(choiceCount).fill(0);
  const pairwise: PairwiseResult[] = [];

  for (let a = 1; a <= choiceCount; a++) {
    for (let b = a + 1; b <= choiceCount; b++) {
      let supportA = 0;
      let supportB = 0;

      for (const { power, rank } of ballots) {
        if (rank[a] < rank[b]) supportA += power;
        else if (rank[b] < rank[a]) supportB += power;
        // equal ranks (both unranked) express no preference either way
      }

      let outcome: 1 | 0 | -1;
      if (supportA > supportB) {
        outcome = 1;
        scores[a - 1] += 1;
      } else if (supportB > supportA) {
        outcome = -1;
        scores[b - 1] += 1;
      } else {
        outcome = 0;
        scores[a - 1] += 0.5;
        scores[b - 1] += 0.5;
      }

      pairwise.push({ a, b, supportA, supportB, outcome });
    }
  }

  // Order of finish. Copeland can leave genuine ties at the top (a rock-paper
  // -scissors cycle does exactly that); the lower option number breaks them so
  // the ordering is at least stable and reproducible.
  const ranking = Array.from({ length: choiceCount }, (_, i) => i + 1).sort(
    (x, y) => scores[y - 1] - scores[x - 1] || x - y
  );

  const winner =
    choiceCount > 0 && ballots.length > 0 ? ranking[0] : null;

  return { scores, pairwise, ranking, winner };
}

/**
 * `identityQuorum` counts people, `quorum` counts power, and a proposal that
 * sets both has to clear both. They fail in different ways and neither
 * catches the other: one large holder clears any power threshold alone, and a
 * crowd of small holders clears any people threshold while moving very little
 * weight. Asking both is what makes "the room agreed" mean something.
 */
export function tally(
  system: VotingSystem,
  votes: Vote[],
  choiceCount: number,
  quorum = 0,
  identityQuorum = 0
): TallyResult {
  const voterCount = votes.length;

  // Counted through identityKey, not from votes.length, so this keeps meaning
  // "people" on the day one person's several addresses collapse into one.
  const identityCount = countIdentities(votes);
  const identityQuorumReached =
    identityQuorum <= 0 || identityCount >= identityQuorum;

  if (system === "copeland") {
    const { scores, pairwise, ranking, winner } = tallyCopeland(votes, choiceCount);
    // Copeland scores are matchup wins, not voting power, so participation has
    // to be measured against the power actually cast.
    const participation = votes.reduce((a, v) => a + v.voting_power, 0);
    return {
      system,
      scores,
      total: scores.reduce((a, b) => a + b, 0),
      winner,
      pairwise,
      ranking,
      voterCount,
      identityCount,
      identityQuorumReached,
      participation,
      scoreUnit: "wins",
      quorumReached: quorum <= 0 || participation >= quorum,
    };
  }

  if (system === "ranked-choice") {
    const { scores, rounds, winner } = tallyRankedChoice(votes, choiceCount);
    const total = votes.reduce((a, v) => a + v.voting_power, 0);
    return {
      system,
      scores,
      total,
      winner,
      rounds,
      voterCount,
      identityCount,
      identityQuorumReached,
      participation: total,
      scoreUnit: "power",
      quorumReached: quorum <= 0 || total >= quorum,
    };
  }

  const scores = tallyDirect(system, votes, choiceCount);
  const total = scores.reduce((a, b) => a + b, 0);

  let winner: number | null = null;
  let best = -1;
  scores.forEach((s, i) => {
    if (s > best) {
      best = s;
      winner = i + 1;
    }
  });
  if (best <= 0) winner = null;

  // Quorum measures participation, not the summed score. Approval and
  // quadratic both distort the sum, so use raw power for those.
  const participation =
    system === "approval" || system === "quadratic"
      ? votes.reduce((a, v) => a + v.voting_power, 0)
      : total;

  return {
    system,
    scores,
    total,
    winner,
    voterCount,
    identityCount,
    identityQuorumReached,
    participation,
    scoreUnit: "power",
    quorumReached: quorum <= 0 || participation >= quorum,
  };
}

/**
 * When a ballot was cast, for picking between two from the same person.
 *
 * `signed_at` is the only one of these the voter actually signed; the others
 * are the database's account of when it arrived. Preferred for that reason,
 * and the fallbacks exist because imported history has no signature over this
 * portal's domain and so has no signed time to read.
 */
function ballotTime(vote: Vote): number {
  if (vote.signed_at != null) return vote.signed_at * 1000;
  if (vote.voted_at) return new Date(vote.voted_at).getTime();
  return new Date(vote.created_at).getTime();
}

/**
 * The same ballots, counted one vote per person.
 *
 * This is the second chamber, and it is advisory: it changes no outcome and
 * decides nothing. It exists so a DAO can see both answers to the same
 * question before being asked whether to let the second one count — where the
 * two agree there is nothing to argue about, and where they disagree, that
 * disagreement is the most informative thing on the page.
 *
 * Only meaningful on an identity-gated proposal. Every ballot on one of those
 * passed the access contract to be cast, so flattening the weights leaves a
 * count of verified people rather than a count of whoever turned up. The
 * caller is responsible for not asking otherwise; there is no cheap way to
 * check it here, since eligibility is a chain read per voter.
 *
 * Several ballots from one person collapse to their most recent. That cannot
 * happen today — one address casts one ballot, and every address is its own
 * identity — but it is what should happen the moment `identityKey` learns to
 * group a person's addresses, and deciding it now is easier than discovering
 * it later with a live vote to explain.
 */
export function tallyByIdentity(
  system: VotingSystem,
  votes: Vote[],
  choiceCount: number,
  identityQuorum = 0
): TallyResult {
  const latest = new Map<string, Vote>();

  for (const vote of votes) {
    const key = identityKey(vote.voter);
    const held = latest.get(key);
    if (!held || ballotTime(vote) > ballotTime(held)) latest.set(key, vote);
  }

  // Weight is what separates the chambers, so it is the only thing changed.
  // A zero-power ballot becomes a vote here, which is the point: holding
  // nothing is not the same as not turning up.
  const equal = [...latest.values()].map((vote) => ({
    ...vote,
    voting_power: 1,
  }));

  return tally(system, equal, choiceCount, 0, identityQuorum);
}

/** Human-readable summary of one ballot, for the voters table. */
export function describeChoice(
  system: VotingSystem,
  choice: VoteChoice,
  choices: string[]
): string {
  const name = (n: number) => choices[n - 1] ?? `Option ${n}`;

  switch (system) {
    case "single-choice":
    case "one-person-one-vote":
      return name(choice as number);
    case "approval":
      return (choice as number[]).map(name).join(", ");
    case "ranked-choice":
    case "copeland":
      return (choice as number[])
        .map((c, i) => `${i + 1}. ${name(c)}`)
        .join("  ");
    case "weighted":
    case "quadratic": {
      const weights = choice as Record<string, number>;
      const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
      return Object.entries(weights)
        .filter(([, w]) => w > 0)
        .map(([k, w]) => `${Math.round((w / total) * 100)}% ${name(Number(k))}`)
        .join(", ");
    }
    default:
      return JSON.stringify(choice);
  }
}
