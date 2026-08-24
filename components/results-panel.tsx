"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatPower } from "@/lib/utils";
import type { TallyResult } from "@/lib/types";

const CHART = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

export function ResultsPanel({
  results,
  choices,
  quorum,
}: {
  results: TallyResult;
  choices: string[];
  quorum: number;
}) {
  const max = Math.max(...results.scores, 0);
  const hasPairwise = results.system === "copeland" && !!results.pairwise;
  const isCopeland = results.scoreUnit === "wins";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {choices.map((choice, i) => {
            const score = results.scores[i] ?? 0;
            const share = results.total > 0 ? (score / results.total) * 100 : 0;
            const isWinner = results.winner === i + 1 && score > 0;

            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={isWinner ? "font-medium" : ""}>
                    {choice}
                    {isWinner && (
                      <span className="ml-2 text-xs text-primary">Leading</span>
                    )}
                  </span>
                  <span className="tabular text-muted-foreground">
                    {isCopeland
                      ? `${score} ${score === 1 ? "win" : "wins"}`
                      : formatPower(score)}
                    {!isCopeland && (
                      <span className="ml-2 text-xs">{share.toFixed(1)}%</span>
                    )}
                  </span>
                </div>
                <Progress
                  value={max > 0 ? (score / max) * 100 : 0}
                  indicatorClassName={CHART[i % CHART.length]}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">Voters</span>
          <span className="tabular">{results.voterCount}</span>
        </div>

        {quorum > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Quorum</span>
            <span
              className={
                results.quorumReached
                  ? "tabular text-status-passed"
                  : "tabular text-status-pending"
              }
            >
              {formatPower(results.total)} / {formatPower(quorum)}
              {results.quorumReached ? " reached" : " needed"}
            </span>
          </div>
        )}

        {hasPairwise && results.pairwise!.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Head-to-head
            </p>
            <div className="space-y-1">
              {results.pairwise!.map(({ a, b, supportA, supportB, outcome }) => (
                <div
                  key={`${a}-${b}`}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span className="min-w-0 truncate">
                    <span className={outcome === 1 ? "text-foreground" : "text-muted-foreground"}>
                      {choices[a - 1]}
                    </span>
                    <span className="mx-1 text-muted-foreground">v</span>
                    <span className={outcome === -1 ? "text-foreground" : "text-muted-foreground"}>
                      {choices[b - 1]}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {formatPower(supportA)} - {formatPower(supportB)}
                    {outcome === 0 && <span className="ml-1.5">tie</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.rounds && results.rounds.length > 1 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Elimination rounds
            </p>
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
