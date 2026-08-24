import { CHAIN_ID } from "./chains";
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
