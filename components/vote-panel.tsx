"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConnectWallet } from "@/components/connect-wallet";
import { domain, voteTypes, buildVoteMessage } from "@/lib/eip712";
import { validateChoice, VOTING_SYSTEMS } from "@/lib/voting";
import { cn } from "@/lib/utils";
import { activeChain } from "@/lib/chains";
import type { Proposal, Vote, VoteChoice } from "@/lib/types";
import { ArrowDown, ArrowUp, Check, CheckCircle2 } from "lucide-react";

export function VotePanel({
  proposal,
  votes,
  onVoted,
}: {
  proposal: Proposal;
  votes: Vote[];
  onVoted: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");

  const system = proposal.voting_system;
  const choices = proposal.choices;
  const meta = VOTING_SYSTEMS.find((s) => s.value === system);

  // One piece of state per input shape
  const [single, setSingle] = useState<number | null>(null);
  const [approved, setApproved] = useState<number[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [ranking, setRanking] = useState<number[]>(
    choices.map((_, i) => i + 1)
  );

  /** The ballot this address already cast, if it has. Votes are upserts, so
   *  this is an edit rather than a second vote. */
  const myVote = votes.find(
    (v) => v.voter.toLowerCase() === (address ?? "").toLowerCase()
  );

  /** What this address may cast, read before signing rather than after. */
  const [power, setPower] = useState<number | null>(null);
  const [powerNote, setPowerNote] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setPower(null);
      setPowerNote(null);
      return;
    }
    let live = true;
    fetch(`/api/power?proposal=${proposal.id}&voter=${address}`)
      .then((r) => r.json())
      .then((json) => {
        if (!live) return;
        setPower(typeof json.power === "number" ? json.power : null);
        setPowerNote(json.unavailable ?? null);
      })
      .catch(() => live && setPowerNote("Voting power could not be read."));
    return () => {
      live = false;
    };
  }, [address, proposal.id, votes]);

  // Show the existing ballot in the controls, so the panel reflects what this
  // address has already said instead of presenting a blank form.
  useEffect(() => {
    if (!myVote) return;
    const c = myVote.choice;
    if (typeof c === "number") setSingle(c);
    else if (Array.isArray(c)) {
      if (system === "approval") setApproved(c as number[]);
      else setRanking(c as number[]);
    } else if (c && typeof c === "object") {
      setWeights(
        Object.fromEntries(
          Object.entries(c as Record<string, number>).map(([k, v]) => [k, Number(v)])
        )
      );
    }
    if (myVote.reason) setReason(myVote.reason);
  }, [myVote, system]);

  function currentChoice(): VoteChoice {
    switch (system) {
      case "single-choice":
      case "one-person-one-vote":
        return single ?? 0;
      case "approval":
        return approved;
      case "ranked-choice":
      case "copeland":
        return ranking;
      case "weighted":
      case "quadratic":
        return Object.fromEntries(
          Object.entries(weights).filter(([, w]) => w > 0)
        );
      default:
        return 0;
    }
  }

  function moveRank(index: number, direction: -1 | 1) {
    const next = [...ranking];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRanking(next);
  }

  async function submit() {
    if (!address) return;
    const choice = currentChoice();

    try {
      validateChoice(system, choice, choices.length);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check your selection.");
      return;
    }

    setSubmitting(true);
    try {
      const message = buildVoteMessage({
        from: address,
        space: proposal.space_id,
        proposal: proposal.id,
        choice,
        reason,
      });

      const signature = await signTypedDataAsync({
        domain,
        types: voteTypes,
        primaryType: "Vote",
        message,
      });

      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { ...message, timestamp: message.timestamp.toString() },
          signature,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The vote was not recorded.");

      toast.success("Vote recorded.");
      onVoted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The vote was not recorded.";
      // Wallet rejections are a normal thing to do, not an error to shout about
      toast.error(msg.includes("User rejected") ? "Signature cancelled." : msg);
    } finally {
      setSubmitting(false);
    }
  }

  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cast your vote</CardTitle>
        {meta && (
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {myVote && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              You voted with{" "}
              <span className="tabular font-medium text-foreground">
                {Number(myVote.voting_power).toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}
              </span>{" "}
              power. Your selection is shown below — voting again replaces it.
            </p>
          </div>
        )}

        {/* ---------------- single choice / one person one vote ------------ */}
        {(system === "single-choice" || system === "one-person-one-vote") && (
          <div className="space-y-2">
            {choices.map((choice, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSingle(i + 1)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  single === i + 1
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40"
                )}
              >
                {choice}
                {single === i + 1 && <Check className="size-4 text-primary" />}
              </button>
            ))}
          </div>
        )}

        {/* ---------------------------- approval --------------------------- */}
        {system === "approval" && (
          <div className="space-y-2">
            {choices.map((choice, i) => {
              const on = approved.includes(i + 1);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setApproved(
                      on
                        ? approved.filter((c) => c !== i + 1)
                        : [...approved, i + 1]
                    )
                  }
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                    on
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  {choice}
                  {on && <Check className="size-4 text-primary" />}
                </button>
              );
            })}
          </div>
        )}

        {/* ------------------------ weighted / quadratic ------------------- */}
        {(system === "weighted" || system === "quadratic") && (
          <div className="space-y-3">
            {choices.map((choice, i) => {
              const key = String(i + 1);
              const value = weights[key] ?? 0;
              const share =
                weightTotal > 0 ? Math.round((value / weightTotal) * 100) : 0;

              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex-1 text-sm">{choice}</span>
                  <span className="tabular w-12 text-right text-xs text-muted-foreground">
                    {share}%
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={value}
                    onChange={(e) =>
                      setWeights({
                        ...weights,
                        [key]: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="tabular h-9 w-20 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                  />
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Shares are relative. Two and two splits your power the same way
              fifty and fifty does.
            </p>
          </div>
        )}

        {/* ------------------- ranked choice and copeland ------------------ */}
        {(system === "ranked-choice" || system === "copeland") && (
          <div className="space-y-2">
            {ranking.map((choiceIndex, position) => (
              <div
                key={choiceIndex}
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5"
              >
                <span className="tabular w-5 text-sm text-muted-foreground">
                  {position + 1}
                </span>
                <span className="flex-1 text-sm">
                  {choices[choiceIndex - 1]}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={position === 0}
                    onClick={() => moveRank(position, -1)}
                    aria-label={`Move ${choices[choiceIndex - 1]} up`}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={position === ranking.length - 1}
                    onClick={() => moveRank(position, 1)}
                    aria-label={`Move ${choices[choiceIndex - 1]} down`}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="reason" className="text-xs text-muted-foreground">
            Reason (optional)
          </Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you voting this way?"
            rows={2}
          />
        </div>

        {isConnected ? (
          <Button
            onClick={submit}
            disabled={submitting || power === 0}
            className="w-full"
          >
            {submitting
              ? "Waiting for signature"
              : myVote
                ? "Change vote"
                : "Sign and vote"}
          </Button>
        ) : (
          <ConnectWallet />
        )}

        {isConnected && (
          <div className="space-y-1 text-center text-xs text-muted-foreground">
            {powerNote ? (
              <p className="text-destructive">{powerNote}</p>
            ) : power !== null ? (
              <p>
                Your voting power:{" "}
                <span className="tabular font-medium text-foreground">
                  {power.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </span>
                {proposal.strategy === "verified-identity"
                  ? power > 0
                    ? " (identity verified)"
                    : " (not identity verified)"
                  : ` ${activeChain.nativeCurrency.symbol}`}
              </p>
            ) : null}
            <p>Signing costs no gas. Your signature proves the vote is yours.</p>
          </div>
        )}

        {!isConnected && (
          <p className="text-center text-xs text-muted-foreground">
            Signing costs no gas. Your signature proves the vote is yours.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
