"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressAvatar } from "@/components/address-avatar";
import { useProfiles, displayName } from "@/lib/use-profiles";
import { useLeaderboard } from "@/lib/use-leaderboard";
import { explorerAddress } from "@/lib/chains";
import { cn, shortAddress, timeAgo } from "@/lib/utils";
import type { LeaderboardEntry } from "@/lib/types";

type SortKey = "votes" | "proposals" | "recent";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "votes", label: "Most votes" },
  { value: "proposals", label: "Most proposals" },
  { value: "recent", label: "Recently active" },
];

/**
 * Nobody is numbered and nothing is scored. Sorting changes the order of the
 * list and nothing else, so a member's place in it is never a standing this
 * portal has awarded them — it is just where the column you picked puts them.
 */
function sortMembers(rows: LeaderboardEntry[], key: SortKey) {
  const at = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

  return [...rows].sort((a, b) => {
    switch (key) {
      case "proposals":
        return b.proposals - a.proposals || b.votes - a.votes;
      case "recent":
        return at(b.lastActive) - at(a.lastActive);
      default:
        return b.votes - a.votes || b.proposals - a.proposals;
    }
  });
}

export default function LeaderboardPage() {
  const { data: members, error, isLoading } = useLeaderboard();
  const { address } = useAccount();
  const [sort, setSort] = useState<SortKey>("votes");
  const [query, setQuery] = useState("");

  // Every name on the page resolved in one request, capped where the profile
  // endpoint caps itself rather than sending it a list it would silently trim.
  const { data: profiles } = useProfiles(
    (members ?? []).slice(0, 200).map((m) => m.address)
  );

  const visible = useMemo(() => {
    if (!members) return [];
    const q = query.trim().toLowerCase();

    const matched = q
      ? members.filter((m) => {
          const name = profiles?.[m.address.toLowerCase()]?.display_name ?? "";
          return (
            m.address.toLowerCase().includes(q) || name.toLowerCase().includes(q)
          );
        })
      : members;

    return sortMembers(matched, sort);
  }, [members, profiles, query, sort]);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-card p-5 text-sm">
        <p className="font-medium">The member list could not be loaded.</p>
        <p className="mt-1 text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has voted or opened a proposal here, imported Snapshot
          history included. <span className="tabular">{members?.length ?? 0}</span>{" "}
          in all.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or address"
            aria-label="Filter members"
            className="h-8 w-full rounded-lg border border-transparent bg-secondary/60 pl-9 pr-3 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-ring/60 focus:bg-secondary"
          />
        </div>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-8 w-[10.5rem] text-xs" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {query
              ? "Nobody here matches that."
              : "No votes or proposals yet, so there is nobody to list."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Proposals</TableHead>
                  <TableHead className="text-right">Votes</TableHead>
                  <TableHead className="text-right">Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((m) => {
                  const profile = profiles?.[m.address.toLowerCase()];
                  const you =
                    !!address &&
                    address.toLowerCase() === m.address.toLowerCase();

                  return (
                    <TableRow
                      key={m.address}
                      className={cn(you && "bg-secondary/40")}
                    >
                      <TableCell>
                        <a
                          href={explorerAddress(m.address)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm hover:text-primary"
                        >
                          <AddressAvatar
                            address={m.address}
                            src={profile?.avatar_url}
                            size={22}
                          />
                          <span
                            className={
                              profile?.display_name
                                ? "max-w-[12rem] truncate"
                                : "tabular"
                            }
                            title={m.address}
                          >
                            {displayName(profile, shortAddress(m.address))}
                          </span>
                        </a>
                        {you && (
                          <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            You
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="tabular text-right text-sm">
                        {m.proposals || (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right text-sm">
                        {m.votes || (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                        {m.lastActive ? timeAgo(m.lastActive) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
