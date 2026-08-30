"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { ProposalRow, EmptyRows } from "@/components/proposal-row";
import { useProfiles } from "@/lib/use-profiles";
import { useMyVotes } from "@/lib/use-my-votes";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHead } from "@/components/page-head";
import { Skeleton } from "@/components/ui/skeleton";
import { outcomeOf, type OutcomeKind } from "@/lib/outcome";
import { useProposals } from "@/lib/use-proposals";
import { proposalState } from "@/lib/utils";
import type { ProposalListItem } from "@/lib/types";

type Lane = "all" | "active" | "pending" | "closed";
type SortKey = "newest" | "oldest" | "votes" | "ending";

const LANES: { value: Lane; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Upcoming" },
  { value: "closed", label: "Closed" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "votes", label: "Most votes" },
  { value: "ending", label: "Ending soon" },
];

const OUTCOMES: { value: OutcomeKind | "any"; label: string }[] = [
  { value: "any", label: "Any outcome" },
  { value: "passed", label: "Passed" },
  { value: "rejected", label: "Rejected" },
  { value: "winner", label: "Elected" },
  { value: "no-quorum", label: "No quorum" },
];

const EMPTY: Record<Lane, string> = {
  all: "No proposals yet.",
  active: "Nothing is open for voting right now.",
  pending: "No proposals are scheduled.",
  closed: "No proposals have closed yet.",
};

/**
 * Lifecycle drives the tabs and outcome is a separate control, because they
 * answer different questions — "can I still vote on this" versus "how did it
 * land". Folding both into one row of tabs would put every election in a
 * bucket labelled neither Passed nor Rejected, where nobody would find it.
 */
function sortProposals(items: ProposalListItem[], key: SortKey) {
  const at = (iso: string) => new Date(iso).getTime();

  return [...items].sort((a, b) => {
    switch (key) {
      case "oldest":
        return at(a.created_at) - at(b.created_at);
      case "votes":
        return b.vote_count - a.vote_count;
      case "ending": {
        // Live proposals first, soonest deadline at the top; everything that
        // has already closed sinks below them in reverse-chronological order.
        const now = Date.now();
        const aLive = at(a.end_at) >= now;
        const bLive = at(b.end_at) >= now;
        if (aLive !== bLive) return aLive ? -1 : 1;
        return aLive
          ? at(a.end_at) - at(b.end_at)
          : at(b.end_at) - at(a.end_at);
      }
      default:
        return at(b.created_at) - at(a.created_at);
    }
  });
}

function ProposalsList() {
  const params = useSearchParams();
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const { data: proposals, error, isLoading } = useProposals();
  // Every author on the page resolved in one request, then handed to each row.
  const { data: profiles } = useProfiles((proposals ?? []).map((p) => p.author));
  // Which of these the connected wallet has already voted on. One request
  // for the whole list, resolved beside the profiles and passed to each row.
  const { data: mine } = useMyVotes();

  const [lane, setLane] = useState<Lane>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [outcome, setOutcome] = useState<OutcomeKind | "any">("any");

  const searched = useMemo(() => {
    if (!proposals) return [];
    if (!query) return proposals;
    return proposals.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.body.toLowerCase().includes(query) ||
        p.author.toLowerCase().includes(query)
    );
  }, [proposals, query]);

  const counts = useMemo(() => {
    const base: Record<Lane, number> = {
      all: searched.length,
      active: 0,
      pending: 0,
      closed: 0,
    };
    for (const p of searched) base[proposalState(p.start_at, p.end_at)] += 1;
    return base;
  }, [searched]);

  const visible = useMemo(() => {
    let rows = searched.filter(
      (p) => lane === "all" || proposalState(p.start_at, p.end_at) === lane
    );

    if (outcome !== "any") {
      rows = rows.filter((p) => {
        if (proposalState(p.start_at, p.end_at) !== "closed") return false;
        return outcomeOf(p, p.results).kind === outcome;
      });
    }

    return sortProposals(rows, sort);
  }, [searched, lane, outcome, sort]);

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
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const filtered = outcome !== "any" || lane !== "all" || query.length > 0;

  return (
    <div className="space-y-4">
      <PageHead
        title="Proposals"
        action={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/create">
              <Plus className="size-4" />
              New proposal
            </Link>
          </Button>
        }
      >
        {query ? (
          <>
            <span className="tabular">{searched.length}</span>{" "}
            {searched.length === 1 ? "result" : "results"} for{" "}
            <span className="text-foreground">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          "Signature voting on Redbelly. No gas, no subscription."
        )}
      </PageHead>

      {/* Filters live in one row above the list, so the controls that change
          what you see never get separated from the thing they change. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={lane} onValueChange={(v) => setLane(v as Lane)}>
          <TabsList>
            {LANES.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
                <span className="tabular ml-1.5 text-xs text-muted-foreground">
                  {counts[value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Select
            value={outcome}
            onValueChange={(v) => setOutcome(v as OutcomeKind | "any")}
          >
            <SelectTrigger className="h-8 w-[9.5rem] text-xs" aria-label="Outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTCOMES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-[8.5rem] text-xs" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {visible.length === 0 ? (
          <EmptyRows
            message={
              filtered
                ? "No proposals match these filters."
                : EMPTY[lane]
            }
          />
        ) : (
          visible.map((p) => <ProposalRow
                    key={p.id}
                    item={p}
                    profile={profiles?.[p.author.toLowerCase()]}
                    voted={mine?.has(p.id)}
                  />)
        )}
      </div>
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
