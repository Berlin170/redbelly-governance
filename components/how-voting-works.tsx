"use client";

import { useState } from "react";
import Link from "next/link";
import { PenLine, ShieldCheck, FileCheck2, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: Wallet,
    title: "Connect a wallet",
    body: "Connecting only reads your address. It grants this site no permission to move anything.",
  },
  {
    icon: ShieldCheck,
    title: "Your voting power is read",
    body: "Depending on the proposal, that is your RBNT balance at the snapshot block, or simply one vote because Redbelly already knows you are a distinct person.",
  },
  {
    icon: PenLine,
    title: "You sign, you do not send",
    body: "A ballot is an EIP-712 signature over the proposal id and your choice. It is not a transaction: it costs no gas, touches no contract, and cannot transfer a token.",
  },
  {
    icon: FileCheck2,
    title: "The ballot is pinned to IPFS",
    body: "Your signed payload gets its own record, so anyone can re-check the signature later without taking this server's word for anything.",
  },
] as const;

/**
 * The answer a first-time visitor needs and could not previously get: what
 * actually happens when the button is pressed. It existed only as one line of
 * small print under the vote button and a page nobody navigates to on purpose.
 */
export function HowVotingWorks({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger ?? (
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
          >
            How this works
          </button>
        )}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How voting works here</DialogTitle>
            <DialogDescription>
              Four steps, and none of them can spend anything.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-3.5">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/[0.08]">
                  <Icon className="size-4 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="tabular mr-1.5 text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    {title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between sm:gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Still unsure what a signature request should look like?
            </p>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/safety" onClick={() => setOpen(false)}>
                Read wallet safety
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
