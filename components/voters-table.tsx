"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeChoice } from "@/lib/voting";
import { formatPower, receiptUrl, shortAddress } from "@/lib/utils";
import { explorerAddress } from "@/lib/chains";
import { FileCheck2 } from "lucide-react";
import { AddressAvatar } from "@/components/address-avatar";
import { useProfiles, displayName } from "@/lib/use-profiles";
import type { Vote, VotingSystem } from "@/lib/types";

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

  if (votes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No votes yet. Be the first.
      </p>
    );
  }

  return (
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
        {votes.map((vote) => (
          <TableRow key={vote.id}>
            <TableCell>
              <a
                href={explorerAddress(vote.voter)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm hover:text-primary"
              >
                <AddressAvatar
                  address={vote.voter}
                  src={profiles?.[vote.voter.toLowerCase()]?.avatar_url}
                  size={22}
                />
                <span
                  className={
                    profiles?.[vote.voter.toLowerCase()]?.display_name
                      ? "max-w-[12rem] truncate"
                      : "tabular"
                  }
                  title={vote.voter}
                >
                  {displayName(
                    profiles?.[vote.voter.toLowerCase()],
                    shortAddress(vote.voter)
                  )}
                </span>
              </a>
              {vote.reason && (
                <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                  {vote.reason}
                </p>
              )}
            </TableCell>
            <TableCell className="text-sm">
              {describeChoice(system, vote.choice, choices)}
            </TableCell>
            <TableCell className="tabular text-right text-sm">
              {formatPower(vote.voting_power)}
            </TableCell>
            <TableCell className="w-10 text-right">
              {/* Every ballot links to its own signed record on IPFS —
                  imported ones to Snapshot's pin, ones cast here to ours.
                  The gateway differs, the point does not: the signature can
                  be re-checked without asking this server for anything. */}
              {receiptUrl(vote.source_receipt, vote.source) && (
                <a
                  href={receiptUrl(vote.source_receipt, vote.source)!}
                  target="_blank"
                  rel="noreferrer"
                  title="Signed record on IPFS"
                  className="inline-grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
                >
                  <FileCheck2 className="size-3.5" />
                </a>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
