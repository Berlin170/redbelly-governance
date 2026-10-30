"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAccount, useSignTypedData } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SelfApp } from "@selfxyz/qrcode";
import { ExternalLink, Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { domain, personhoodTypes, buildPersonhoodMessage } from "@/lib/eip712";
import {
  personhoodEnabled,
  SELF_ENDPOINT,
  SELF_MOCK,
  SELF_SCOPE,
} from "@/lib/personhood-config";

// The QR component opens a websocket and plays an animation, neither of which
// exists on the server. Loaded in the browser only, and only once asked for.
const SelfQRcodeWrapper = dynamic(
  () => import("@selfxyz/qrcode").then((m) => m.SelfQRcodeWrapper),
  { ssr: false, loading: () => <Loader2 className="size-5 animate-spin text-muted-foreground" /> }
);

const SPACE = process.env.NEXT_PUBLIC_SPACE_ID ?? "redbelly-dao";
const APP_NAME = process.env.NEXT_PUBLIC_SPACE_NAME ?? "Redbelly DAO";

const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.proofofpassportapp";

interface Status {
  enabled: boolean;
  bound: boolean;
  document?: string;
  boundAt?: string;
}

/**
 * "Verify you are one person" — the Self half of one person, one vote.
 *
 * Two steps, and the order matters. The wallet signs first, which proves the
 * wallet is the member's; then the member scans a document in the Self app,
 * which proves the document has not been used for another wallet. Neither
 * step alone is enough, and the card says so in as few words as it can.
 */
export function PersonhoodCard() {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [selfApp, setSelfApp] = useState<SelfApp | null>(null);
  const [universalLink, setUniversalLink] = useState("");
  const [starting, setStarting] = useState(false);

  const status = useQuery({
    queryKey: ["personhood", address?.toLowerCase()],
    enabled: personhoodEnabled && !!address,
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/personhood?address=${address}`, { signal, cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Status unavailable.");
      return json as Status;
    },
  });

  if (!personhoodEnabled || !address) return null;
  if (status.data && !status.data.enabled) return null;

  async function start() {
    if (!address) return;
    setStarting(true);
    try {
      const message = buildPersonhoodMessage({ from: address, space: SPACE });
      const signature = await signTypedDataAsync({
        domain,
        types: personhoodTypes,
        primaryType: "Personhood",
        message,
      });

      const res = await fetch("/api/personhood/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { ...message, timestamp: message.timestamp.toString() },
          signature,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start verification.");

      const { SelfAppBuilder, getUniversalLink } = await import("@selfxyz/qrcode");
      // Nothing is disclosed. The proof carries the session id and a
      // nullifier, and that is all the portal asks for.
      const app = new SelfAppBuilder({
        appName: APP_NAME,
        scope: SELF_SCOPE,
        endpoint: SELF_ENDPOINT,
        endpointType: SELF_MOCK ? "staging_https" : "https",
        userId: json.sessionId,
        userIdType: "uuid",
        disclosures: {},
        version: 2,
      }).build();

      setSelfApp(app);
      setUniversalLink(getUniversalLink(app));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start verification.";
      toast.error(msg.includes("User rejected") ? "Signature cancelled." : msg);
    } finally {
      setStarting(false);
    }
  }

  if (status.isPending) {
    return (
      <div className="rounded-lg border border-border p-3.5 text-sm text-muted-foreground">
        Checking one-person verification…
      </div>
    );
  }

  if (status.data?.bound) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border p-3.5">
        <UserCheck className="mt-0.5 size-4 shrink-0 text-status-passed" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Verified as one person</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            With your {status.data.document} via Self
            {status.data.boundAt
              ? ` on ${new Date(status.data.boundAt).toLocaleDateString()}`
              : ""}
            . You can vote on one-person-one-vote proposals created after that
            date. To move this to another wallet, ask a space admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3.5">
      <div className="space-y-1">
        <p className="text-sm font-medium">Verify you are one person</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Scan your passport, chip national ID card (Pakistan NIC works) or
          Aadhaar in the free Self app. Your details stay on your phone: the
          portal only learns that this document has not verified another
          wallet. One document, one wallet.
        </p>
      </div>

      {status.isError && (
        <p className="text-xs text-status-pending">
          {(status.error as Error).message}
        </p>
      )}

      {!selfApp ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={start} disabled={starting}>
            {starting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {starting ? "Waiting for signature" : "Sign and verify with Self"}
          </Button>
          <a
            href={PLAY_STORE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Get Self on Google Play <ExternalLink className="size-3" />
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-center rounded-md bg-white p-2">
            <SelfQRcodeWrapper
              selfApp={selfApp}
              size={220}
              onSuccess={() => {
                toast.success("Verified as one person.");
                setSelfApp(null);
                status.refetch();
              }}
              onError={(data) => {
                toast.error(data.reason ?? "Verification failed. Please try again.");
                setSelfApp(null);
              }}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Scan this with the Self app. On your phone already?{" "}
            <a href={universalLink} className="text-primary hover:underline">
              Open the Self app
            </a>{" "}
            instead. The code works once and expires in 15 minutes.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setSelfApp(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
