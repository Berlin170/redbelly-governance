"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Derive a stable colour pair from an address. Two addresses that differ
 * anywhere produce visibly different gradients, which is the point: the
 * avatar has to be a recognisable handle for an account, not decoration.
 */
function gradientFor(address: string) {
  const hex = address.toLowerCase().replace(/^0x/, "");
  const hue = parseInt(hex.slice(0, 6) || "0", 16) % 360;
  const hue2 = (hue + 40 + (parseInt(hex.slice(6, 10) || "0", 16) % 120)) % 360;
  return `linear-gradient(135deg, hsl(${hue} 62% 52%), hsl(${hue2} 58% 38%))`;
}

/**
 * Voter avatar. A profile avatar set on this portal wins; otherwise the same
 * CDN Snapshot itself uses supplies any ENS/Snapshot avatar the address
 * already has, so an identity earned elsewhere carries over. Anything without
 * one falls back to a generated gradient rather than a grey blank, so a list
 * of voters stays visually scannable.
 */
export function AddressAvatar({
  address,
  size = 24,
  className,
  src,
}: {
  address: string;
  size?: number;
  className?: string;
  /** A profile avatar, which outranks whatever the address resolves to. */
  src?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const chosen =
    src?.trim() ||
    `https://cdn.stamp.fyi/avatar/eth:${address.toLowerCase()}?s=${size * 2}`;

  // A new URL deserves a fresh attempt; without this, one broken avatar keeps
  // the fallback pinned even after the user corrects it.
  const [tried, setTried] = useState(chosen);
  if (tried !== chosen) {
    setTried(chosen);
    setFailed(false);
  }

  return (
    <Avatar
      className={cn("shrink-0 rounded-md", className)}
      style={{ width: size, height: size }}
    >
      {!failed && (
        <AvatarImage
          src={chosen}
          alt=""
          onError={() => setFailed(true)}
          className="rounded-md object-cover"
        />
      )}
      <AvatarFallback
        className="rounded-md"
        style={{ background: gradientFor(address) }}
        aria-hidden
      />
    </Avatar>
  );
}
