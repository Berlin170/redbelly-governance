"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activeChain } from "@/lib/chains";
import { shortAddress } from "@/lib/utils";

export function KycNotice() {
  const { address, isConnected } = useAccount();
  const enabled = isConnected && !!address && !activeChain.testnet;
  const identity = useQuery({
    queryKey: ["wallet-identity", activeChain.id, address?.toLowerCase()],
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: "always",
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/identity?address=${address}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || typeof data.verified !== "boolean" || data.chainId !== activeChain.id) {
        throw new Error("Identity status is unavailable.");
      }
      return data.verified as boolean;
    },
  });

  if (!enabled) return null;

  // A pending or failed request is not evidence that KYC is missing.
  if (identity.isPending || identity.isError) {
    return (
      <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
        <p className="flex-1 text-muted-foreground">
          {identity.isPending ? "Checking wallet verification..." : "We couldn't check this wallet's KYC status. Please try again."}
        </p>
        {identity.isError && (
          <Button variant="outline" className="min-h-11" disabled={identity.isFetching} onClick={() => identity.refetch()}>
            {identity.isFetching ? "Checking..." : "Retry KYC check"}
          </Button>
        )}
      </div>
    );
  }

  if (identity.data) return null;

  return (
    <section role="status" aria-labelledby="kyc-notice-title" className="mb-5 rounded-xl border border-status-pending/40 bg-status-pending/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-status-pending" aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <h2 id="kyc-notice-title" className="text-sm font-semibold">Complete KYC to participate in DAO voting</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Wallet <span className="tabular text-foreground">{shortAddress(address!)}</span> is not currently verified for individual voting on Redbelly.
            {" "}Complete identity verification and enable this wallet at access.redbelly.network, then return here to check again.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You can still browse proposals. Voting eligibility is determined at each proposal&apos;s snapshot, so completing KYC now may not qualify you for a vote already in progress.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild className="min-h-11">
              <a href="https://access.redbelly.network/" target="_blank" rel="noopener noreferrer">
                Complete KYC <ExternalLink className="size-4" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
            <Button variant="outline" className="min-h-11" disabled={identity.isFetching} onClick={() => identity.refetch()}>
              {identity.isFetching ? "Checking..." : "Check again"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
