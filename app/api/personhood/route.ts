import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { bindingFor } from "@/lib/personhood";
import { documentLabel, personhoodEnabled } from "@/lib/personhood-config";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/**
 * GET /api/personhood?address=0x… — is this wallet bound to a Self identity?
 *
 * Answers yes or no, which document kind, and since when. Never the nullifier:
 * that number is the link between a wallet and a document, and the whole
 * point of keeping it server-side is that nobody can collect them.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400, headers });
  }
  if (!personhoodEnabled) {
    return NextResponse.json({ enabled: false, bound: false }, { headers });
  }

  try {
    const lookup = await bindingFor(address);
    if (lookup.state === "not-installed") {
      return NextResponse.json({ enabled: false, bound: false }, { headers });
    }
    if (lookup.state === "unbound") {
      return NextResponse.json({ enabled: true, bound: false }, { headers });
    }
    return NextResponse.json(
      {
        enabled: true,
        bound: true,
        document: documentLabel(lookup.binding.attestation_id),
        boundAt: lookup.binding.bound_at,
      },
      { headers }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Status unavailable.";
    return NextResponse.json({ error: msg }, { status: 503, headers });
  }
}
