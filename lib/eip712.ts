import { CHAIN_ID } from "./chains";
import { normalizeProfile } from "./profile-fields";
import type { VoteChoice } from "./types";

/**
 * Votes and proposals are signed, not transacted. Nothing here costs gas.
 * The signature is what proves authorship, and anyone can re-verify it
 * against the stored payload without trusting this server.
 */
export const domain = {
  name: "Redbelly Governance",
  version: "1",
  chainId: CHAIN_ID,
} as const;

export const voteTypes = {
  Vote: [
    { name: "from", type: "address" },
    { name: "space", type: "string" },
    { name: "proposal", type: "string" },
    { name: "choice", type: "string" },
    { name: "reason", type: "string" },
    { name: "timestamp", type: "uint64" },
  ],
} as const;

export const proposalTypes = {
  Proposal: [
    { name: "from", type: "address" },
    { name: "space", type: "string" },
    { name: "title", type: "string" },
    { name: "body", type: "string" },
    { name: "choices", type: "string" },
    { name: "votingSystem", type: "string" },
    { name: "strategy", type: "string" },
    { name: "requireVerified", type: "bool" },
    { name: "start", type: "uint64" },
    { name: "end", type: "uint64" },
    { name: "timestamp", type: "uint64" },
  ],
} as const;

export const followTypes = {
  Follow: [
    { name: "from", type: "address" },
    { name: "space", type: "string" },
    { name: "following", type: "bool" },
    { name: "timestamp", type: "uint64" },
  ],
} as const;

export const profileTypes = {
  Profile: [
    { name: "from", type: "address" },
    { name: "displayName", type: "string" },
    { name: "bio", type: "string" },
    { name: "avatar", type: "string" },
    { name: "twitter", type: "string" },
    { name: "github", type: "string" },
    { name: "timestamp", type: "uint64" },
  ],
} as const;

export interface ProfileMessage {
  from: `0x${string}`;
  displayName: string;
  bio: string;
  avatar: string;
  twitter: string;
  github: string;
  timestamp: bigint;
}

/**
 * Every field is signed, empty ones included. Signing only what was filled in
 * would let a cleared bio be replayed as if it were never cleared, so absent
 * is spelled "" and is as much a part of the claim as any text.
 *
 * Fields are normalised here, before the wallet sees them, so the string that
 * gets signed is the string that gets stored. The server re-derives the same
 * values and refuses anything that disagrees, which is what makes a stored
 * profile re-verifiable against its own signature.
 */
export function buildProfileMessage(params: {
  from: `0x${string}`;
  displayName?: string;
  bio?: string;
  avatar?: string;
  twitter?: string;
  github?: string;
}): ProfileMessage {
  return {
    from: params.from,
    ...normalizeProfile(params),
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  };
}

export interface FollowMessage {
  from: `0x${string}`;
  space: string;
  following: boolean;
  timestamp: bigint;
}

export function buildFollowMessage(params: {
  from: `0x${string}`;
  space: string;
  following: boolean;
}): FollowMessage {
  return {
    from: params.from,
    space: params.space,
    following: params.following,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  };
}

export interface VoteMessage {
  from: `0x${string}`;
  space: string;
  proposal: string;
  choice: string;
  reason: string;
  timestamp: bigint;
}

export interface ProposalMessage {
  from: `0x${string}`;
  space: string;
  title: string;
  body: string;
  choices: string;
  votingSystem: string;
  strategy: string;
  requireVerified: boolean;
  start: bigint;
  end: bigint;
  timestamp: bigint;
}

/**
 * Choices are signed as canonical JSON so the string the wallet signs is
 * byte-identical to the string the server verifies. Object key order is
 * sorted for exactly that reason.
 */
export function canonicalChoice(choice: VoteChoice): string {
  if (typeof choice === "number") return JSON.stringify(choice);
  if (Array.isArray(choice)) return JSON.stringify(choice);
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(choice).sort((a, b) => Number(a) - Number(b))) {
    sorted[key] = choice[key];
  }
  return JSON.stringify(sorted);
}

export function buildVoteMessage(params: {
  from: `0x${string}`;
  space: string;
  proposal: string;
  choice: VoteChoice;
  reason?: string;
}): VoteMessage {
  return {
    from: params.from,
    space: params.space,
    proposal: params.proposal,
    choice: canonicalChoice(params.choice),
    reason: params.reason ?? "",
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  };
}
