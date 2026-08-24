"use client";

import { Globe, Github, MessageCircle } from "lucide-react";
import { SpaceAvatar } from "@/components/space-avatar";
import { useSpace } from "@/components/space-provider";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Geometric banner drawn in CSS rather than shipped as an image. It keeps the
 * quarter-circle motif of the DAO's existing governance page without adding a
 * remote asset the page has to wait on.
 */
function Banner({ url }: { url: string | null | undefined }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-32 w-full object-cover sm:h-44"
      />
    );
  }

  return (
    <div
      className="h-32 w-full sm:h-44"
      style={{
        backgroundColor: "#17181b",
        backgroundImage: `
          radial-gradient(circle at 100% 100%, #f44e4f22 0 46px, transparent 46px),
          radial-gradient(circle at 0% 0%,     #f44e4f14 0 46px, transparent 46px),
          radial-gradient(circle at 0% 100%,   #ffffff08 0 46px, transparent 46px)
        `,
        backgroundSize: "92px 92px",
      }}
      aria-hidden
    />
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-muted-foreground">
      <span className="tabular font-semibold text-foreground">
        {value.toLocaleString()}
      </span>{" "}
      {label}
    </span>
  );
}

const LINKS = [
  { key: "website", icon: Globe, label: "Website" },
  { key: "twitter", icon: null, label: "X" },
  { key: "github", icon: Github, label: "GitHub" },
  { key: "discord", icon: MessageCircle, label: "Discord" },
] as const;

export function SpaceHeader() {
  const { space, stats, isLoading } = useSpace();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl sm:h-44" />
        <div className="space-y-2 px-1">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Banner url={space?.banner_url} />

      <div className="px-5 pb-5">
        {/* Avatar straddles the banner edge, the way space pages usually do. */}
        <div className="-mt-9 mb-3">
          <SpaceAvatar
            space={space}
            size={72}
            className="rounded-xl ring-4 ring-card"
          />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          {space?.name ?? "Redbelly DAO"}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Stat value={stats?.proposalCount ?? 0} label="proposals" />
          <Stat value={stats?.voteCount ?? 0} label="votes" />
          <Stat value={space?.followers_count ?? 0} label="followers" />
        </div>

        {space?.about && (
          <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {space.about}
          </p>
        )}

        <div className="mt-4 flex items-center gap-1">
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
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {Icon ? (
                  <Icon className="size-4" />
                ) : (
                  <span className="text-sm font-semibold leading-none">𝕏</span>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
