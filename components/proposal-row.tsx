"use client";

import Link from "next/link";
import { ArrowDownToLine, Check } from "lucide-react";
import { AddressAvatar } from "@/components/address-avatar";
import { EmptyArt } from "@/components/art/lattice";
import { StatusBadge } from "@/components/status-badge";
import { choiceLabelShares, choiceShares } from "@/lib/results";
import { outcomeOf } from "@/lib/outcome";
import {
  proposalState,
  shortAddress,
  shortProposalId,
  timeAgo,
  timeLeft,
} from "@/lib/utils";
import { displayName, type Profile } from "@/lib/use-profiles";
import type { ProposalListItem } from "@/lib/types";

const CHART = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const color = (i: number) => CHART[i % CHART.length];

/**
 * The result block: one stacked bar, then the choices that actually mattered
 * spelled out underneath.
 *
 * The bar alone was doing too much work — a row of unlabelled colour segments
 * tells you a vote was close without telling you what it was close between.
 * Naming the top two choices costs one line and turns the bar into a legend
 * for itself.
 */
function ResultSummary({ item }: { item: ProposalListItem }) {
  const shares = choiceShares(item.results);
  const labels = choiceLabelShares(item.results);
  const cast = item.results.total > 0;

  const ranked = shares
    .map((share, i) => ({ share, label: labels[i] ?? 0, i }))
    .filter((c) => c.share > 0.05)
    .sort((a, b) => b.share - a.share);

  const shown = ranked.slice(0, 2);
  const rest = ranked.length - shown.length;

  const voters = item.results.voterCount || item.vote_count;
  const showVoters = voters > 0 && voters !== item.vote_count;

  if (!cast) {
    return (
      <div className="w-full shrink-0 sm:w-60">
        <div className="h-1.5 w-full rounded-full bg-secondary" />
        <p className="mt-2 text-xs text-muted-foreground sm:text-right">
          No votes cast
        </p>
      </div>
    );
  }

  return (
    <div className="w-full shrink-0 sm:w-60">
      <div
        className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={ranked
          .map((c) => `${item.choices[c.i]} ${c.label.toFixed(0)}%`)
          .join(", ")}
      >
        {shares.map((share, i) =>
          share <= 0 ? null : (
            <span
              key={i}
              style={{ width: `${share}%`, backgroundColor: color(i) }}
              title={`${item.choices[i]} — ${(labels[i] ?? 0).toFixed(1)}%`}
            />
          )
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:justify-end">
        {shown.map((c) => (
          <span key={c.i} className="inline-flex min-w-0 items-center gap-1.5">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: color(c.i) }}
            />
            <span className="max-w-[7.5rem] truncate text-muted-foreground">
              {item.choices[c.i]}
            </span>
            <span className="tabular shrink-0 font-medium text-foreground">
              {c.label.toFixed(0)}%
            </span>
          </span>
        ))}
        {rest > 0 && (
          <span className="text-muted-foreground">+{rest} more</span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground sm:text-right">
        <span className="tabular">{item.vote_count.toLocaleString()}</span>{" "}
        {item.vote_count === 1 ? "vote" : "votes"}
        {showVoters && (
          <>
            {" · "}
            <span className="tabular">{voters.toLocaleString()}</span> voters
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The author's profile is passed in rather than fetched here. A row that
 * resolved its own author would put one request behind every line of a
 * thirty-row list; the pages that render lists resolve them all in one.
 */
export function ProposalRow({
  item,
  profile,
  voted,
  index = 0,
}: {
  item: ProposalListItem;
  profile?: Profile;
  /** True when the connected wallet has a ballot on this proposal. */
  voted?: boolean;
  /** Position in the list, which drives the entrance stagger. */
  index?: number;
}) {
  const state = proposalState(item.start_at, item.end_at);
  const outcome = state === "closed" ? outcomeOf(item, item.results) : undefined;

  return (
    <Link
      href={`/proposal/${item.id}`}
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className="group relative block border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-accent/30 sm:px-5"
    >
      {/* Brand rail on hover — cheaper than a shadow and it survives the
          rounded container clipping the row's own borders. */}
      <span className="rail absolute inset-y-0 left-0 w-[3px] bg-primary" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="display min-w-0 text-[0.9375rem] leading-snug transition-colors group-hover:text-primary">
              {item.title}
            </h3>
            <StatusBadge state={state} outcome={outcome} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular">{shortProposalId(item)}</span>

            <span className="inline-flex items-center gap-1.5">
              <AddressAvatar
                address={item.author}
                src={profile?.avatar_url}
                size={16}
              />
              <span
                className={profile?.display_name ? "max-w-[12rem] truncate" : "tabular"}
                title={item.author}
              >
                {displayName(profile, shortAddress(item.author))}
              </span>
            </span>

            <span aria-hidden className="text-muted-foreground/45">·</span>
            <span className="tabular">
              {state === "closed"
                ? timeAgo(item.end_at)
                : state === "pending"
                  ? `opens ${timeAgo(item.start_at).replace(" ago", "")}`
                  : timeLeft(item.end_at)}
            </span>

            {/* Answers "have I dealt with this one" without opening it. The
                word carries the meaning and the tick only reinforces it, so
                the row still reads for anyone who cannot separate the green
                from the grey beside it. */}
            {voted && (
              <span
                className="inline-flex items-center gap-1"
                title="You have voted on this proposal"
              >
                <span aria-hidden className="text-muted-foreground/45">·</span>
                <Check className="size-3 text-status-active" />
                voted
              </span>
            )}

            {/* Provenance is a footnote, not a headline. It sits at the end of
                the metadata in the same weight as everything else there. */}
            {item.source === "snapshot" && (
              <span
                className="inline-flex items-center gap-1 text-muted-foreground/60"
                title="Imported from the DAO's Snapshot space — not signed on this portal"
              >
                <span aria-hidden className="text-muted-foreground/45">·</span>
                <ArrowDownToLine className="size-3" />
                imported
              </span>
            )}
          </div>
        </div>

        <ResultSummary item={item} />
      </div>
    </Link>
  );
}

/**
 * Empty-state box used by both the overview and the proposals list.
 *
 * An empty list is a moment the interface is being looked at closely, which is
 * the worst possible moment to show a grey icon and a shrug. The scene is
 * drawn, so it themes with everything else.
 */
export function EmptyRows({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-14 text-center">
      <EmptyArt className="h-20 w-32" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
