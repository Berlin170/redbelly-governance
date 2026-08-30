"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddressAvatar } from "@/components/address-avatar";
import { ProfileSheet } from "@/components/profile-sheet";
import { useProfile } from "@/lib/use-profiles";
import { shortAddress } from "@/lib/utils";
import { activeChain } from "@/lib/chains";
import {
  LogOut,
  Wallet,
  AlertTriangle,
  UserRound,
  ChevronRight,
} from "lucide-react";

type WalletOption = {
  connector: Connector;
  label: string;
  icon?: string;
};

/**
 * Nothing here can run during render: the server has no `window`, and a
 * first client render that disagreed with the server would tear the
 * hydration. So the answer arrives one effect later, and until then the
 * button offers whatever WalletConnect can do on its own.
 */
function useHasInjectedProvider() {
  const [found, setFound] = useState(false);
  useEffect(() => {
    setFound(typeof window !== "undefined" && "ethereum" in window);
  }, []);
  return found;
}

/**
 * A wallet app's own browser injects a provider, so the deep link hands the
 * visitor the one browser on their phone where this site can connect without
 * WalletConnect at all.
 */
function explainNoWallet() {
  const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  if (!mobile) {
    return toast.error("No wallet detected.", {
      description:
        "Install MetaMask or another browser wallet extension, then reload.",
    });
  }

  toast.error("No wallet in this browser.", {
    description: "Open the portal inside your wallet app to connect.",
    action: {
      label: "Open in MetaMask",
      onClick: () => {
        const { host, pathname, search } = window.location;
        window.location.href = `https://metamask.app.link/dapp/${host}${pathname}${search}`;
      },
    },
  });
}

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect({
    mutation: {
      onError(error) {
        // Closing the wallet's own prompt is an answer, not a failure.
        if (/rejected|denied|closed modal/i.test(error.message)) return;
        // What the old button hit silently on every phone: the connector is
        // listed, but there is no provider behind it in this browser.
        if (/provider not found/i.test(error.message)) return explainNoWallet();
        toast.error(error.message);
      },
    },
  });
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: profile } = useProfile(address);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const hasInjected = useHasInjectedProvider();

  const options = useMemo<WalletOption[]>(() => {
    // EIP-6963 wallets announce themselves by name and icon. When any have,
    // the generic `injected()` entry is the same wallet under a duller label,
    // so it drops out rather than showing up twice.
    const announced = connectors.filter(
      (c) => c.type === "injected" && c.id !== "injected",
    );
    const browserWallets = announced.length
      ? announced
      : hasInjected
        ? connectors.filter((c) => c.id === "injected")
        : [];

    const list: WalletOption[] = browserWallets.map((connector) => ({
      connector,
      label: connector.id === "injected" ? "Browser wallet" : connector.name,
      icon: connector.icon,
    }));

    const walletConnect = connectors.find((c) => c.type === "walletConnect");
    if (walletConnect) {
      list.push({ connector: walletConnect, label: "WalletConnect" });
    }

    return list;
  }, [connectors, hasInjected]);

  if (!isConnected) {
    // One way in means no menu to pick from, and no way in still gets a
    // button — a dead control tells the visitor nothing about why.
    if (options.length <= 1) {
      const only = options[0];
      return (
        <Button
          onClick={() =>
            only ? connect({ connector: only.connector }) : explainNoWallet()
          }
          disabled={isPending}
          size="sm"
        >
          <Wallet className="mr-2 size-4" />
          {isPending ? "Connecting" : "Connect wallet"}
        </Button>
      );
    }

    /*
      Picking a wallet is a decision, not a menu command.

      As a dropdown the choices arrived as a strip of 32px rows with the wallet
      icons shrunk to 16px — the one screen where a visitor is deciding whether
      to trust this site at all, rendered as an afterthought. A dialog gives
      each wallet a real target, and room for the one sentence that answers
      what connecting actually does.
    */
    return (
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogTrigger asChild>
          <Button disabled={isPending} size="sm">
            <Wallet className="mr-2 size-4" />
            {isPending ? "Connecting" : "Connect wallet"}
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect a wallet</DialogTitle>
            <DialogDescription>
              Connecting only reads your address. It gives this site no
              permission to move anything you hold.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {options.map((option) => (
              <button
                key={option.connector.uid}
                type="button"
                disabled={isPending}
                onClick={() => {
                  setPicking(false);
                  connect({ connector: option.connector });
                }}
                className="pressable flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left text-sm font-medium hover:border-primary/45 hover:bg-accent/40 disabled:opacity-60"
              >
                {option.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.icon} alt="" className="size-7 rounded-md" />
                ) : (
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border">
                    <Wallet className="size-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            On a phone, browser wallets only exist inside a wallet app&rsquo;s
            own browser. WalletConnect reaches the app from anywhere.
          </p>
        </DialogContent>
      </Dialog>
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
