"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { SpaceHeader } from "@/components/space-header";
import { StatStrip } from "@/components/stat-strip";
import { ProposalRow, EmptyRows } from "@/components/proposal-row";
import { useProfiles } from "@/lib/use-profiles";
import { useMyVotes } from "@/lib/use-my-votes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProposals } from "@/lib/use-proposals";
import { proposalState } from "@/lib/utils";

const PREVIEW_COUNT = 6;

/** Section heading with an optional action, so every list is labelled the same way. */
function SectionHead({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4 px-1">
      <h2 className="eyebrow flex items-baseline gap-2 text-muted-foreground">
        {title}
        {count != null && count > 0 && (
          <span className="tabular text-foreground">{count}</span>
        )}
      </h2>
      {children}
    </div>
  );
}

export default function OverviewPage() {
  const { data: proposals, error, isLoading } = useProposals();
  // Every author on the page resolved in one request, then handed to each row.
  const { data: profiles } = useProfiles((proposals ?? []).map((p) => p.author));
  // Which of these the connected wallet has already voted on. One request
  // for the whole list, resolved beside the profiles and passed to each row.
  const { data: mine } = useMyVotes();

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
      <StatStrip />

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-card p-5 text-sm">
          <p className="font-medium">Proposals could not be loaded.</p>
          <p className="mt-1 text-muted-foreground">{error.message}</p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {proposals && (
        <>
          {active.length > 0 && (
            <section>
              <SectionHead title="Open for voting" count={active.length}>
                {/* The primary action belongs beside the thing it acts on, not
                    only pinned to the bottom of the sidebar. */}
                <Button asChild size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
                  <Link href="/create">
                    <Plus className="size-3.5" />
                    New proposal
                  </Link>
                </Button>
              </SectionHead>

              <div className="stagger overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                {active.map((p, i) => (
                  <ProposalRow
                    key={p.id}
                    item={p}
                    index={i}
                    profile={profiles?.[p.author.toLowerCase()]}
                    voted={mine?.has(p.id)}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHead title={active.length > 0 ? "Recently closed" : "Proposals"}>
              <div className="flex items-center gap-2">
                {active.length === 0 && (
                  <Button asChild size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
                    <Link href="/create">
                      <Plus className="size-3.5" />
                      New proposal
                    </Link>
                  </Button>
                )}
                <Link
                  href="/proposals"
                  className="pressable group inline-flex items-center rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View all
                  <ArrowRight className="ml-1 size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </SectionHead>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              {recent.length === 0 && active.length === 0 ? (
                <EmptyRows message="No proposals yet." />
              ) : recent.length === 0 ? (
                <EmptyRows message="No past proposals yet." />
              ) : (
                recent.map((p, i) => (
                  <ProposalRow
                    key={p.id}
                    item={p}
                    index={i}
                    profile={profiles?.[p.author.toLowerCase()]}
                    voted={mine?.has(p.id)}
                  />
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
