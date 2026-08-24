"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ProposalRow, EmptyRows } from "@/components/proposal-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useProposals } from "@/lib/use-proposals";
import { proposalState } from "@/lib/utils";
import type { ProposalState } from "@/lib/types";

const TABS = [
  { value: "active", label: "Active", empty: "Nothing is open for voting right now." },
  { value: "pending", label: "Upcoming", empty: "No proposals are scheduled." },
  { value: "closed", label: "Closed", empty: "No proposals have closed yet." },
] as const;

function ProposalsList() {
  const params = useSearchParams();
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const { data: proposals, error, isLoading } = useProposals();

  const filtered = useMemo(() => {
    if (!proposals) return [];
    if (!query) return proposals;
    return proposals.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.body.toLowerCase().includes(query) ||
        p.author.toLowerCase().includes(query)
    );
  }, [proposals, query]);

  const byState = (state: ProposalState) =>
    filtered.filter((p) => proposalState(p.start_at, p.end_at) === state);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-card p-5 text-sm">
        <p className="font-medium">Proposals could not be loaded.</p>
        <p className="mt-1 text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // Land on whichever tab actually has something in it, so a search that only
  // matches closed proposals does not open on an empty Active tab.
  const initial =
    byState("active").length > 0
      ? "active"
      : byState("pending").length > 0
        ? "pending"
        : "closed";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {query ? (
            <>
              <span className="tabular">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "result" : "results"} for{" "}
              <span className="text-foreground">&ldquo;{query}&rdquo;</span>
            </>
          ) : (
            "Signature voting on Redbelly. No gas, no subscription."
          )}
        </p>
      </div>

      <Tabs key={initial} defaultValue={initial}>
        <TabsList>
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
              <span className="tabular ml-1.5 text-xs text-muted-foreground">
                {byState(value).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(({ value, empty }) => (
          <TabsContent key={value} value={value} className="mt-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {byState(value).length === 0 ? (
                <EmptyRows message={query ? "No proposals match that search." : empty} />
              ) : (
                byState(value).map((p) => <ProposalRow key={p.id} item={p} />)
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function ProposalsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <ProposalsList />
    </Suspense>
  );
}
