"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Globe,
  LayoutList,
  Plus,
  Menu,
  ShieldCheck,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { useSpace } from "@/components/space-provider";
import { SpaceAvatar } from "@/components/space-avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: Globe, badge: null },
  { href: "/proposals", label: "Proposals", icon: LayoutList, badge: "proposalCount" },
  { href: "/leaderboard", label: "Members", icon: Trophy, badge: "voterCount" },
  { href: "/safety", label: "Wallet safety", icon: ShieldCheck, badge: null },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { stats } = useSpace();

  return (
    <nav className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        // `/` must not light up for every nested route, and a proposal detail
        // page belongs under Proposals — but only under Proposals. Testing
        // `/proposal` against every entry lit the last one too, so on a
        // proposal page both Proposals and Wallet safety read as current.
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href ||
              (href === "/proposals" && pathname.startsWith("/proposal/"));

        const count = badge && stats ? stats[badge] : null;

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "pressable group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
            )}
          >
            {/* The current item wears the brand rather than only a fill, so
                which page you are on survives a glance. */}
            <span
              className="rail absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary"
              data-on={active ? "true" : "false"}
            />
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count != null && count > 0 && (
              <span className="tabular text-[11px] text-muted-foreground/80">
                {count.toLocaleString()}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * What is live right now. The sidebar was four links and then seven hundred
 * pixels of nothing before a button pinned to the floor — dead space on every
 * page, in the one column that is always on screen. The thing worth putting
 * there is the answer to "is there anything for me to do", which is otherwise
 * only visible on the overview.
 */
function OpenNow({ onNavigate }: { onNavigate?: () => void }) {
  const { stats } = useSpace();
  const open = stats?.activeCount ?? 0;

  if (!stats) return null;

  if (open === 0) {
    return (
      <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nothing is open for voting.
        </p>
      </div>
    );
  }

  return (
    <Link
      href="/proposals"
      onClick={onNavigate}
      className="pressable group block rounded-xl border border-primary/25 bg-primary/[0.07] p-3 hover:border-primary/45"
    >
      <span className="flex items-center gap-1.5">
        <span className="relative grid size-1.5 place-items-center">
          <span className="absolute size-1.5 animate-ping rounded-full bg-status-active/60" />
          <span className="size-1.5 rounded-full bg-status-active" />
        </span>
        <span className="eyebrow text-muted-foreground">Open for voting</span>
      </span>

      <span className="mt-1.5 flex items-baseline gap-1.5">
        <span className="figure text-2xl leading-none">{open}</span>
        <span className="text-xs text-muted-foreground">
          {open === 1 ? "proposal" : "proposals"}
        </span>
      </span>

      <span className="mt-2 inline-flex items-center text-xs font-medium text-primary">
        Go vote
        <ArrowRight className="ml-1 size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { space } = useSpace();

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link
        href="/"
        onClick={onNavigate}
        className="pressable flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-sidebar-accent/50"
      >
        <SpaceAvatar space={space} size={30} className="shrink-0 rounded-lg" />
        <span className="min-w-0">
          <span className="display block truncate text-sm leading-tight">
            {space?.name ?? "Redbelly DAO"}
          </span>
          <span className="block text-[11px] leading-tight text-muted-foreground">
            Governance
          </span>
        </span>
      </Link>

      {/* The primary action sits with the navigation rather than at the far
          end of a column of empty space. */}
      <Button asChild size="sm" className="w-full justify-center">
        <Link href="/create" onClick={onNavigate}>
          <Plus className="mr-1.5 size-4" />
          New proposal
        </Link>
      </Button>

      <NavLinks onNavigate={onNavigate} />

      <div className="mt-auto space-y-3">
        <OpenNow onNavigate={onNavigate} />

        <Link
          href="/safety"
          onClick={onNavigate}
          className="pressable block rounded-xl border border-sidebar-border p-3 hover:border-primary/35"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" />
            One person, one vote
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
            Every address here clears Redbelly&rsquo;s passport-backed identity
            check.
          </span>
        </Link>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-sidebar-border bg-sidebar lg:block">
      <SidebarBody />
    </aside>
  );
}

/** Same navigation as a slide-over, for phones and small tablets. */
export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[17rem] border-sidebar-border bg-sidebar p-0"
      >
        {/* Required for screen readers; the visible title is the space link. */}
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarBody onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
