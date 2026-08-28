"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

/**
 * The proposals the connected wallet has already voted on.
 *
 * Asked once per list and handed down to the rows, the same way profiles are:
 * a row that asked this for itself would put a request behind every line.
 *
 * Deliberately its own request rather than a field on the proposal list. That
 * list is public and cached at the edge for everyone; this answer is different
 * for every visitor and is cached for none of them.
 */
export function useMyVotes() {
  const { address } = useAccount();
  const key = address?.toLowerCase() ?? null;

  return useQuery({
    queryKey: ["my-votes", key],
    enabled: !!key,
    // Short: a member who has just voted and come back to the list should see
    // the tick, not last minute's answer.
    staleTime: 10_000,
    queryFn: async () => {
      const res = await fetch(`/api/votes?voter=${address}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json.proposals as string[];
    },
    // Built here rather than in each caller, so the lookup a row does is a
    // set membership test and not a scan of an array per row.
    select: (ids) => new Set(ids),
  });
}
