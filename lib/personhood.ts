import { AllIds, DefaultConfigStore, SelfBackendVerifier } from "@selfxyz/core";
import { supabaseAdmin } from "./supabase";
import { isMissingTable } from "./pg-errors";
import { SELF_ENDPOINT, SELF_MOCK, SELF_SCOPE } from "./personhood-config";

/**
 * Server half of Self verification: the verifier, and the one question the
 * rest of the portal asks of it — which person, if any, is behind a wallet.
 *
 * Everything here is optional in the same way IPFS receipts are. With no
 * scope configured, or with migration 012 not yet run, every wallet reads as
 * unbound and voting behaves exactly as it did before.
 */

export interface PersonhoodBinding {
  /** Opaque. This, not the nullifier, is what gets stamped on ballots. */
  id: string;
  address: string;
  attestation_id: number;
  bound_at: string;
}

export type BindingLookup =
  | { state: "bound"; binding: PersonhoodBinding }
  | { state: "unbound" }
  /** Migration 012 has not been run. Not the same as "this wallet is unbound". */
  | { state: "not-installed" };

/**
 * The binding for one wallet.
 *
 * Throws on a real database error rather than answering "unbound", for the
 * same reason the identity check does: on a strict proposal the two errors
 * are not equal. Refusing a person is loud and they say so; quietly reading a
 * bound wallet as unbound would count them as nobody.
 */
export async function bindingFor(address: string): Promise<BindingLookup> {
  const { data, error } = await supabaseAdmin()
    .from("personhood_bindings")
    .select("id, address, attestation_id, bound_at")
    .eq("address", address.toLowerCase())
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return { state: "not-installed" };
    throw new Error("One-person verification status is temporarily unavailable.");
  }
  return data ? { state: "bound", binding: data as PersonhoodBinding } : { state: "unbound" };
}

/**
 * May this binding vote on a strict proposal?
 *
 * Bound before the proposal was created, or not at all. The same freeze the
 * snapshot block applies to balances and to Redbelly's access contract: once
 * a vote is open, nobody can look at the tally and go and bind more wallets.
 */
export function boundInTime(
  binding: PersonhoodBinding,
  proposal: { created_at: string }
): boolean {
  return new Date(binding.bound_at).getTime() <= new Date(proposal.created_at).getTime();
}

let verifier: SelfBackendVerifier | null = null;

/**
 * Verifies a Self proof against Self's registry on Celo.
 *
 * Nothing is disclosed: no name, no date of birth, no nationality, no OFAC
 * screen. The portal needs to know one thing — has this document been seen
 * before — and the nullifier answers that without anything else. Asking for
 * less is also what keeps the request identical across a passport, a NIC and
 * Aadhaar, so every member gets the same flow.
 *
 * Every document type Self supports is accepted. The DAO's members hold very
 * different documents, and turning any of them away would turn those members
 * away.
 */
export function selfVerifier(): SelfBackendVerifier {
  if (!verifier) {
    verifier = new SelfBackendVerifier(
      SELF_SCOPE,
      SELF_ENDPOINT,
      SELF_MOCK,
      AllIds,
      new DefaultConfigStore({}),
      "uuid"
    );
  }
  return verifier;
}
