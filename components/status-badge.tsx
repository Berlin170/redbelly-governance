import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Outcome } from "@/lib/outcome";
import type { ProposalState } from "@/lib/types";

/**
 * One badge covers both halves of a proposal's life: while it is open the
 * state is the news ("Active", "Not open yet"), and once it closes the state
 * is a foregone conclusion and the *outcome* is the news ("Passed", "Buffy").
 * Collapsing both into one control keeps a single, predictable slot on the
 * card instead of two badges competing for the same corner.
 */
const TONE = {
  active: "border-status-active/35 bg-status-active/12 text-status-active",
  pending: "border-status-pending/35 bg-status-pending/12 text-status-pending",
  passed: "border-status-passed/35 bg-status-passed/12 text-status-passed",
  rejected: "border-status-rejected/45 bg-status-rejected/15 text-[#e8736d]",
  winner: "border-chart-2/35 bg-chart-2/12 text-chart-2",
  neutral: "border-border bg-secondary/60 text-muted-foreground",
} as const;

function toneFor(state: ProposalState, outcome?: Outcome) {
  if (state === "active") return TONE.active;
  if (state === "pending") return TONE.pending;
  if (!outcome) return TONE.neutral;

  switch (outcome.kind) {
    case "passed":
      return TONE.passed;
    case "rejected":
      return TONE.rejected;
    case "winner":
      return TONE.winner;
    default:
      return TONE.neutral;
  }
}

export function StatusBadge({
  state,
  outcome,
  className,
}: {
  state: ProposalState;
  outcome?: Outcome;
  className?: string;
}) {
  const label =
    state === "active"
      ? "Active"
      : state === "pending"
        ? "Not open yet"
        : (outcome?.label ?? "Closed");

  return (
    <Badge
      variant="outline"
      title={state === "closed" ? outcome?.detail : undefined}
      className={cn(
        "h-[22px] max-w-[11rem] shrink-0 gap-1.5 rounded-md px-2 text-[11px] font-medium",
        toneFor(state, outcome),
        className
      )}
    >
      {state === "active" && (
        <span className="relative grid size-1.5 place-items-center">
          <span className="absolute size-1.5 animate-ping rounded-full bg-status-active/60" />
          <span className="size-1.5 rounded-full bg-status-active" />
        </span>
      )}
      <span className="truncate">{label}</span>
    </Badge>
  );
}
