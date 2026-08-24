"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SpaceHeader } from "@/components/space-header";
import { ProposalRow, EmptyRows } from "@/components/proposal-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useProposals } from "@/lib/use-proposals";
import { proposalState } from "@/lib/utils";

const PREVIEW_COUNT = 6;

export default function OverviewPage() {
  const { data: proposals, error, isLoading } = useProposals();

  const active = (proposals ?? []).filter(
    (p) => proposalState(p.start_at, p.end_at) === "active"
  );

  // Active proposals first — they are the only ones a visitor can still act
  // on — then the most recent history beneath them.
  const recent = (proposals ?? [])
    .filter((p) => proposalState(p.start_at, p.end_at) !== "active")
    .slice(0, PREVIEW_COUNT);

  return (
    <div className="space-y-6">
      <SpaceHeader />

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-card p-5 text-sm">
          <p className="font-medium">Proposals could not be loaded.</p>
          <p className="mt-1 text-muted-foreground">{error.message}</p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {proposals && (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Open for voting
              </h2>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {active.map((p) => (
                  <ProposalRow key={p.id} item={p} />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {active.length > 0 ? "Past proposals" : "Proposals"}
              </h2>
              <Link
                href="/proposals"
                className="inline-flex items-center text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
                <ArrowRight className="ml-1 size-3" />
              </Link>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {recent.length === 0 && active.length === 0 ? (
                <EmptyRows message="No proposals yet." />
              ) : recent.length === 0 ? (
                <EmptyRows message="No past proposals yet." />
              ) : (
                recent.map((p) => <ProposalRow key={p.id} item={p} />)
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
