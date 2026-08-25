"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { domain, followTypes, buildFollowMessage } from "@/lib/eip712";
import { useFollowers, followersKey } from "@/lib/use-followers";
import { Check, Plus } from "lucide-react";

/**
 * Follow a space.
 *
 * Signed rather than trusted, like votes: a follower count that anyone can
 * inflate with curl is decoration, not a signal. Nothing is sent on chain and
 * no gas is spent — it is the same kind of signature the rest of the portal
 * asks for.
 */
export function FollowButton({ spaceId }: { spaceId: string }) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const queryClient = useQueryClient();
  const { data } = useFollowers(spaceId);
  const [busy, setBusy] = useState(false);

  const count = data?.count ?? null;
  const following = data?.following ?? false;
  const available = data?.available !== false;

  async function toggle() {
    if (!address) return;
    setBusy(true);
    try {
      const message = buildFollowMessage({
        from: address,
        space: spaceId,
        following: !following,
      });

      const signature = await signTypedDataAsync({
        domain,
        types: followTypes,
        primaryType: "Follow",
        message,
      });

      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { ...message, timestamp: message.timestamp.toString() },
          signature,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update following.");

      // Refetching the shared query moves the header and the stat tile
      // together, rather than only the button that was clicked.
      await queryClient.invalidateQueries({
        queryKey: followersKey(spaceId, address),
      });
      toast.success(json.following ? "Following this space." : "Unfollowed.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update following.";
      toast.error(msg.includes("User rejected") ? "Signature cancelled." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {count !== null && (
        <span className="tabular text-xs text-muted-foreground">
          {count.toLocaleString()} {count === 1 ? "follower" : "followers"}
        </span>
      )}

      {isConnected && available && (
        <Button
          size="sm"
          variant={following ? "outline" : "default"}
          onClick={toggle}
          disabled={busy}
          className="h-7 px-2.5 text-xs"
        >
          {following ? (
            <>
              <Check className="mr-1 size-3.5" />
              Following
            </>
          ) : (
            <>
              <Plus className="mr-1 size-3.5" />
              Follow
            </>
          )}
        </Button>
      )}
    </div>
  );
}
