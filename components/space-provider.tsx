"use client";

import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Space, SpaceStats } from "@/lib/types";

interface SpacePayload {
  space: Space | null;
  stats: SpaceStats | null;
  isLoading: boolean;
}

const SpaceContext = createContext<SpacePayload>({
  space: null,
  stats: null,
  isLoading: true,
});

/**
 * The sidebar, the space header and the page titles all need the same space
 * record. Fetching it once here keeps them from making three identical
 * requests on every navigation.
 */
export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["space"],
    queryFn: async () => {
      const res = await fetch("/api/space");
      if (!res.ok) throw new Error("Could not load the space.");
      return (await res.json()) as { space: Space; stats: SpaceStats };
    },
    staleTime: 60_000,
  });

  return (
    <SpaceContext.Provider
      value={{
        space: data?.space ?? null,
        stats: data?.stats ?? null,
        isLoading,
      }}
    >
      {children}
    </SpaceContext.Provider>
  );
}

export const useSpace = () => useContext(SpaceContext);
