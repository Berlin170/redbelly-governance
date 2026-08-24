"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { ConnectWallet } from "@/components/connect-wallet";
import { MobileSidebar } from "@/components/app-sidebar";
import { activeChain } from "@/lib/chains";

export function TopBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  // Keep the field in step with the URL when navigation changes it, so a
  // back button press does not leave a stale search term on screen.
  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/proposals?q=${encodeURIComponent(trimmed)}` : "/proposals");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <MobileSidebar />

        <form onSubmit={submit} className="relative min-w-0 flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a proposal"
            aria-label="Search for a proposal"
            className="h-9 w-full rounded-lg border border-transparent bg-secondary/60 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring/60 focus:bg-secondary"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          {activeChain.testnet && (
            <span className="hidden rounded border border-status-pending/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-pending sm:inline">
              Testnet
            </span>
          )}
          <ConnectWallet />
        </div>
      </div>
    </header>
  );
}
