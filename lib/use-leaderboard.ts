"use client";

import { useQuery } from "@tanstack/react-query";
import type { LeaderboardEntry } from "./types";

export function useLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json.members as LeaderboardEntry[];
    },
    // Matches the CDN cache on /api/leaderboard, so a client that already has
    // a fresh copy does not ask for one the edge would only hand straight back.
    staleTime: 60_000,
  });
}
