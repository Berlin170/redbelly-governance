"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortAddress } from "@/lib/utils";
import { activeChain } from "@/lib/chains";
import { LogOut, Wallet, AlertTriangle } from "lucide-react";

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <Button
        onClick={() => injected && connect({ connector: injected })}
        disabled={isPending || !injected}
        size="sm"
      >
        <Wallet className="mr-2 size-4" />
        {isPending ? "Connecting" : "Connect wallet"}
      </Button>
    );
  }

  if (chainId !== activeChain.id) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => switchChain({ chainId: activeChain.id })}
      >
        <AlertTriangle className="mr-2 size-4 text-status-pending" />
        Switch to {activeChain.name}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="tabular">
          <span className="mr-2 size-2 rounded-full bg-status-active" />
          {shortAddress(address!)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => disconnect()}>
          <LogOut className="mr-2 size-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
