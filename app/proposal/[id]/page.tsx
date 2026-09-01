"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MessageSquare, ShieldCheck } from "lucide-react";
import { VotePanel } from "@/components/vote-panel";
import { ResultsPanel } from "@/components/results-panel";
import { VotersTable } from "@/components/voters-table";
import { ProposalBody } from "@/components/proposal-body";
import { StatusBadge } from "@/components/status-badge";
import { ShareButton } from "@/components/share-button";
import { AddressAvatar } from "@/components/address-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  proposalState,
  shortAddress,
  receiptUrl,
  shortProposalId,
  timeLeft,
} from "@/lib/utils";
import { explorerAddress } from "@/lib/chains";
import { outcomeOf } from "@/lib/outcome";
import { tallyByIdentity } from "@/lib/voting";
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

  // A fresh ballot changes an answer this page does not own: the "voted" tick
  // the proposal lists show. Reloading only this page would leave the member
  // to navigate back to a list still saying they had not voted.
  const queryClient = useQueryClient();
  const onVoted = useCallback(() => {
    load();
    queryClient.invalidateQueries({ queryKey: ["my-votes"] });
  }, [load, queryClient]);

  // Declared above the early returns: the page bails out to an error or a
  // skeleton below, and a hook that runs only sometimes is not a hook.
  const { data: authorProfile } = useProfile(data?.proposal.author);

  const state = data
    ? proposalState(data.proposal.start_at, data.proposal.end_at)
    : "pending";

  // The verdict, computed the same way the proposal list computes it. It was
  // missing here entirely: the list badged a finished vote "Rejected" and this
  // page said only "Closed", so the two screens disagreed about the one thing
  // a reader came to find out.
  const outcome = useMemo(
    () =>
      data && state === "closed"
        ? outcomeOf(data.proposal, data.results)
        : undefined,
    [data, state],
  );

  /**
   * The second chamber, shown beside the first and deciding nothing.
   *
   * Only on an identity-gated proposal, because only there is every ballot
   * known to be a verified person's, and only where the weighting strategy is
   * something other than identity — a one-person-one-vote proposal is already
   * this tally, and printing it twice would suggest two chambers had agreed
   * when only one was ever counted.
   */
  const peoples = useMemo(() => {
    if (!data) return undefined;
    const { proposal, votes } = data;
    if (!proposal.require_verified) return undefined;
    if (proposal.strategy === "verified-identity") return undefined;
    if (votes.length === 0) return undefined;
    return tallyByIdentity(
      proposal.voting_system,
      votes,
      proposal.choices.length,
      Number(proposal.identity_quorum) || 0,
    );
  }, [data]);

  /**
   * What the two chambers say about each other.
   *
   * The agreement is worth stating outright rather than leaving to be read off
   * two sets of bars: where they agree the weighted result needs no defending,
   * and where they diverge that is the single most useful fact on the page —
   * it means the holders and the people wanted different things, which is the
   * whole argument for counting both.
   */
  const peoplesNote = useMemo(() => {
    const base =
      "Advisory, and decides nothing. Every verified voter counts once here, " +
      "however much they hold.";
    if (!data || !peoples) return base;

    const named = (n: number | null) =>
      n == null ? null : (data.proposal.choices[n - 1] ?? null);
    const byPower = named(data.results.winner);
    const byPerson = named(peoples.winner);
    if (!byPower || !byPerson) return base;

    return byPower === byPerson
      ? `${base} It agrees with the weighted count: ${byPower} leads both.`
      : `${base} It disagrees with the weighted count, which has ${byPower} ` +
          `ahead while the people here prefer ${byPerson}.`;
  }, [data, peoples]);

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
  const system = VOTING_SYSTEMS.find((s) => s.value === proposal.voting_system);

  return (
    <div className="space-y-5">
      <Link
        href="/proposals"
        className="pressable -mx-2 -my-1.5 inline-flex items-center rounded px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1.5 size-4" />
        Proposals
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge state={state} outcome={outcome} />
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
              className="pressable inline-flex items-center rounded border border-border px-1.5 py-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              Imported from Snapshot
              <ExternalLink className="ml-1 size-2.5" />
            </a>
          )}
          {/* Pushed to the far end of the row it shares with the state: the
              state is what the reader came for, and the share is what they do
              after reading it. On a phone the row wraps and it lands on its
              own line, which is where a thumb expects it anyway. */}
          <ShareButton title={proposal.title} />
        </div>

        <h1 className="display-wide text-2xl leading-tight sm:text-[1.75rem]">
          {proposal.title}
        </h1>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular">{shortProposalId(proposal)}</span>
          <span>by</span>
          <a
            href={explorerAddress(proposal.author)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 py-0.5 transition-colors hover:text-foreground"
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
          <span aria-hidden className="text-muted-foreground/45">·</span>
          <span>{system?.label}</span>
          {proposal.require_verified && (
            <>
              <span aria-hidden className="text-muted-foreground/45">·</span>
              {/* A term of the vote, so it belongs where the terms are read,
                  not only in the error someone gets after signing. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-help items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs">
                    <ShieldCheck className="size-3 text-primary" />
                    Verified wallets only
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Only wallets holding a Receptor credential can vote on this
                  proposal.
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </p>

        {proposal.discussion && (
          <a
            href={proposal.discussion}
            target="_blank"
            rel="noreferrer"
            className="pressable -my-1 inline-flex items-center py-1 text-sm text-primary hover:underline"
          >
            <MessageSquare className="mr-1.5 size-3.5" />
            Discussion
          </a>
        )}
      </div>

      {/*
        On a phone the rail comes first.

        The old order put the whole proposal body — sometimes thousands of
        pixels of imported markdown — and then the full ballot list above the
        one control the visitor came here to use. Ordering is a presentation
        concern, so it is done with `order` rather than by duplicating the
        panels or moving them in the DOM, and the reading order on desktop is
        unchanged.
      */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="order-2 min-w-0 space-y-5 lg:order-1">
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
                  {/* Imported proposals carry no signature over our domain,
                      so their link points at the signed original. Proposals
                      opened here link to our own pin of the payload their
                      author signed — either way, nobody has to take this
                      record on trust because the site says so. */}
                  {receiptUrl(proposal.source_receipt, proposal.source) && (
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="shrink-0 text-muted-foreground">
                        {proposal.source === "snapshot"
                          ? "Signed original"
                          : "IPFS receipt"}
                      </span>
                      <a
                        href={receiptUrl(proposal.source_receipt, proposal.source)!}
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

        <div className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-20">
          {state === "active" && (
            <VotePanel proposal={proposal} votes={votes} onVoted={onVoted} />
          )}
          <ResultsPanel
            results={results}
            choices={proposal.choices}
            quorum={Number(proposal.quorum)}
            identityQuorum={Number(proposal.identity_quorum) || 0}
            state={state}
            outcome={outcome}
          />
          {peoples && (
            <ResultsPanel
              results={peoples}
              choices={proposal.choices}
              quorum={0}
              state={state}
              title="One vote per person"
              note={peoplesNote}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="tabular break-words text-right">{value}</span>
    </div>
  );
}
