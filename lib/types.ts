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
  /**
   * Distinct verified people who must take part for the vote to carry, on top
   * of whatever `quorum` asks of voting power. 0 means the proposal does not
   * ask. See supabase/migrations/010_identity_quorum.sql for why the two are
   * separate questions.
   */
  identity_quorum: number;
  start_at: string;
  end_at: string;
  created_at: string;
  signature: string | null;
  /**
   * Unix seconds from the signed payload, kept so the stored signature can be
   * rebuilt and re-checked. Null on imported history and on proposals opened
   * before migration 008; those cannot be pinned, because a receipt whose
   * payload cannot be reconstructed proves nothing.
   */
  signed_at?: number | null;
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

  /**
   * IPFS CID of the signed record. Snapshot's own pin on imported proposals,
   * this portal's pin of the EIP-712 envelope on native ones — `source` says
   * which, and receiptUrl() picks the gateway from it.
   */
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
  /**
   * Unix seconds from the signed payload. Published alongside the signature
   * because rebuilding the EIP-712 hash needs it, and a signature nobody can
   * reconstruct the payload for is not something anyone can check. Null on
   * ballots cast before migration 006 and on imported history.
   */
  signed_at: number | null;
  created_at: string;

  source?: "native" | "snapshot";
  source_id?: string | null;
  /** IPFS CID of the signed ballot. See Proposal.source_receipt. */
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
  /**
   * Distinct people behind the ballots, counted through `identityKey` rather
   * than by counting rows — see lib/identity.ts. Equal to `voterCount` while
   * one person can still hold several credentialed addresses.
   */
  identityCount: number;
  /** True when the proposal asks for no identity quorum. */
  identityQuorumReached: boolean;
  voterCount: number;
  /**
   * Voting power actually cast, counting each voter once.
   *
   * Distinct from `total`, which sums the scores. Under approval one voter
   * contributes to several choices, so the summed score exceeds the power in
   * the room and is the wrong denominator for "how much support does this
   * choice have" — a candidate approved by everyone would read as a fraction
   * purely because voters were generous. Quorum already measures against this;
   * the results panel now does too.
   */
  participation: number;
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

/**
 * One member of the space, with what they have done in it. Counts are derived
 * on read from the proposals and votes tables rather than stored, so nothing
 * can drift out of step with the ballots it claims to summarise.
 */
export interface LeaderboardEntry {
  /** As stored — checksummed on native rows, Snapshot's spelling on imports. */
  address: string;
  votes: number;
  proposals: number;
  /** Most recent ballot or proposal, ISO. Null only if both are missing. */
  lastActive: string | null;
}
