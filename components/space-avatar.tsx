"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Space } from "@/lib/types";

/**
 * Space avatar with a branded fallback. Remote avatars are served from an
 * IPFS gateway that is occasionally slow or down, and a broken image icon
 * where the DAO's identity should be looks worse than no image at all.
 */
export function SpaceAvatar({
  space,
  size = 40,
  className,
}: {
  space: Space | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const name = space?.name ?? "Redbelly DAO";
  const src = space?.avatar_url;

  if (!src || failed) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-lg bg-primary font-bold text-primary-foreground",
          className
        )}
        style={{ width: size, height: size, fontSize: size * 0.44 }}
        aria-hidden
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0 rounded-lg bg-secondary object-cover",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
