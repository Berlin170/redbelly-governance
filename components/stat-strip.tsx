"use client";

import { useSpace } from "@/components/space-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Six numbers that answer "what is the state of this DAO" without scrolling.
 *
 * These are stat tiles, not a chart: each value is a single magnitude with no
 * shape to plot, so a number set in tabular figures reads faster than any mark
 * would. Values wear text tokens rather than the vote-choice colours — the one
 * exception is the open-proposal count, where the colour is carrying live
 * state, not identity, and is paired with a label and a dot so it is never
 * colour alone.
 */
interface Tile {
  label: string;
  value: number;
  hint: string;
  live?: boolean;
}

function StatTile({ tile }: { tile: Tile }) {
  const lit = tile.live && tile.value > 0;

  return (
    <div
      className="min-w-0 px-4 py-3.5 sm:px-5"
      title={tile.hint}
    >
      <div className="flex items-center gap-1.5">
        {lit && (
          <span className="relative grid size-1.5 shrink-0 place-items-center">
            <span className="absolute size-1.5 animate-ping rounded-full bg-status-active/60" />
            <span className="size-1.5 rounded-full bg-status-active" />
          </span>
        )}
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {tile.label}
        </p>
      </div>

      <p
        className={cn(
          "tabular mt-1 text-2xl font-semibold leading-none tracking-tight",
          lit ? "text-status-active" : "text-foreground"
        )}
      >
        {tile.value.toLocaleString()}
      </p>
    </div>
  );
}

export function StatStrip() {
  const { space, stats, isLoading } = useSpace();

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card px-4 py-3.5 sm:px-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-6 w-12" />
          </div>
        ))}
      </div>
    );
  }

  const tiles: Tile[] = [
    {
      label: "Open now",
      value: stats.activeCount,
      hint: "Proposals currently accepting votes.",
      live: true,
    },
    {
      label: "Proposals",
      value: stats.proposalCount,
      hint: "Every proposal in this space, imported history included.",
    },
    {
      label: "Votes cast",
      value: stats.voteCount,
      hint: "Total ballots across every proposal.",
    },
    {
      label: "Voters",
      value: stats.voterCount,
      hint: "Distinct addresses that have ever voted here.",
    },
    {
      label: "Avg turnout",
      value: stats.avgTurnout,
      hint: "Mean ballots per proposal.",
    },
    {
      label: "Followers",
      value: space?.followers_count ?? 0,
      hint: "Members following this space.",
    },
  ];

  // The 1px grid gap over a border-coloured backdrop draws every divider,
  // including the ones between wrapped rows, without a rule per cell.
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="bg-card">
          <StatTile tile={tile} />
        </div>
      ))}
    </div>
  );
}
