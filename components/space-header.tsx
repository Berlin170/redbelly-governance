"use client";

import { Globe, Github, MessageCircle, BadgeCheck } from "lucide-react";
import { SpaceAvatar } from "@/components/space-avatar";
import { useSpace } from "@/components/space-provider";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Geometric banner drawn in CSS rather than shipped as an image. It keeps the
 * quarter-circle motif of the DAO's existing governance page without adding a
 * remote asset the page has to wait on.
 *
 * Deliberately short: the primary job of this screen is finding and voting on
 * proposals, and every pixel of banner is a pixel of proposal pushed below the
 * fold. It carries the identity and then gets out of the way.
 */
function Banner({ url }: { url: string | null | undefined }) {
  if (url) {
    return (
      // Taller than the drawn fallback because a real banner has a subject to
      // show. objectPosition sits above centre so the mark and wordmark stay
      // inside the crop at this width instead of being cut across the middle.
      // alt is empty on purpose: the space name is the h1 immediately below,
      // and a screen reader should not hear it twice.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-28 w-full object-cover sm:h-36"
        style={{ objectPosition: "center 40%" }}
      />
    );
  }

  return (
    <div
      className="h-20 w-full sm:h-28"
      style={{
        backgroundColor: "var(--muted)",
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

const LINKS = [
  { key: "website", icon: Globe, label: "Website" },
  { key: "twitter", icon: null, label: "X" },
  { key: "github", icon: Github, label: "GitHub" },
  { key: "discord", icon: MessageCircle, label: "Discord" },
] as const;

export function SpaceHeader() {
  const { space, isLoading } = useSpace();
  const isCanonical =
    !!space?.id && space.id === process.env.NEXT_PUBLIC_SPACE_ID;

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Skeleton className="h-20 w-full rounded-none sm:h-28" />
        <div className="flex gap-4 px-5 pb-4">
          <Skeleton className="-mt-7 size-14 shrink-0 rounded-xl" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Banner url={space?.banner_url} />

      {/* Avatar sits beside the title rather than above it, which is what
          reclaims the vertical space the stacked version was spending. */}
      <div className="flex items-start gap-4 px-5 pb-4">
        <div className="-mt-7 shrink-0">
          <SpaceAvatar
            space={space}
            size={56}
            className="rounded-xl ring-4 ring-card"
          />
        </div>

        <div className="min-w-0 flex-1 pt-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {space?.name ?? "Redbelly DAO"}
              </h1>

              {/* The tick means this is the space this deployment is
                  configured to serve, which is the same guarantee Snapshot's
                  verified badge gives: you are looking at the real one and not
                  an impostor space with the same name. Here it is settled by
                  the deployment's own config rather than by a review queue. */}
              {isCanonical && (
                <BadgeCheck
                  className="size-[18px] shrink-0 text-amber-400"
                  aria-label="Verified space"
                >
                  <title>Verified space</title>
                </BadgeCheck>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
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
                    className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {Icon ? (
                      <Icon className="size-3.5" />
                    ) : (
                      <span className="text-xs font-semibold leading-none">
                        𝕏
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          </div>

          {space?.about && (
            <p className="mt-1 line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {space.about.replace(/\n+/g, " ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
