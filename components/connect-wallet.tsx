"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddressAvatar } from "@/components/address-avatar";
import { ProfileSheet } from "@/components/profile-sheet";
import { useProfile } from "@/lib/use-profiles";
import { shortAddress } from "@/lib/utils";
import { activeChain } from "@/lib/chains";
import { LogOut, Wallet, AlertTriangle, UserRound } from "lucide-react";

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: profile } = useProfile(address);
  const [editing, setEditing] = useState(false);

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

  const name = profile?.display_name?.trim();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Named accounts drop the tabular figures: they line up hex, not words. */}
          <Button variant="outline" size="sm" className={name ? undefined : "tabular"}>
            {name ? (
              <AddressAvatar
                address={address!}
                src={profile?.avatar_url}
                size={16}
                className="mr-2"
              />
            ) : (
              <span className="mr-2 size-2 rounded-full bg-status-active" />
            )}
            <span className="max-w-[10rem] truncate">
              {name || shortAddress(address!)}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* The address stays readable even when a name is shown, so the
              account behind the label is never a mystery. */}
          <div className="px-2 py-1.5">
            <p className="tabular text-xs text-muted-foreground">
              {shortAddress(address!, 6)}
            </p>
          </div>
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <UserRound className="mr-2 size-4" />
            {name ? "Edit profile" : "Set up profile"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => disconnect()}>
            <LogOut className="mr-2 size-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileSheet open={editing} onOpenChange={setEditing} />
    </>
  );
}
