"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useSignTypedData } from "wagmi";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConnectWallet } from "@/components/connect-wallet";
import { HowVotingWorks } from "@/components/how-voting-works";
import { domain, voteTypes, buildVoteMessage } from "@/lib/eip712";
import { describeChoice, validateChoice, VOTING_SYSTEMS } from "@/lib/voting";
import { cn, receiptUrl, formatVotingDate } from "@/lib/utils";
import { activeChain } from "@/lib/chains";
import type { Proposal, Vote, VoteChoice } from "@/lib/types";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  PenLine,
  ShieldCheck,
} from "lucide-react";

export function VotePanel(props: { proposal: Proposal; votes: Vote[]; onVoted: () => void }) {
  const { address } = useAccount();
  // Changing accounts starts a fresh ballot and closes any previous review.
  return <WalletVotePanel key={`${props.proposal.id}:${address ?? "disconnected"}`} {...props} />;
}

function WalletVotePanel({
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
  const [phase, setPhase] = useState<"idle" | "wallet" | "saving">("idle");
  const submitting = phase !== "idle";
  const [recordedVote, setRecordedVote] = useState<Vote | null>(null);
  const [reason, setReason] = useState("");
  /** The review step. A signature request is the moment a visitor is most
   *  likely to bail, and the old flow threw the wallet prompt at them with no
   *  statement of what they were about to sign. */
  const [confirming, setConfirming] = useState(false);

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
  const existingVote = votes.find(
    (v) => v.voter.toLowerCase() === (address ?? "").toLowerCase()
  );
  const savedVote = recordedVote?.voter.toLowerCase() === address?.toLowerCase()
    && recordedVote?.proposal_id === proposal.id ? recordedVote : null;
  const myVote = savedVote && (!existingVote ||
    (savedVote.signed_at ?? 0) > (existingVote.signed_at ?? 0))
    ? savedVote : existingVote;
  const receipt = receiptUrl(myVote?.source_receipt, myVote?.source);

  /** What this address may cast, read before signing rather than after. */
  const eligibility = useQuery({
    queryKey: ["voting-power", proposal.id, address],
    enabled: !!address && isConnected,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/power?proposal=${proposal.id}&voter=${address}`, { signal });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error("Eligibility could not be checked. Please try again.");
      if (typeof json.power !== "number" || !Number.isFinite(json.power)) {
        throw new Error("Voting power could not be read. Please try again.");
      }
      return json as { power: number; unavailable?: string; blocked?: boolean };
    },
  });
  const power = eligibility.data?.power ?? null;
  const powerNote = eligibility.error?.message ?? eligibility.data?.unavailable;
  const eligible = isConnected && !eligibility.isFetching && !powerNote && power !== null && power > 0;
  const powerUnit = proposal.strategy === "verified-identity" ? "vote" :
    proposal.strategy === "native-balance" ? activeChain.nativeCurrency.symbol : "voting power";

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

  /** Validate first, then show what is about to be signed. */
  function review() {
    if (!eligible) return;
    if (Date.now() >= Date.parse(proposal.end_at)) {
      toast.error("Voting has closed.");
      onVoted();
      return;
    }
    try {
      validateChoice(system, currentChoice(), choices.length);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check your selection.");
      return;
    }
    setConfirming(true);
  }

  async function submit() {
    if (!address || !eligible || submitting) return;
    if (Date.now() >= Date.parse(proposal.end_at)) {
      toast.error("Voting has closed.");
      setConfirming(false);
      onVoted();
      return;
    }
    const choice = currentChoice();

    try {
      validateChoice(system, choice, choices.length);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check your selection.");
      return;
    }

    setPhase("wallet");
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

      setPhase("saving");
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
      setRecordedVote(json.vote);
      setConfirming(false);
      onVoted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The vote was not recorded.";
      // Wallet rejections are a normal thing to do, not an error to shout about
      toast.error(msg.includes("User rejected") ? "Signature cancelled." : msg);
    } finally {
      setPhase("idle");
    }
  }

  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cast your vote</CardTitle>
        {meta && (
          <p className="text-sm leading-relaxed text-muted-foreground">{meta.description}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div role="status" className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium">
            {!isConnected ? "Connect your wallet to check eligibility" :
              eligibility.isFetching ? "Checking eligibility…" :
              eligibility.data?.blocked || (power === 0 && !powerNote) ? "Not eligible for this proposal" :
              powerNote ? "Eligibility unavailable" : "Eligible to vote"}
          </p>
          {isConnected && !eligibility.isFetching && (
            <>
              {eligible ? (
                <p>Your voting power: <span className="tabular font-medium">{power!.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span> {powerUnit}</p>
              ) : (
                <p className="text-muted-foreground">{powerNote ?? (proposal.strategy === "verified-identity"
                  ? "This address was not identity-verified at the proposal snapshot. Connect an address that was eligible when the snapshot was taken."
                  : "This address held no voting power at the proposal snapshot. Connect a wallet that held eligible assets at that time.")}</p>
              )}
              {powerNote && (
                <p className="text-muted-foreground">{eligibility.data?.blocked
                  ? "Connect an address that was verified at the proposal snapshot."
                  : "Try checking again. If this continues, contact the proposal organizer."}</p>
              )}
              {powerNote && (
                <Button variant="outline" className="min-h-11" onClick={() => eligibility.refetch()}>Check again</Button>
              )}
            </>
          )}
          <p className="text-muted-foreground">Eligibility is based on the proposal snapshot. Changes after that snapshot do not add voting power.</p>
        </div>
        {myVote && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-status-passed/30 bg-status-passed/5 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-passed" />
            <div className="min-w-0 space-y-2">
              <p className="font-medium">Vote recorded</p>
              <p className="break-words">{describeChoice(system, myVote.choice, choices)}</p>
              <p className="text-muted-foreground">{myVote.signed_at ? "Signed" : "Recorded"}: {formatVotingDate(myVote.signed_at ? new Date(myVote.signed_at * 1000).toISOString() : myVote.voted_at ?? myVote.created_at)}</p>
              {receipt ? <a className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" href={receipt} target="_blank" rel="noreferrer">View IPFS receipt</a> :
                <div className="space-y-1"><p className="text-muted-foreground">IPFS receipt not available yet. Your vote is recorded.</p><Button variant="outline" className="min-h-11" onClick={onVoted}>Refresh receipt</Button></div>}
              <p className="text-muted-foreground">Voting again before the deadline replaces this ballot.</p>
            </div>
          </div>
        )}

        {/* ---------------- single choice / one person one vote ------------ */}
        {(system === "single-choice" || system === "one-person-one-vote") && (
          <div className="space-y-2">
            {choices.map((choice, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={single === i + 1}
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
                  aria-pressed={on}
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
                    aria-label={`Shares for ${choice}`}
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
                    className="size-11"
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
                    className="size-11"
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
          <Label htmlFor="reason" className="text-sm text-muted-foreground">
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
            onClick={review}
            disabled={submitting || !eligible}
            className="min-h-11 w-full"
          >
            {myVote ? "Change vote" : "Review and sign"}
          </Button>
        ) : (
          <ConnectWallet />
        )}

        {isConnected && (
          <p className="text-center text-sm leading-relaxed text-muted-foreground">
            Signing costs no gas. Your signature proves the vote is yours.{" "}
            <HowVotingWorks />
          </p>
        )}

        {!isConnected && (
          <p className="text-center text-sm leading-relaxed text-muted-foreground">
            Voting is a signature, not a transaction. No gas, and nothing can
            be moved. <HowVotingWorks />
          </p>
        )}
      </CardContent>

      {/*
        The review step.

        Signing a typed message on an unfamiliar site is the moment a careful
        person stops, and the wallet's own prompt shows a payload most people
        cannot read. Stating the ballot in plain words first — this choice,
        this much power, and the fact that no transaction is being sent — is
        the difference between a considered confirmation and a leap of faith.
      */}
      <Dialog open={confirming} onOpenChange={(open) => { if (!submitting) setConfirming(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm your vote</DialogTitle>
            <DialogDescription>{proposal.title}</DialogDescription>
          </DialogHeader>

          <dl className="space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">Your choice</dt>
              <dd className="text-right font-medium">
                {describeChoice(system, currentChoice(), choices)}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">Voting power</dt>
              <dd className="tabular text-right">
                {power !== null
                  ? power.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })
                  : "—"}
                {proposal.strategy === "verified-identity"
                  ? ""
                  : ` ${powerUnit}`}
              </dd>
            </div>

            {reason.trim() && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="break-words text-xs leading-relaxed">
                  {reason.trim()}
                </dd>
              </div>
            )}
          </dl>

          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p className="flex gap-2">
              <PenLine className="mt-0.5 size-3.5 shrink-0 text-primary" />
              Your wallet will ask you to sign a message. This is not a
              transaction — it costs no gas and cannot move anything you hold.
            </p>
            {myVote && (
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                This replaces the ballot you already cast on this proposal.
              </p>
            )}
          </div>

          <p role="status" className="text-sm text-muted-foreground">
            {phase === "wallet" ? "Confirm the signature request in your wallet." : phase === "saving" ? "Your signature was received. Recording your vote..." : ""}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={submitting}
            >
              Back
            </Button>
            <Button className="min-h-11" onClick={submit} disabled={submitting || !eligible}>
              {phase === "wallet" ? "Waiting for wallet..." : phase === "saving" ? "Submitting vote..." : "Sign in wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
