/**
 * Settings shared by the browser and the server for Self verification.
 *
 * Both halves have to agree on the scope and the endpoint byte for byte:
 * Self hashes the two together into the proof, and the verifier recomputes
 * that hash to check the proof was made for this portal. Reading both from
 * one module is what keeps them from drifting.
 *
 * Off until `NEXT_PUBLIC_SELF_SCOPE` is set, like every other optional
 * integration here: an unset feature should look absent, not broken.
 */

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://redbelly-governance.vercel.app";

/** Self allows at most 31 ASCII characters. */
export const SELF_SCOPE = process.env.NEXT_PUBLIC_SELF_SCOPE ?? "";

/**
 * Where the Self app posts the proof. Has to be public HTTPS: the proof is
 * sent from the member's phone, not from their browser, so localhost never
 * works. Set `NEXT_PUBLIC_SITE_URL` on preview deployments.
 */
export const SELF_ENDPOINT =
  process.env.NEXT_PUBLIC_SELF_ENDPOINT ??
  `${SITE.replace(/\/$/, "")}/api/personhood/verify`;

/**
 * Staging accepts Self's mock documents and verifies against Celo's testnet,
 * so the flow can be rehearsed without a real passport. Never on in
 * production: a mock document is exactly what the feature exists to refuse.
 *
 * "Never" is enforced, not just documented. One env var copied to the wrong
 * environment would otherwise let anyone bind wallets with Self's demo
 * passports, and nothing on screen would look wrong. On a production
 * deployment the flag is ignored whatever it says. The server reads
 * `VERCEL_ENV`; the browser only sees `NEXT_PUBLIC_VERCEL_ENV`, and if it
 * disagrees the scan simply fails, which is the safe way round.
 */
const PRODUCTION =
  process.env.VERCEL_ENV === "production" ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

export const SELF_MOCK = process.env.NEXT_PUBLIC_SELF_MOCK === "true" && !PRODUCTION;

export const personhoodEnabled = SELF_SCOPE.length > 0;

/** How long a member has to finish the scan after signing. */
export const SESSION_MINUTES = 15;

/** Self's attestation ids, as a member would name the document. */
export function documentLabel(attestationId: number | null | undefined): string {
  switch (attestationId) {
    case 1:
      return "passport";
    case 2:
      return "national ID card";
    case 3:
      return "Aadhaar";
    case 4:
      return "ID card";
    default:
      return "identity document";
  }
}
