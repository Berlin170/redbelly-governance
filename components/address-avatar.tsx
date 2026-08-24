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
 * Voter avatar. Real ENS/Snapshot avatars come from the same CDN Snapshot
 * itself uses, so an address that already has an identity elsewhere keeps it
 * here. Anything without one falls back to a generated gradient rather than a
 * grey blank, so a list of voters stays visually scannable.
 */
export function AddressAvatar({
  address,
  size = 24,
  className,
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <Avatar
      className={cn("shrink-0 rounded-md", className)}
      style={{ width: size, height: size }}
    >
      {!failed && (
        <AvatarImage
          src={`https://cdn.stamp.fyi/avatar/eth:${address.toLowerCase()}?s=${size * 2}`}
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
