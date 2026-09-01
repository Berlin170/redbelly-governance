import type { Vote } from "./types";

/**
 * How many distinct people are behind a set of ballots.
 *
 * Every count of *people* in this codebase goes through `identityKey`, and it
 * exists so there is exactly one line to change on the day the protocol can
 * answer the question properly.
 *
 * Today that line lowercases an address, so the count is a count of verified
 * addresses. That is not the same as a count of humans: one Redbelly
 * credential enables several addresses — measured at roughly ten — and
 * nothing in `PermissionUpgradeable` groups addresses by the identity behind
 * them, so a holder of several credentialed wallets is counted several times.
 * lib/voting-power.ts documents the same ceiling from the eligibility side.
 *
 * The honest claim for it is therefore not one person one vote. It is that
 * splitting is *bounded*: a token holder can multiply their weight as far as
 * their balance reaches, but a person cannot multiply their identity beyond
 * the number of addresses the network will credential for one passport. A
 * bounded attack and an unbounded one are different in kind, and no platform
 * that only ever sees wallets can bound this at any number at all.
 *
 * If a per-person nullifier is added — one call returning a stable opaque id
 * for the identity behind an address — this becomes:
 *
 *     export function identityKey(voter: string) { return nullifierFor(voter) }
 *
 * and the ceiling goes to one. Nothing downstream changes: the quorum check,
 * the counts on the results panel, and any future per-person tally are all
 * written against the key rather than the address, precisely so that swap
 * stays a one-line swap.
 */
export function identityKey(voter: string): string {
  return voter.trim().toLowerCase();
}

/**
 * Distinct identities among these ballots.
 *
 * Deliberately not `votes.length`. The two agree today, because one address
 * casts one ballot, and they stop agreeing the moment `identityKey` learns to
 * collapse a person's several addresses into one — which is the whole point
 * of counting this way before that happens rather than after.
 */
export function countIdentities(votes: Pick<Vote, "voter">[]): number {
  const seen = new Set<string>();
  for (const vote of votes) seen.add(identityKey(vote.voter));
  return seen.size;
}

/**
 * Addresses one credential is known to enable, as measured against the live
 * access contract. Quoted in the UI so a DAO setting an identity quorum can
 * see what it is actually buying, rather than being told a number is safe.
 */
export const ADDRESSES_PER_CREDENTIAL = 10;
