/**
 * Write limits.
 *
 * Snapshot sells these as tiers: 5 proposals a day on Basic, 100 on Pro,
 * 10,000 characters on Basic, 50,000 on Pro. Self-hosting means the numbers
 * are ours to set, so they are set here where they can be read and changed
 * rather than discovered by hitting them.
 *
 * They exist for one real reason. Anyone holding a wallet can sign a proposal
 * into this space — there is no admin gate, which is deliberate — so without a
 * ceiling a single address could bury the space in noise for the cost of some
 * signatures. These are spam ceilings, not a product tier.
 */
export const LIMITS = {
  /** Per address, counted over a rolling 24h. Genuine authors never reach it. */
  perAuthorPerDay: 10,
  /** Whole space, rolling 24h. Above Snapshot Pro's 100. */
  perSpacePerDay: 200,
  /** Snapshot Pro allows 50,000. */
  bodyChars: 100_000,
  titleChars: 256,
  choiceChars: 512,
  /** Matches Snapshot Pro exactly. */
  maxChoices: 1000,
  /**
   * A vote's reason is prose beside a ballot, not a second proposal body.
   * Proposals cap every field they store; this one was the gap.
   */
  reasonChars: 5_000,
  /**
   * Avatar uploads per caller over a rolling 24h. The endpoint takes no
   * signature, so this is the only thing standing between it and a loop.
   * High enough that changing your mind about a picture never hits it.
   */
  avatarsPerCallerPerDay: 20,
} as const;

/**
 * How far ahead of our clock a signed payload may be dated.
 *
 * Timestamps decide which of two payloads is newer, so a wildly future one
 * would pin an address to a single ballot it could never revise. Wallets and
 * phones do drift, though, so this is loose enough to forgive a bad clock and
 * tight enough that the drift cannot be useful.
 */
export const MAX_CLOCK_SKEW_SECONDS = 15 * 60;

/**
 * How much RBNT an address must hold to open a proposal.
 *
 * The rate limit above caps how fast one address can post; this decides who
 * may post at all. It is the stronger defence, because it costs something to
 * hold a stake in the outcome, while signatures are free. Snapshot calls the
 * same idea proposal validation.
 *
 * Set to 0 to let any address propose. Space admins are exempt either way, so
 * raising it can never lock the DAO out of its own space.
 */
export const PROPOSAL_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_PROPOSAL_THRESHOLD ?? 1000
);

/** Rolling window start for the per-day counts. */
export function dayAgo(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}
