"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProposalListItem } from "./types";

export function useProposals() {
  return useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const res = await fetch("/api/proposals");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json.proposals as ProposalListItem[];
    },
    staleTime: 30_000,
  });
}
