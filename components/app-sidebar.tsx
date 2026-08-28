"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Globe, LayoutList, Plus, Menu, ShieldCheck, Trophy } from "lucide-react";
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
  { href: "/", label: "Overview", icon: Globe },
  { href: "/proposals", label: "Proposals", icon: LayoutList },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/safety", label: "Wallet safety", icon: ShieldCheck },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        // `/` must not light up for every nested route, and a proposal detail
        // page belongs under Proposals — but only under Proposals. Testing
        // `/proposal` against every entry lit the last one too, so on a
        // proposal page both Proposals and Wallet safety read as current.
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href ||
              (href === "/proposals" && pathname.startsWith("/proposal/"));

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { space } = useSpace();

  return (
    <div className="flex h-full flex-col gap-6 p-3">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-sidebar-accent/50"
      >
        <SpaceAvatar space={space} size={28} />
        <span className="truncate text-sm font-semibold">
          {space?.name ?? "Redbelly DAO"}
        </span>
      </Link>

      <NavLinks onNavigate={onNavigate} />

      <div className="mt-auto">
        <Button asChild size="sm" className="w-full">
          <Link href="/create" onClick={onNavigate}>
            <Plus className="mr-1.5 size-4" />
            New proposal
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-sidebar-border bg-sidebar lg:block">
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
        className="w-64 border-sidebar-border bg-sidebar p-0"
      >
        {/* Required for screen readers; the visible title is the space link. */}
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarBody onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
