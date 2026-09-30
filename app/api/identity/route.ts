import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { isIdentityVerified } from "@/lib/voting-power";
import { activeChain } from "@/lib/chains";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };

// Current identity status is guidance only. Votes still use the proposal snapshot.
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400, headers });
  }
  try {
    const verified = await isIdentityVerified(getAddress(address));
    return NextResponse.json({ verified, chainId: activeChain.id }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Identity verification status is temporarily unavailable. Please try again." },
      { status: 503, headers },
    );
  }
}
