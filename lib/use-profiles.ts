"use client";

import { useQuery } from "@tanstack/react-query";

export interface Profile {
  address: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  twitter: string | null;
  github: string | null;
}

export type ProfileMap = Record<string, Profile>;

/**
 * Resolve many addresses at once.
 *
 * Addresses are sorted into the query key so a list that renders in a
 * different order still hits the same cache entry, and lowercased because
 * that is how the API keys its reply — a checksummed lookup against a
 * lowercased map silently finds nothing.
 */
export function useProfiles(addresses: (string | undefined | null)[]) {
  const keys = [
    ...new Set(addresses.filter(Boolean).map((a) => a!.toLowerCase())),
  ].sort();

  return useQuery({
    queryKey: ["profiles", keys.join(",")],
    enabled: keys.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/profile?addresses=${keys.join(",")}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return (json.profiles ?? {}) as ProfileMap;
    },
  });
}

export function useProfile(address: string | undefined) {
  const { data, ...rest } = useProfiles([address]);
  return {
    ...rest,
    data: address ? data?.[address.toLowerCase()] : undefined,
  };
}

/**
 * What to print for an address. The caller always passes the fallback it
 * would have used anyway, so a missing profile costs nothing.
 */
export function displayName(profile: Profile | undefined, fallback: string) {
  return profile?.display_name?.trim() || fallback;
}
