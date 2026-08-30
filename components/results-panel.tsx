"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPower } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Outcome } from "@/lib/outcome";
import type { ProposalState, TallyResult } from "@/lib/types";

const CHART = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

/**
 * Bars grow from nothing on first paint rather than appearing at length.
 *
 * This is one of the few places motion is doing real work: a bar that arrives
 * already full is a picture, and a bar that fills is a count. The width is
 * transitioned rather than keyframed so a re-render mid-flight retargets
 * instead of restarting, which is what happens every time a vote lands.
 */
function Bar({ pct, className }: { pct: number; className: string }) {
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn("h-full rounded-full", className)}
        style={{
          width: `${grown ? pct : 0}%`,
          transition: "width 620ms var(--ease-out)",
        }}
      />
    </div>
  );
}

export function ResultsPanel({
  results,
  choices,
  quorum,
  state,
  outcome,
}: {
  results: TallyResult;
  choices: string[];
  quorum: number;
  state: ProposalState;
  outcome?: Outcome;
}) {
  const max = Math.max(...results.scores, 0);
  const hasPairwise = results.system === "copeland" && !!results.pairwise;
  const isCopeland = results.scoreUnit === "wins";
  const closed = state === "closed";

  // Approval asks a separate yes/no about every choice, so a share is "how
  // much of the power in the room backed this one", not "what fraction of the
  // ballot did it get". Dividing by the summed score instead would shrink
  // every candidate as voters approve more of them, and report a candidate
  // nobody rejected as a minority. These deliberately do not sum to 100.
  const isApproval = results.system === "approval";
  const denominator = isApproval ? results.participation : results.total;

  // "Leading" is a claim about being ahead, so it has to be withheld when
  // nothing is. `winner` resolves ties to whichever choice was listed first,
  // which is fine for picking a single label but would badge one of two equal
  // candidates as beating the other. Scores are floats once weighting is
  // involved, so compare with a tolerance rather than for exact equality.
  const EPSILON = 1e-9;
  const atTop = (score: number) =>
    score > 0 && Math.abs(score - max) < EPSILON;
  const leaderCount = results.scores.filter(atTop).length;

  // A finished race has no leader, it has a winner. The panel used to say
  // "Leading" on a vote that closed a month ago, which reads as though the
  // count were still running.
  const topWord = leaderCount > 1 ? "Tied" : closed ? "Won" : "Leading";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="display text-base">Results</CardTitle>

        {/* The verdict, stated. The detail page previously showed only
            "Closed" while the proposal list showed "Rejected" for the same
            vote — the two screens disagreed on the single most important
            fact about a finished proposal. */}
        {closed && outcome && (
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 text-sm font-medium",
              outcome.kind === "passed" && "text-status-passed",
              outcome.kind === "rejected" && "text-status-rejected",
              outcome.kind === "winner" && "text-chart-2",
              (outcome.kind === "no-quorum" || outcome.kind === "no-votes") &&
                "text-muted-foreground",
            )}
          >
            {outcome.kind === "winner" && <Trophy className="size-3.5" />}
            {outcome.label}
          </p>
        )}
        {closed && outcome && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {outcome.detail}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3.5">
          {choices.map((choice, i) => {
            const score = results.scores[i] ?? 0;
            const share = denominator > 0 ? (score / denominator) * 100 : 0;
            const isTop = atTop(score);

            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={cn("min-w-0", isTop && "font-medium")}>
                    <span className="break-words">{choice}</span>
                    {isTop && (
                      <span className="ml-2 whitespace-nowrap text-xs text-primary">
                        {topWord}
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {isCopeland
                      ? `${score} ${score === 1 ? "win" : "wins"}`
                      : formatPower(score)}
                    {!isCopeland && (
                      <span className="ml-2 text-xs">{share.toFixed(1)}%</span>
                    )}
                  </span>
                </div>
                <Bar
                  pct={max > 0 ? (score / max) * 100 : 0}
                  className={CHART[i % CHART.length]}
                />
              </div>
            );
          })}
        </div>

        {isApproval && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each figure is the share of voting power that approved that choice.
            Voters may approve several, so these do not add up to 100%.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">Voters</span>
          <span className="tabular">{results.voterCount}</span>
        </div>

        {quorum > 0 && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="shrink-0 text-muted-foreground">Quorum</span>
            <span
              className={cn(
                "tabular text-right",
                results.quorumReached
                  ? "text-status-passed"
                  : "text-status-pending",
              )}
            >
              {/* participation, not the summed score: this has to be the same
                  number quorumReached was decided on, or the panel argues with
                  its own verdict. Under approval the sum is larger, so showing
                  it would report a quorum that was never met. */}
              {formatPower(results.participation)} / {formatPower(quorum)}
              {results.quorumReached ? " reached" : " needed"}
            </span>
          </div>
        )}

        {hasPairwise && results.pairwise!.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="eyebrow text-muted-foreground">Head-to-head</p>
            <div className="space-y-1">
              {results.pairwise!.map(({ a, b, supportA, supportB, outcome: o }) => (
                <div
                  key={`${a}-${b}`}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span className="min-w-0 truncate">
                    <span className={o === 1 ? "text-foreground" : "text-muted-foreground"}>
                      {choices[a - 1]}
                    </span>
                    <span className="mx-1 text-muted-foreground">v</span>
                    <span className={o === -1 ? "text-foreground" : "text-muted-foreground"}>
                      {choices[b - 1]}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {formatPower(supportA)} - {formatPower(supportB)}
                    {o === 0 && <span className="ml-1.5">tie</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.rounds && results.rounds.length > 1 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="eyebrow text-muted-foreground">Elimination rounds</p>
            {results.rounds.map((round) => (
              <div key={round.round} className="text-xs text-muted-foreground">
                <span className="tabular">Round {round.round}</span>
                {round.eliminated ? (
                  <span className="ml-2">
                    eliminated{" "}
                    <span className="text-foreground">
                      {choices[round.eliminated - 1]}
                    </span>
                  </span>
                ) : (
                  <span className="ml-2 text-status-passed">
                    majority reached
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
