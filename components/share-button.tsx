"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Copy a link to this proposal.
 *
 * The portal renders a card for every proposal — the state, the question and
 * the turnout — which is what a link unfurls into in Discord or X. None of
 * that is worth anything if getting the link means selecting the address bar,
 * which on a phone is somewhere between awkward and impossible. This is the
 * one control that turns a proposal into something a member can pass on.
 *
 * The URL is read from the address bar rather than rebuilt from an id and a
 * configured origin, so it is necessarily the link that works: whatever host
 * the reader actually reached the page on, preview or production or a future
 * custom domain, is the host their link points at. The hash and query are
 * dropped — they address a scroll position or a filter, not the proposal.
 */
export function ShareButton({ title }: { title?: string }) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    Decided after mount, never during render.

    `navigator.share` does not exist on the server and may differ between the
    HTML the server sent and the browser reading it, so branching on it while
    rendering is a hydration mismatch. The button starts as the copy it can
    always be and upgrades itself once it knows where it is running.

    The coarse-pointer test is doing real work: desktop Chrome on Windows also
    exposes `navigator.share`, where it opens an OS share panel most people
    have never seen and did not ask for. On a phone the sheet is the whole
    point — it is the path to Discord and X. So the sheet is offered where it
    is the better answer and plain copy is used where it is not.
  */
  useEffect(() => {
    setCanNativeShare(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        window.matchMedia("(pointer: coarse)").matches,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function confirm() {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";
    const link = url.toString();

    if (canNativeShare) {
      try {
        await navigator.share({ title, url: link });
        return;
      } catch (err) {
        // Dismissing the sheet rejects with AbortError. That is a decision,
        // not a failure, and falling through to copy would put something on
        // the clipboard of someone who just said no.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      confirm();
    } catch {
      // Clipboard access needs a secure context and can be refused outright.
      // Show the link so it can still be copied by hand rather than leaving
      // a button that appears to do nothing.
      toast.error("Could not copy the link", { description: link });
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={share}
      aria-label={copied ? "Link copied" : "Copy a link to this proposal"}
      className="pressable gap-1.5"
    >
      {copied ? (
        <Check className="size-3.5 text-status-passed" />
      ) : canNativeShare ? (
        <Share2 className="size-3.5" />
      ) : (
        <Link2 className="size-3.5" />
      )}
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
