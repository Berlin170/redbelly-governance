/**
 * What gets pinned to IPFS, and how a stranger checks it.
 *
 * The portal's claim is that a vote can be re-verified without trusting this
 * server. Until now that was only true of imported Snapshot history, which
 * arrived with its own IPFS receipts — so the DAO's borrowed past was more
 * auditable than its own present. A receipt closes that: the exact payload the
 * wallet signed, pinned where we cannot quietly edit it.
 *
 * A receipt is deliberately self-describing. It carries the EIP-712 domain and
 * type definitions alongside the message, so verifying one needs nothing from
 * this repository — any viem or ethers install can rebuild the hash from the
 * file itself. A receipt that only made sense next to our source code would be
 * a receipt you still had to trust us about.
 *
 * Two fields are worth being precise about:
 *
 *   data  is the signed claim, and nothing else. Every byte under it was
 *         covered by the signature in `sig`.
 *   meta  is this server's own bookkeeping — the voting power we measured, the
 *         row it was filed under. The author never signed any of it. It is
 *         kept because a rebuild needs it, and kept separate because mixing
 *         the two would let our arithmetic hide inside their signature.
 */

import { verifyTypedData, getAddress, isAddress } from "viem";
import { domain, voteTypes, proposalTypes, canonicalChoice } from "./eip712";
import type { Proposal, Vote, VoteChoice } from "./types";

export const RECEIPT_VERSION = 1;

export type ReceiptKind = "vote" | "proposal";

interface TypedField {
  name: string;
  type: string;
}

export interface ReceiptData {
  domain: Record<string, unknown>;
  types: Record<string, readonly TypedField[]>;
  primaryType: string;
  /** Numeric fields are plain JSON numbers here; JSON has no bigint. */
  message: Record<string, unknown>;
}

export interface Receipt {
  version: number;
  kind: ReceiptKind;
  /** Who signed. Always equal to `data.message.from`; checked, not assumed. */
  address: string;
  sig: string;
  data: ReceiptData;
  /** Unsigned. This server's record of what it did with the signed claim. */
  meta: Record<string, unknown>;
}

/** The signed part of a vote, as it left the wallet. */
export interface VoteMessageJson {
  from: string;
  space: string;
  proposal: string;
  choice: string;
  reason: string;
  timestamp: number;
}

/** The signed part of a proposal, as it left the wallet. */
export interface ProposalMessageJson {
  from: string;
  space: string;
  title: string;
  body: string;
  choices: string;
  votingSystem: string;
  strategy: string;
  requireVerified: boolean;
  start: number;
  end: number;
  timestamp: number;
}

export function voteReceipt(
  message: VoteMessageJson,
  sig: string,
  meta: {
    proposal_id: string;
    voting_power: number;
    created_at?: string | null;
    vote_id?: string | null;
  }
): Receipt {
  return {
    version: RECEIPT_VERSION,
    kind: "vote",
    address: getAddress(message.from),
    sig,
    data: {
      domain: { ...domain },
      types: voteTypes,
      primaryType: "Vote",
      message: { ...message },
    },
    meta: { ...meta },
  };
}

export function proposalReceipt(
  message: ProposalMessageJson,
  sig: string,
  meta: {
    proposal_id: string;
    snapshot_block?: number | null;
    quorum?: number | null;
    created_at?: string | null;
  }
): Receipt {
  return {
    version: RECEIPT_VERSION,
    kind: "proposal",
    address: getAddress(message.from),
    sig,
    data: {
      domain: { ...domain },
      types: proposalTypes,
      primaryType: "Proposal",
      message: { ...message },
    },
    meta: { ...meta },
  };
}

/**
 * Rebuild the payload a stored vote was signed as.
 *
 * Every field is recovered from columns, which is only possible because
 * migration 006 kept the signed timestamp; ballots older than it, and the
 * imported history, have no timestamp to recover and cannot be rebuilt. The
 * caller is expected to verify the result rather than trust this function —
 * `choice` in particular makes a round trip through the database, and a
 * reconstruction that does not verify is a reconstruction that is wrong.
 */
export function voteMessageFromRow(
  vote: Pick<Vote, "voter" | "choice" | "reason" | "signed_at">,
  proposal: Pick<Proposal, "id" | "space_id">
): VoteMessageJson | null {
  if (vote.signed_at == null) return null;
  return {
    from: getAddress(vote.voter),
    space: proposal.space_id,
    proposal: proposal.id,
    choice: canonicalChoice(vote.choice as VoteChoice),
    reason: vote.reason ?? "",
    timestamp: Number(vote.signed_at),
  };
}

/** The proposal equivalent. Needs `signed_at`, added by migration 008. */
export function proposalMessageFromRow(
  proposal: Pick<
    Proposal,
    | "id"
    | "space_id"
    | "author"
    | "title"
    | "body"
    | "choices"
    | "voting_system"
    | "strategy"
    | "require_verified"
    | "start_at"
    | "end_at"
  > & { signed_at?: number | null }
): ProposalMessageJson | null {
  if (proposal.signed_at == null) return null;
  return {
    from: getAddress(proposal.author),
    space: proposal.space_id,
    title: proposal.title,
    body: proposal.body,
    choices: JSON.stringify(proposal.choices),
    votingSystem: proposal.voting_system,
    strategy: proposal.strategy,
    requireVerified: !!proposal.require_verified,
    start: Math.floor(new Date(proposal.start_at).getTime() / 1000),
    end: Math.floor(new Date(proposal.end_at).getTime() / 1000),
    timestamp: Number(proposal.signed_at),
  };
}

/**
 * EIP-712 numeric fields are integers, and JSON has no integer type wide
 * enough, so they travel as numbers and come back as bigints here. Driven off
 * the receipt's own type list rather than a hardcoded set of field names,
 * because a receipt is supposed to describe itself.
 */
function toTypedMessage(data: ReceiptData) {
  const fields = data.types[data.primaryType];
  if (!fields) throw new Error(`No type definition for ${data.primaryType}`);
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = data.message[field.name];
    if (value === undefined) throw new Error(`Missing field ${field.name}`);
    out[field.name] = /^u?int\d*$/.test(field.type)
      ? BigInt(value as string | number)
      : value;
  }
  return out;
}

export interface ReceiptCheck {
  ok: boolean;
  /** Present when ok is false. Safe to show a human. */
  error?: string;
  /** Whether the receipt was signed over this portal's own EIP-712 domain. */
  ours: boolean;
}

/**
 * Does this file prove what it claims to?
 *
 * Verification runs against the receipt's own domain and types — the answer to
 * "is this signature real" must not depend on our constants. Whether it is a
 * signature over *our* domain is a second, separate question, answered by
 * `ours`: a valid signature from a different governance app is a real
 * signature and still not a Redbelly ballot.
 */
export async function verifyReceipt(receipt: unknown): Promise<ReceiptCheck> {
  const r = receipt as Receipt;
  if (!r || typeof r !== "object") {
    return { ok: false, ours: false, error: "Not an object." };
  }
  if (r.kind !== "vote" && r.kind !== "proposal") {
    return { ok: false, ours: false, error: "Unknown receipt kind." };
  }
  if (!r.data || !r.data.message || !r.data.types) {
    return { ok: false, ours: false, error: "Receipt has no signed data." };
  }
  if (typeof r.sig !== "string" || !r.sig.startsWith("0x")) {
    return { ok: false, ours: false, error: "Receipt has no signature." };
  }

  const from = r.data.message.from;
  if (typeof from !== "string" || !isAddress(from)) {
    return { ok: false, ours: false, error: "Signed payload names no author." };
  }
  // The envelope repeats the author outside the signed data for convenience.
  // Convenience is exactly where a mismatch would hide, so it is checked.
  if (typeof r.address !== "string" || getAddress(r.address) !== getAddress(from)) {
    return {
      ok: false,
      ours: false,
      error: "Envelope address does not match the signed payload.",
    };
  }

  const d = r.data.domain ?? {};
  const ours =
    d.name === domain.name &&
    d.version === domain.version &&
    Number(d.chainId) === Number(domain.chainId);

  try {
    // The types and primary type come out of the file rather than out of this
    // module, which is the point — and it is also why they cannot be checked
    // statically. viem's signature is generic over a known type definition; a
    // receipt's is only known at read time.
    const params = {
      address: getAddress(from),
      domain: {
        name: d.name as string | undefined,
        version: d.version as string | undefined,
        chainId: d.chainId == null ? undefined : Number(d.chainId),
      },
      types: r.data.types,
      primaryType: r.data.primaryType,
      message: toTypedMessage(r.data),
      signature: r.sig as `0x${string}`,
    } as unknown as Parameters<typeof verifyTypedData>[0];

    const valid = await verifyTypedData(params);
    if (!valid) {
      return { ok: false, ours, error: "Signature does not match the payload." };
    }
    return { ok: true, ours };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not verify the receipt.";
    return { ok: false, ours, error: msg };
  }
}
