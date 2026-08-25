export type VotingSystem =
  | "single-choice"
  | "approval"
  | "weighted"
  | "quadratic"
  | "ranked-choice"
  | "copeland"
  | "one-person-one-vote";

export type VotingStrategy =
  | "native-balance"
  | "erc20-balance"
  | "verified-identity";

export type ProposalState = "pending" | "active" | "closed";

/**
 * How a choice is encoded, per voting system:
 *
 *   single-choice          1                  (1-indexed choice number)
 *   one-person-one-vote    1
 *   approval               [1, 3]             (every picked choice gets full weight)
 *   weighted               { "1": 2, "3": 1 } (shares, normalised on tally)
 *   quadratic              { "1": 2, "3": 1 } (same shape, sqrt applied on tally)
 *   ranked-choice          [3, 1, 2]          (ordered preference, best first)
 *   copeland               [3, 1, 2]          (same shape; tallied pairwise)
 */
export type VoteChoice = number | number[] | Record<string, number>;

export interface Space {
  id: string;
  name: string;
  about: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  symbol: string | null;
  followers_count: number;
  admins: string[];
  members: string[];
  website: string | null;
  twitter: string | null;
  github: string | null;
  discord: string | null;
  snapshot_space: string | null;
}

/** Counts shown on the space header and overview, computed server-side. */
export interface SpaceStats {
  proposalCount: number;
  voteCount: number;
  activeCount: number;
  /** Distinct addresses that have ever cast a ballot in this space. */
  voterCount: number;
  /** Mean ballots per proposal — the honest read on turnout. */
  avgTurnout: number;
  /** Proposals that have closed, used as the denominator for outcomes. */
  closedCount: number;
}

export interface Proposal {
  id: string;
  space_id: string;
  author: string;
  title: string;
  body: string;
  discussion: string | null;
  choices: string[];
  voting_system: VotingSystem;
  strategy: VotingStrategy;
  require_verified: boolean;
  token_address: string | null;
  snapshot_block: number | null;
  quorum: number;
  start_at: string;
  end_at: string;
  created_at: string;
  signature: string | null;
  results_hash: string | null;
  anchor_tx: string | null;

  /**
   * Provenance. `native` proposals were signed on this portal; `snapshot`
   * proposals were imported from the DAO's Snapshot space and carry no
   * signature over our EIP-712 domain, so they are never shown as verified.
   */
  source: "native" | "snapshot";
  source_id: string | null;
  source_url: string | null;
  source_type: string | null;

  /**
   * Final tallies exactly as the source recorded them. When present these are
   * displayed instead of a recomputed tally, so imported numbers always match
   * what the DAO actually voted on.
   */
  source_scores: number[] | null;
  source_scores_total: number | null;
  source_vote_count: number | null;

  /** IPFS receipt at the source, so an imported proposal stays auditable. */
  source_receipt: string | null;

  /** Attached by the list endpoint so cards can show counts without N+1 reads. */
  vote_count?: number;
}

export interface Vote {
  id: string;
  proposal_id: string;
  voter: string;
  choice: VoteChoice;
  voting_power: number;
  reason: string | null;
  /** Null for imported ballots — they carry no signature over our domain. */
  signature: string | null;
  created_at: string;

  source?: "native" | "snapshot";
  source_id?: string | null;
  /** IPFS receipt at the source, so an imported ballot stays auditable. */
  source_receipt?: string | null;
  voted_at?: string | null;
}

/** One head-to-head comparison in a Copeland tally. */
export interface PairwiseResult {
  a: number;
  b: number;
  supportA: number;
  supportB: number;
  /** 1 = a wins the pair, -1 = b wins, 0 = tie. */
  outcome: 1 | 0 | -1;
}

export interface TallyRound {
  round: number;
  scores: number[];
  eliminated: number | null;
  active_power: number;
}

export interface TallyResult {
  system: VotingSystem;
  scores: number[];
  total: number;
  winner: number | null;
  quorumReached: boolean;
  voterCount: number;
  /**
   * What `scores` are counted in. Copeland scores matchup wins; everything
   * else sums voting power. Imported results keep the source's own unit.
   */
  scoreUnit: "power" | "wins";
  rounds?: TallyRound[];
  /** Copeland only: every head-to-head, and the resulting order of finish. */
  pairwise?: PairwiseResult[];
  ranking?: number[];
}

/** A proposal as returned by the list endpoint, with its tally attached. */
export interface ProposalListItem extends Proposal {
  vote_count: number;
  results: TallyResult;
}

export interface Profile {
  address: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  twitter: string | null;
  github: string | null;
  signature: string;
  updated_at: string;
}
