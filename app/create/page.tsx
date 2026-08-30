"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount, useBalance, useSignTypedData } from "wagmi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHead } from "@/components/page-head";
import { ConnectWallet } from "@/components/connect-wallet";
import { ProposalBody } from "@/components/proposal-body";
import { useSpace } from "@/components/space-provider";
import { domain, proposalTypes } from "@/lib/eip712";
import { VOTING_SYSTEMS } from "@/lib/voting";
import { accessContract, activeChain } from "@/lib/chains";
import { PROPOSAL_THRESHOLD } from "@/lib/limits";

/**
 * Identity voting reads Redbelly's access contract where one is deployed, and
 * falls back to an operator-controlled list where none is. That fallback is
 * acceptable on testnet and not on mainnet, so the option is blocked here as
 * well as in the API — a disabled control that explains itself beats a
 * request that fails on submit.
 */
const IDENTITY_REGISTRY = accessContract();
import type { VotingStrategy, VotingSystem } from "@/lib/types";
import { Eye, Plus, ShieldCheck, X } from "lucide-react";

const STRATEGIES: { value: VotingStrategy; label: string; hint: string }[] = [
  {
    value: "native-balance",
    label: "RBNT balance",
    hint: "Voting power equals the native RBNT held at the snapshot block.",
  },
  {
    value: "erc20-balance",
    label: "Token balance",
    hint: "Voting power equals an ERC-20 balance at the snapshot block.",
  },
  {
    value: "verified-identity",
    label: "Verified identity",
    hint: "Every identity-verified address gets exactly one vote.",
  },
];

export default function CreatePage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  // Mirrors the proposal-validation check in the API. Signing is free but not
  // frictionless, and being told no after the wallet popup is a worse
  // experience than being told the rule before touching it.
  //
  // The exemption has to be mirrored too. The API waives the threshold for
  // space admins, so a form that only weighed the balance disabled the button
  // for the very people it told were exempt. Compared lowercased, exactly as
  // the API does it.
  const { space } = useSpace();
  const { data: balance } = useBalance({ address });
  const held = balance ? Number(balance.formatted) : 0;
  const isAdmin = Boolean(
    address &&
      (space?.admins ?? []).some(
        (a) => a.toLowerCase() === address.toLowerCase()
      )
  );
  const belowThreshold =
    PROPOSAL_THRESHOLD > 0 &&
    !isAdmin &&
    !!address &&
    !!balance &&
    held < PROPOSAL_THRESHOLD;
  const { signTypedDataAsync } = useSignTypedData();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [choices, setChoices] = useState(["Yes", "No", "Abstain"]);
  const [system, setSystem] = useState<VotingSystem>("single-choice");
  const [strategy, setStrategy] = useState<VotingStrategy>("native-balance");
  const [tokenAddress, setTokenAddress] = useState("");
  const [quorum, setQuorum] = useState("0");
  const [days, setDays] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const systemMeta = VOTING_SYSTEMS.find((s) => s.value === system);

  // Mirrors the server-side guard in lib/voting-power.ts.
  const identityAvailable = Boolean(IDENTITY_REGISTRY || activeChain.testnet);
  const strategyMeta = STRATEGIES.find((s) => s.value === strategy);

  // One person one vote only means anything on top of verified identity
  function onSystemChange(next: VotingSystem) {
    setSystem(next);
    if (next === "one-person-one-vote") setStrategy("verified-identity");
  }

  async function submit() {
    if (!address) return;

    const cleaned = choices.map((c) => c.trim()).filter(Boolean);
    if (!title.trim()) return toast.error("Give the proposal a title.");
    if (cleaned.length < 2) return toast.error("Add at least two choices.");
    if (strategy === "erc20-balance" && !tokenAddress.trim()) {
      return toast.error("Add the token address for this strategy.");
    }

    const start = Math.floor(Date.now() / 1000);
    const end = start + Number(days) * 86_400;

    setSubmitting(true);
    try {
      const message = {
        from: address,
        space: process.env.NEXT_PUBLIC_SPACE_ID ?? "redbelly-dao",
        title: title.trim(),
        body: body.trim(),
        choices: JSON.stringify(cleaned),
        votingSystem: system,
        strategy,
        // Signed, not merely sent. A gate the author did not sign would be a
        // term of the proposal that nobody can prove they agreed to.
        //
        // Always on. Redbelly gates write access on a Receptor credential, so
        // an unverified wallet is not a member of this network in the first
        // place and there is no proposal worth opening to one. It stays part
        // of the signed payload rather than becoming a server-side assumption,
        // so an imported or older proposal still reads back honestly as
        // ungated instead of being retroactively claimed as verified.
        requireVerified: identityAvailable,
        start: BigInt(start),
        end: BigInt(end),
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
      };

      const signature = await signTypedDataAsync({
        domain,
        types: proposalTypes,
        primaryType: "Proposal",
        message,
      });

      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            ...message,
            start: start.toString(),
            end: end.toString(),
            timestamp: message.timestamp.toString(),
            tokenAddress: tokenAddress.trim(),
            quorum,
          },
          signature,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The proposal was not created.");

      toast.success("Proposal published.");
      router.push(`/proposal/${json.proposal.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The proposal was not created.";
      toast.error(msg.includes("User rejected") ? "Signature cancelled." : msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHead title="New proposal">
        Publishing signs a message. It costs no gas, and a proposal cannot be
        edited once it is open — preview it first.
      </PageHead>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fund the DAO tooling budget for Q4"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Description</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="What is being decided, and what happens if it passes?"
            />
          </div>

          <div className="space-y-2">
            <Label>Choices</Label>
            {choices.map((choice, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={choice}
                  onChange={(e) => {
                    const next = [...choices];
                    next[i] = e.target.value;
                    setChoices(next);
                  }}
                  placeholder={`Choice ${i + 1}`}
                />
                {choices.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setChoices(choices.filter((_, x) => x !== i))}
                    aria-label={`Remove choice ${i + 1}`}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChoices([...choices, ""])}
            >
              <Plus className="mr-1.5 size-4" />
              Add choice
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Voting system</Label>
            <Select
              value={system}
              onValueChange={(v) => onSystemChange(v as VotingSystem)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOTING_SYSTEMS.map((s) => (
                  <SelectItem
                    key={s.value}
                    value={s.value}
                    disabled={
                      s.value === "one-person-one-vote" && !identityAvailable
                    }
                  >
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {systemMeta && (
              <p className="text-xs text-muted-foreground">
                {systemMeta.description}
              </p>
            )}
            {!identityAvailable && (
              <p className="text-xs text-status-pending">
                One person, one vote is unavailable on {activeChain.name}:
                no Redbelly access contract is deployed there. Set
                NEXT_PUBLIC_IDENTITY_REGISTRY to enable it.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Voting power</Label>
            <Select
              value={strategy}
              onValueChange={(v) => setStrategy(v as VotingStrategy)}
              disabled={system === "one-person-one-vote"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {strategyMeta && (
              <p className="text-xs text-muted-foreground">
                {system === "one-person-one-vote"
                  ? "One person, one vote requires verified identity."
                  : strategyMeta.hint}
              </p>
            )}
          </div>

          {strategy === "erc20-balance" && (
            <div className="space-y-1.5">
              <Label htmlFor="token">Token address</Label>
              <Input
                id="token"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="0x..."
                className="tabular"
              />
            </div>
          )}

          {/* Eligibility, kept apart from weighting. No longer a choice: the
              network itself requires a credential, so every proposal carries
              the gate and the author is told rather than asked. */}
          {identityAvailable && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-passed" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Verified wallets only</p>
                <p className="text-xs text-muted-foreground">
                  Only wallets holding a Receptor credential can vote, as
                  Redbelly requires one for network access. Voting power is
                  still measured by the strategy above.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="days">Voting period (days)</Label>
              <Input
                id="days"
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quorum">Quorum (0 for none)</Label>
              <Input
                id="quorum"
                type="number"
                min={0}
                value={quorum}
                onChange={(e) => setQuorum(e.target.value)}
                className="tabular"
              />
            </div>
          </div>

          {isConnected ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                {/*
                  A published proposal cannot be edited, and the body is
                  markdown nobody has seen rendered yet. Reading it once, laid
                  out the way voters will read it, is the cheapest possible
                  guard against a headline typo becoming permanent.
                */}
                <Button
                  variant="outline"
                  onClick={() => setPreviewing(true)}
                  disabled={!title.trim()}
                  className="flex-1"
                >
                  <Eye className="mr-1.5 size-4" />
                  Preview
                </Button>
                <Button
                  onClick={submit}
                  disabled={submitting || belowThreshold}
                  className="flex-1"
                >
                  {submitting ? "Waiting for signature" : "Sign and publish"}
                </Button>
              </div>

              {belowThreshold && (
                <p className="text-center text-xs text-muted-foreground">
                  Opening a proposal requires{" "}
                  {PROPOSAL_THRESHOLD.toLocaleString()} {activeChain.nativeCurrency.symbol}.
                  This address holds{" "}
                  {held.toLocaleString(undefined, { maximumFractionDigits: 4 })}.
                  Space admins are exempt.
                </p>
              )}
            </div>
          ) : (
            <ConnectWallet />
          )}
        </CardContent>
      </Card>

      <Dialog open={previewing} onOpenChange={setPreviewing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              How this proposal will read once it is published. Nothing has been
              signed yet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h2 className="display-wide text-xl leading-tight">
              {title.trim() || "Untitled proposal"}
            </h2>

            {body.trim() ? (
              <ProposalBody body={body} />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No description. Voters will see only the title and the choices.
              </p>
            )}

            <div className="space-y-2 border-t border-border pt-4">
              <p className="eyebrow text-muted-foreground">Choices</p>
              {choices
                .filter((c) => c.trim())
                .map((choice, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm"
                  >
                    {choice}
                  </div>
                ))}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-4 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">System</dt>
                <dd className="text-right">
                  {VOTING_SYSTEMS.find((s) => s.value === system)?.label}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Voting power</dt>
                <dd className="text-right">
                  {STRATEGIES.find((s) => s.value === strategy)?.label}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Open for</dt>
                <dd className="tabular text-right">
                  {days} {Number(days) === 1 ? "day" : "days"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Quorum</dt>
                <dd className="tabular text-right">
                  {Number(quorum) > 0 ? Number(quorum).toLocaleString() : "None"}
                </dd>
              </div>
            </dl>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewing(false)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                setPreviewing(false);
                submit();
              }}
              disabled={submitting || belowThreshold}
            >
              Sign and publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
