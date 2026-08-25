"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

export interface Followers {
  count: number;
  following: boolean;
  available: boolean;
}

export const followersKey = (spaceId: string, address?: string) => [
  "followers",
  spaceId,
  address ?? null,
];

/**
 * The follower total, in one place.
 *
 * The header and the stat strip used to disagree: the header asked this API,
 * which adds follows made here to the imported Snapshot total, while the tile
 * read spaces.followers_count and so only ever showed the import — one behind
 * from the moment the first person followed. A single query keyed by space and
 * viewer keeps the two equal and lets a follow move both at once.
 */
export function useFollowers(spaceId: string | undefined) {
  const { address } = useAccount();

  return useQuery({
    queryKey: followersKey(spaceId ?? "", address),
    enabled: !!spaceId,
    queryFn: async () => {
      const url = `/api/follow?space=${encodeURIComponent(spaceId!)}${
        address ? `&address=${address}` : ""
      }`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return {
        count: json.count ?? 0,
        following: !!json.following,
        available: json.available !== false,
      } as Followers;
    },
    staleTime: 30_000,
  });
}
