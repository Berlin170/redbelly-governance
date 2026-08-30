"use client";

import { Globe, Github, MessageCircle, BadgeCheck, ShieldCheck, PenLine, FileCheck2 } from "lucide-react";
import { SpaceAvatar } from "@/components/space-avatar";
import { FollowButton } from "@/components/follow-button";
import { LatticeHero } from "@/components/art/lattice";
import { useSpace } from "@/components/space-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const LINKS = [
  { key: "website", icon: Globe, label: "Website" },
  { key: "twitter", icon: null, label: "X" },
  { key: "github", icon: Github, label: "GitHub" },
  { key: "discord", icon: MessageCircle, label: "Discord" },
] as const;

/**
 * The three things that make a vote here mean something. They were previously
 * spread across a metadata row, a footnote under the vote button and a page
 * nobody visits, which is to say they were nowhere — and they are the whole
 * argument for using this portal over a token-weighted poll.
 */
const CLAIMS = [
  {
    icon: ShieldCheck,
    label: "Verified humans",
    detail:
      "Write access to Redbelly requires a Receptor credential backed by a biometric passport check, so an address here belongs to a person — and a one-person-one-vote election actually is one.",
  },
  {
    icon: PenLine,
    label: "Gasless",
    detail:
      "A vote is an EIP-712 signature, not a transaction. It costs nothing and it cannot move anything out of your wallet.",
  },
  {
    icon: FileCheck2,
    label: "Receipts on IPFS",
    detail:
      "Every proposal and ballot is pinned to IPFS, so the signature can be re-checked by anyone without taking this server's word for it.",
  },
] as const;

function Claim({ claim }: { claim: (typeof CLAIMS)[number] }) {
  const { icon: Icon, label, detail } = claim;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="pressable inline-flex cursor-help items-center gap-1.5 rounded-full border border-border-strong/70 bg-background/60 px-2.5 py-1 text-xs font-medium backdrop-blur-sm hover:border-primary/45 hover:text-primary">
          <Icon className="size-3.5 shrink-0 text-primary" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}

export function SpaceHeader() {
  const { space, isLoading } = useSpace();
  const isCanonical =
    !!space?.id && space.id === process.env.NEXT_PUBLIC_SPACE_ID;

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <Skeleton className="h-32 w-full rounded-none sm:h-40" />
        <div className="space-y-3 p-5 sm:p-6">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-6 w-72" />
        </div>
      </div>
    );
  }

  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {/* The art is the banner. It was a raster PNG, which meant a dark image
          on a white page in the light theme; drawn, it themes itself. */}
      <div className="relative h-32 sm:h-40 lg:h-44">
        <LatticeHero className="absolute inset-0" />
        {/* The card colour is faded in at the foot of the art so the seam
            between illustration and content is a gradient, not a hard line. */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
      </div>

      <div className="relative px-5 pb-5 sm:px-6 sm:pb-6">
        {/* Avatar rides the seam. On phones it sits above the title in its own
            row instead of sharing one — the old side-by-side layout starved
            the h1 of width and truncated "Redbelly Network" to "R..". */}
        <div className="-mt-9 flex flex-col gap-4 sm:-mt-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-end sm:gap-3.5">
            <SpaceAvatar
              space={space}
              size={64}
              className="shrink-0 rounded-2xl ring-4 ring-card"
            />

            <div className="min-w-0 pb-0.5">
              <p className="eyebrow mb-1.5 text-muted-foreground">Governance</p>
              {/*
                The name wraps; it does not truncate. Sharing one row with a
                64px avatar left about 280px at phone width, and `truncate`
                spent that budget rendering "Redbelly Netw…" — the product's
                own identity, cut, as the first thing on the page. Two lines
                is not a layout problem. An abbreviated name is.
              */}
              <h1 className="display-wide flex min-w-0 items-center gap-1.5 text-[1.375rem] leading-tight sm:text-[1.75rem] sm:leading-none">
                <span className="min-w-0 break-words">
                  {space?.name ?? "Redbelly DAO"}
                </span>

                {/* The tick means this is the space this deployment is
                    configured to serve, which is the same guarantee Snapshot's
                    verified badge gives: you are looking at the real one and
                    not an impostor space with the same name. Here it is
                    settled by the deployment's own config rather than by a
                    review queue. */}
                {isCanonical && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <BadgeCheck className="size-[18px] shrink-0 text-primary" />
                    </TooltipTrigger>
                    <TooltipContent>
                      The space this deployment is configured to serve
                    </TooltipContent>
                  </Tooltip>
                )}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {space?.id && <FollowButton spaceId={space.id} />}

            <span className="flex items-center gap-0.5">
              {LINKS.map(({ key, icon: Icon, label }) => {
                const href = space?.[key];
                if (!href) return null;

                return (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    title={label}
                    aria-label={label}
                    className="pressable grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {Icon ? (
                      <Icon className="size-4" />
                    ) : (
                      <span className="text-sm font-semibold leading-none">𝕏</span>
                    )}
                  </a>
                );
              })}
            </span>
          </div>
        </div>

        {space?.about && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {space.about.replace(/\n+/g, " ")}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {CLAIMS.map((claim) => (
            <Claim key={claim.label} claim={claim} />
          ))}
        </div>
      </div>
    </header>
  );
}
