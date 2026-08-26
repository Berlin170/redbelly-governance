/**
 * Pinning receipts, and the rules about when we are allowed to care.
 *
 * Server-only. Never import this into a client component — it reads pinning
 * credentials out of the environment.
 *
 * One rule outranks everything else here: **a pinning failure must never cost
 * anyone their vote.** The archive is a second copy of something the database
 * already holds, and no second copy is worth refusing a ballot over. So every
 * function in this file swallows its errors, returns null, and logs. Callers
 * are expected to have already written the row.
 *
 * Configuration is optional in the same spirit. With no credentials set the
 * portal behaves exactly as it did before receipts existed, which is what
 * makes this safe to deploy before the tokens are in place — the same
 * degrade-rather-than-fall-over habit the database code follows.
 *
 *   PINATA_JWT              pins the content. Free tier is far more than this
 *                           DAO will ever need: the entire history to date is
 *                           about 300 KB.
 *   IPFS_PIN_SERVICE_URL    optional mirror, any IPFS Pinning Service API
 *   IPFS_PIN_SERVICE_TOKEN  endpoint (Filebase, 4everland, a self-hosted
 *                           node). It pins by CID once the primary has the
 *                           bytes, so it needs no upload path of its own.
 *
 * The mirror exists because the measured risk to this archive was never
 * volume. It is a provider changing its free tier, which two providers make
 * survivable and one does not.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Receipt } from "./receipts";

const PINATA_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

/** Pinning is a background errand; it does not get to hold a request open. */
const PIN_TIMEOUT_MS = 15_000;

export interface PinningStatus {
  /** False means receipts are switched off, not broken. */
  configured: boolean;
  primary: string | null;
  mirrors: string[];
}

export function pinningStatus(): PinningStatus {
  const mirrors: string[] = [];
  if (process.env.IPFS_PIN_SERVICE_URL && process.env.IPFS_PIN_SERVICE_TOKEN) {
    mirrors.push(process.env.IPFS_PIN_SERVICE_URL);
  }
  const primary = process.env.PINATA_JWT ? "pinata" : null;
  return { configured: !!primary, primary, mirrors };
}

async function postJson(url: string, token: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PIN_TIMEOUT_MS),
  });
}

/**
 * Ask a second provider to hold a copy of a CID the first one already has.
 *
 * Best effort by design, and not awaited for its answer beyond the request
 * itself: pinning services fetch the block over the network on their own
 * schedule, so a queued reply is a success. A mirror that never picks it up
 * costs redundancy, never the receipt.
 */
async function mirror(cid: string, name: string) {
  const url = process.env.IPFS_PIN_SERVICE_URL;
  const token = process.env.IPFS_PIN_SERVICE_TOKEN;
  if (!url || !token) return;

  try {
    const res = await postJson(`${url.replace(/\/$/, "")}/pins`, token, { cid, name });
    // 409 is the service saying it already has this one. That is the goal.
    if (!res.ok && res.status !== 409) {
      console.warn(`[ipfs] mirror declined ${cid}: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[ipfs] mirror unreachable for ${cid}:`, err);
  }
}

/**
 * Pin one receipt. Returns its CID, or null if it did not get pinned — for any
 * reason at all, including "no credentials are configured".
 *
 * Null is an ordinary outcome, not an error condition. The row keeps its null
 * receipt and the sweep in /api/ipfs/pin will come back for it later, which is
 * also how a receipt survives a provider outage that outlasts the request.
 */
export async function pinReceipt(name: string, receipt: Receipt): Promise<string | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;

  try {
    const res = await postJson(PINATA_ENDPOINT, jwt, {
      pinataContent: receipt,
      pinataOptions: { cidVersion: 1 },
      pinataMetadata: {
        name,
        // Enumerable from the provider's own API, which is what lets the
        // rebuild script find every receipt without asking our database.
        // A backup you can only locate through the thing it is backing up is
        // not a backup.
        keyvalues: {
          kind: receipt.kind,
          space: String(receipt.data.message.space ?? ""),
          proposal: String(receipt.meta.proposal_id ?? ""),
        },
      },
    });

    if (!res.ok) {
      console.warn(`[ipfs] pin failed for ${name}: ${res.status} ${await res.text()}`);
      return null;
    }

    const json = (await res.json()) as { IpfsHash?: string };
    const cid = json.IpfsHash;
    if (!cid) {
      console.warn(`[ipfs] pin for ${name} returned no CID`);
      return null;
    }

    await mirror(cid, name);
    return cid;
  } catch (err) {
    console.warn(`[ipfs] pin threw for ${name}:`, err);
    return null;
  }
}

/**
 * Pin a receipt and write its CID back onto the row it belongs to.
 *
 * The write is guarded by `source_receipt is null` so a sweep and a live pin
 * racing over the same row cannot overwrite each other's CID — two pins of
 * identical content produce the same CID anyway, but the guard means the first
 * one recorded is the one that stays, rather than the last one to finish.
 *
 * Errors are logged and dropped. This runs after the response has gone out;
 * there is nobody left to tell.
 */
export async function pinAndRecord(params: {
  table: "votes" | "proposals";
  id: string;
  name: string;
  receipt: Receipt;
  // Passed in rather than imported so this module never builds a database
  // client of its own, and so the sweep can reuse the one it already has.
  db: SupabaseClient;
}): Promise<string | null> {
  const cid = await pinReceipt(params.name, params.receipt);
  if (!cid) return null;

  try {
    const { error } = await params.db
      .from(params.table)
      .update({ source_receipt: cid })
      .eq("id", params.id)
      .is("source_receipt", null);
    if (error) console.warn(`[ipfs] could not record ${cid} on ${params.table}:`, error);
  } catch (err) {
    console.warn(`[ipfs] could not record ${cid} on ${params.table}:`, err);
  }
  return cid;
}
