"use client";

import Link from "next/link";
import { CheckCircle2, MinusCircle, Clock } from "lucide-react";
import { AddressAvatar } from "@/components/address-avatar";
import { Badge } from "@/components/ui/badge";
import { choiceShares } from "@/lib/results";
import {
  proposalState,
  shortAddress,
  shortProposalId,
  timeAgo,
  timeLeft,
} from "@/lib/utils";
import type { ProposalListItem } from "@/lib/types";

const CHART = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * A single stacked bar showing how the power actually split, rather than one
 * bar per choice. At list density this is the only readable form — it gives
 * the outcome at a glance without stealing the row's height.
 */
function ResultBar({ item }: { item: ProposalListItem }) {
  const shares = choiceShares(item.results);
  const cast = item.results.total > 0;

  return (
    <div className="w-full sm:w-40">
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-secondary">
        {cast &&
          shares.map((share, i) =>
            share <= 0 ? null : (
              <span
                key={i}
                style={{
                  width: `${share}%`,
                  backgroundColor: CHART[i % CHART.length],
                }}
                title={`${item.choices[i]} — ${share.toFixed(1)}%`}
              />
            )
          )}
      </div>
      {cast && (
        <p className="mt-1.5 truncate text-right text-xs text-muted-foreground">
          <span className="text-foreground">
            {item.choices[(item.results.winner ?? 1) - 1]}
          </span>{" "}
          <span className="tabular">
            {(shares[(item.results.winner ?? 1) - 1] ?? 0).toFixed(0)}%
          </span>
        </p>
      )}
    </div>
  );
}

function StateIcon({ state }: { state: "active" | "pending" | "closed" }) {
  if (state === "active") {
    return (
      <span className="relative grid size-4 shrink-0 place-items-center">
        <span className="absolute size-4 animate-ping rounded-full bg-status-active/30" />
        <span className="size-2 rounded-full bg-status-active" />
      </span>
    );
  }
  if (state === "pending") {
    return <Clock className="size-4 shrink-0 text-status-pending" />;
  }
  return <CheckCircle2 className="size-4 shrink-0 text-status-closed" />;
}

export function ProposalRow({ item }: { item: ProposalListItem }) {
  const state = proposalState(item.start_at, item.end_at);

  return (
    <Link
      href={`/proposal/${item.id}`}
      className="group block border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-accent/40 sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5">
              <StateIcon state={state} />
            </span>
            <h3 className="min-w-0 font-medium leading-snug group-hover:text-primary">
              {item.title}
            </h3>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6.5 text-xs text-muted-foreground">
            <span className="tabular">{shortProposalId(item)}</span>
            <span className="inline-flex items-center gap-1.5">
              <AddressAvatar address={item.author} size={16} />
              <span className="tabular">{shortAddress(item.author)}</span>
            </span>

            <span className="text-border">·</span>
            <span className="tabular">
              {item.vote_count} {item.vote_count === 1 ? "vote" : "votes"}
            </span>

            <span className="text-border">·</span>
            <span className="tabular">
              {state === "closed"
                ? timeAgo(item.end_at)
                : state === "pending"
                  ? `opens ${timeAgo(item.start_at).replace(" ago", "")}`
                  : timeLeft(item.end_at)}
            </span>

            {item.source === "snapshot" && (
              <>
                <span className="text-border">·</span>
                <Badge
                  variant="outline"
                  className="px-1 py-0 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  Imported
                </Badge>
              </>
            )}
          </div>
        </div>

        <ResultBar item={item} />
      </div>
    </Link>
  );
}

/** Empty-state box used by both the overview and the proposals list. */
export function EmptyRows({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted-foreground">
      <MinusCircle className="size-4" />
      {message}
    </div>
  );
}
