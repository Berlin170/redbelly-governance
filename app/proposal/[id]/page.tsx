"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MessageSquare } from "lucide-react";
import { VotePanel } from "@/components/vote-panel";
import { ResultsPanel } from "@/components/results-panel";
import { VotersTable } from "@/components/voters-table";
import { ProposalBody } from "@/components/proposal-body";
import { StatusBadge } from "@/components/status-badge";
import { AddressAvatar } from "@/components/address-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  proposalState,
  shortAddress,
  receiptUrl,
  shortProposalId,
  timeLeft,
} from "@/lib/utils";
import { explorerAddress } from "@/lib/chains";
import { useProfile, displayName } from "@/lib/use-profiles";
import { VOTING_SYSTEMS } from "@/lib/voting";
import type { Proposal, TallyResult, Vote } from "@/lib/types";

interface PayloadShape {
  proposal: Proposal;
  votes: Vote[];
  results: TallyResult;
}

export default function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<PayloadShape | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/proposals/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError("Could not reach the server."));
  }, [id]);

  useEffect(load, [load]);

  // Declared above the early returns: the page bails out to an error or a
  // skeleton below, and a hook that runs only sometimes is not a hook.
  const { data: authorProfile } = useProfile(data?.proposal.author);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-card p-6 text-sm">
        <p className="font-medium">This proposal could not be loaded.</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Link href="/proposals" className="mt-3 inline-block text-primary">
          Back to proposals
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const { proposal, votes, results } = data;
  const state = proposalState(proposal.start_at, proposal.end_at);
  const system = VOTING_SYSTEMS.find((s) => s.value === proposal.voting_system);

  return (
    <div className="space-y-5">
      <Link
        href="/proposals"
        className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-1.5 size-4" />
        Proposals
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="min-w-0 space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge state={state} />
              {state === "active" && (
                <span className="text-xs text-muted-foreground">
                  {timeLeft(proposal.end_at)}
                </span>
              )}
              {proposal.source === "snapshot" && proposal.source_url && (
                <a
                  href={proposal.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                >
                  Imported from Snapshot
                  <ExternalLink className="ml-1 size-2.5" />
                </a>
              )}
            </div>

            <h1 className="text-2xl font-semibold leading-tight tracking-tight">
              {proposal.title}
            </h1>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="tabular">{shortProposalId(proposal)}</span>
              <span>by</span>
              <a
                href={explorerAddress(proposal.author)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                title={proposal.author}
              >
                <AddressAvatar
                  address={proposal.author}
                  src={authorProfile?.avatar_url}
                  size={16}
                />
                <span className={authorProfile?.display_name ? undefined : "tabular"}>
                  {displayName(authorProfile, shortAddress(proposal.author))}
                </span>
              </a>
              {/* A name is a label on an address, so the address stays on the
                  line beside it rather than being replaced by it. */}
              {authorProfile?.display_name && (
                <span className="tabular text-xs">
                  {shortAddress(proposal.author)}
                </span>
              )}
              <span className="text-border">·</span>
              <span>{system?.label}</span>
            </p>

            {proposal.discussion && (
              <a
                href={proposal.discussion}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-sm text-primary hover:underline"
              >
                <MessageSquare className="mr-1.5 size-3.5" />
                Discussion
              </a>
            )}
          </div>

          {proposal.body && (
            <Card>
              <CardContent className="p-5">
                <ProposalBody body={proposal.body} />
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="votes">
            <TabsList>
              <TabsTrigger value="votes">
                Votes
                <span className="tabular ml-1.5 text-xs text-muted-foreground">
                  {votes.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="votes" className="mt-4">
              <VotersTable
                votes={votes}
                system={proposal.voting_system}
                choices={proposal.choices}
              />
            </TabsContent>

            <TabsContent value="details" className="mt-4">
              <Card>
                <CardContent className="space-y-3 p-5 text-sm">
                  <Row label="Voting system" value={system?.label ?? ""} />
                  <Row label="Strategy" value={proposal.strategy} />
                  <Row
                    label="Opens"
                    value={new Date(proposal.start_at).toLocaleString()}
                  />
                  <Row
                    label="Closes"
                    value={new Date(proposal.end_at).toLocaleString()}
                  />
                  {proposal.snapshot_block && (
                    <Row
                      label="Snapshot block"
                      value={String(proposal.snapshot_block)}
                    />
                  )}
                  <Row
                    label="Authorship"
                    value={
                      proposal.signature
                        ? `Signed · ${proposal.signature.slice(0, 18)}…`
                        : "Imported — not signed on this portal"
                    }
                  />
                  {/* An imported proposal carries no signature over our
                      domain, so point at the signed original instead of
                      asking anyone to take this record on trust. */}
                  {receiptUrl(proposal.source_receipt) && (
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="shrink-0 text-muted-foreground">
                        Signed original
                      </span>
                      <a
                        href={receiptUrl(proposal.source_receipt)!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-right text-primary hover:underline"
                      >
                        Verify on IPFS
                        <ExternalLink className="ml-1 size-3" />
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20">
          {state === "active" && (
            <VotePanel proposal={proposal} votes={votes} onVoted={load} />
          )}
          <ResultsPanel
            results={results}
            choices={proposal.choices}
            quorum={Number(proposal.quorum)}
          />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="tabular text-right">{value}</span>
    </div>
  );
}
