"use client";

import { ThemeProvider } from "next-themes";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { SpaceProvider } from "@/components/space-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <SpaceProvider>{children}</SpaceProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
