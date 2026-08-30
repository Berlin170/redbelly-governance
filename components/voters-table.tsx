"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { describeChoice } from "@/lib/voting";
import { formatPower, receiptUrl, shortAddress } from "@/lib/utils";
import { explorerAddress } from "@/lib/chains";
import { FileCheck2 } from "lucide-react";
import { AddressAvatar } from "@/components/address-avatar";
import { EmptyArt } from "@/components/art/lattice";
import { useProfiles, displayName, type Profile } from "@/lib/use-profiles";
import type { Vote, VotingSystem } from "@/lib/types";

/** Rows shown before the list asks to be expanded. */
const PAGE = 25;

function Voter({
  vote,
  profile,
  className,
}: {
  vote: Vote;
  profile?: Profile;
  className?: string;
}) {
  return (
    <a
      href={explorerAddress(vote.voter)}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-w-0 items-center gap-2 py-0.5 text-sm hover:text-primary ${className ?? ""}`}
    >
      <AddressAvatar
        address={vote.voter}
        src={profile?.avatar_url}
        size={22}
        className="shrink-0"
      />
      <span
        className={
          profile?.display_name ? "truncate" : "tabular truncate"
        }
        title={vote.voter}
      >
        {displayName(profile, shortAddress(vote.voter))}
      </span>
    </a>
  );
}

function Receipt({ vote }: { vote: Vote }) {
  const url = receiptUrl(vote.source_receipt, vote.source);
  if (!url) return null;

  return (
    // Every ballot links to its own signed record on IPFS — imported ones to
    // Snapshot's pin, ones cast here to ours. The gateway differs, the point
    // does not: the signature can be re-checked without asking this server
    // for anything.
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Signed record on IPFS"
      aria-label="Signed record on IPFS"
      className="pressable inline-grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <FileCheck2 className="size-3.5" />
    </a>
  );
}

export function VotersTable({
  votes,
  system,
  choices,
}: {
  votes: Vote[];
  system: VotingSystem;
  choices: string[];
}) {
  // One request for the whole table rather than one per row.
  const { data: profiles } = useProfiles(votes.map((v) => v.voter));
  const [expanded, setExpanded] = useState(false);

  if (votes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <EmptyArt className="h-20 w-32" />
        <p className="text-sm text-muted-foreground">No votes yet. Be the first.</p>
      </div>
    );
  }

  const shown = expanded ? votes : votes.slice(0, PAGE);
  const hidden = votes.length - shown.length;
  const profileOf = (v: Vote) => profiles?.[v.voter.toLowerCase()];

  return (
    <div className="space-y-3">
      {/*
        Phones get cards, not a table.

        The table was `overflow-x-auto` with four columns, which at 390px put
        the power figure and the receipt link off the right edge behind a
        scrollbar that does not render on touch — the data was not merely
        cramped, it was unreachable and looked broken. A ranked ballot made it
        worse by cutting choice names mid-word.
      */}
      <ul className="space-y-2 sm:hidden">
        {shown.map((vote) => (
          <li
            key={vote.id}
            className="rounded-xl border border-border bg-card p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <Voter vote={vote} profile={profileOf(vote)} className="min-w-0" />
              <Receipt vote={vote} />
            </div>

            <p className="mt-2 break-words text-sm">
              {describeChoice(system, vote.choice, choices)}
            </p>

            <p className="tabular mt-1.5 text-xs text-muted-foreground">
              {formatPower(vote.voting_power)} power
            </p>

            {vote.reason && (
              <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                {vote.reason}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voter</TableHead>
              <TableHead>Choice</TableHead>
              <TableHead className="text-right">Power</TableHead>
              <TableHead className="w-10 text-right sr-only">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((vote) => (
              <TableRow key={vote.id}>
                <TableCell className="max-w-[15rem]">
                  <Voter vote={vote} profile={profileOf(vote)} />
                  {vote.reason && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {vote.reason}
                    </p>
                  )}
                </TableCell>
                <TableCell className="max-w-[18rem] text-sm">
                  <span className="block break-words">
                    {describeChoice(system, vote.choice, choices)}
                  </span>
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-right text-sm">
                  {formatPower(vote.voting_power)}
                </TableCell>
                <TableCell className="w-10 text-right">
                  <Receipt vote={vote} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {hidden > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setExpanded(true)}
        >
          Show {hidden.toLocaleString()} more{" "}
          {hidden === 1 ? "ballot" : "ballots"}
        </Button>
      )}
    </div>
  );
}
