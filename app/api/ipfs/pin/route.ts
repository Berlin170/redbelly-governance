/**
 * The sweep: pin whatever the live path missed.
 *
 * Receipts are pinned after the response goes out, which is the right trade —
 * nobody should wait on a pinning provider to be told their vote counted — but
 * it means the pin is the part of the write that can quietly not happen. The
 * provider is down. The function is frozen before the background task
 * finishes. The credentials were added a week after the code shipped. In every
 * case the row is safe in the database and the receipt is missing.
 *
 * So this endpoint asks the only question that matters: what is signed here
 * and not yet pinned? It is idempotent, it can be run as often as you like,
 * and it is also the backfill — the first run pins the history, later runs pin
 * the stragglers, and the query is the same query.
 *
 * Nothing is pinned unverified. Rows are turned back into the payload their
 * author signed and that reconstruction is checked against the stored
 * signature before it goes anywhere. Publishing a receipt that does not verify
 * would be worse than publishing none: it invites someone to conclude the
 * signature was forged when the truth is that we rebuilt the payload wrong.
 *
 * Guarded by CRON_SECRET, which Vercel sends automatically on scheduled
 * invocations. Unset, the endpoint refuses everyone — an open pinning trigger
 * is a way to spend someone else's storage quota.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingColumn, isMissingTable } from "@/lib/pg-errors";
import { pinningStatus, pinAndRecord } from "@/lib/ipfs";
import {
  voteMessageFromRow,
  proposalMessageFromRow,
  voteReceipt,
  proposalReceipt,
  verifyReceipt,
  type Receipt,
} from "@/lib/receipts";
import type { Proposal, Vote } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * How many rows one run will pin. Small on purpose: a run that times out
 * halfway has still pinned everything it got to, because each CID is recorded
 * as it lands rather than at the end. Backfilling a long history is several
 * runs, and several runs is fine.
 */
const BATCH = 25;

interface Outcome {
  pinned: number;
  /** Rebuilt payload did not match the stored signature. Left alone, logged. */
  unverifiable: number;
  /** No signed timestamp on the row, so no payload can be rebuilt at all. */
  unrebuildable: number;
  /** Pinning provider declined or was unreachable. The sweep will retry. */
  failed: number;
}

const empty = (): Outcome => ({
  pinned: 0,
  unverifiable: 0,
  unrebuildable: 0,
  failed: 0,
});

async function pinIfSound(
  db: ReturnType<typeof supabaseAdmin>,
  table: "votes" | "proposals",
  id: string,
  name: string,
  receipt: Receipt,
  out: Outcome
) {
  const check = await verifyReceipt(receipt);
  if (!check.ok || !check.ours) {
    out.unverifiable++;
    console.warn(
      `[ipfs] not pinning ${table}/${id}: ${check.error ?? "signed over a foreign domain"}`
    );
    return;
  }
  const cid = await pinAndRecord({ table, id, name, receipt, db });
  if (cid) out.pinned++;
  else out.failed++;
}

async function sweepProposals(db: ReturnType<typeof supabaseAdmin>) {
  const out = empty();
  const { data, error } = await db
    .from("proposals")
    .select("*")
    .not("signature", "is", null)
    .is("source_receipt", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) return { out, error };

  for (const p of (data ?? []) as Proposal[]) {
    const message = proposalMessageFromRow(p);
    // Proposals opened before migration 008 kept no signed timestamp, so
    // their payload cannot be rebuilt and never will be. They are counted,
    // not retried into eternity, and they stay linkable through the database
    // exactly as they were before receipts existed.
    if (!message) {
      out.unrebuildable++;
      continue;
    }
    await pinIfSound(
      db,
      "proposals",
      p.id,
      `proposal-${p.id}`,
      proposalReceipt(message, p.signature!, {
        proposal_id: p.id,
        snapshot_block: p.snapshot_block,
        quorum: Number(p.quorum ?? 0),
        created_at: p.created_at,
      }),
      out
    );
  }
  return { out, error: null };
}

async function sweepVotes(db: ReturnType<typeof supabaseAdmin>) {
  const out = empty();
  // The space is part of the signed payload and lives on the proposal, so it
  // is read alongside the ballot rather than in a query per row.
  const { data, error } = await db
    .from("votes")
    .select("*, proposals(id, space_id)")
    .not("signature", "is", null)
    .is("source_receipt", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) return { out, error };

  type Row = Vote & { proposals: { id: string; space_id: string } | null };
  for (const v of (data ?? []) as Row[]) {
    if (!v.proposals) {
      out.unrebuildable++;
      continue;
    }
    const message = voteMessageFromRow(v, v.proposals);
    // Cast before migration 006, or imported. Same story as proposals above.
    if (!message) {
      out.unrebuildable++;
      continue;
    }
    await pinIfSound(
      db,
      "votes",
      v.id,
      `vote-${v.proposal_id}-${v.voter}`,
      voteReceipt(message, v.signature!, {
        proposal_id: v.proposal_id,
        voting_power: Number(v.voting_power),
        created_at: v.created_at,
        vote_id: v.id,
      }),
      out
    );
  }
  return { out, error: null };
}

async function sweep(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not set, so this endpoint is closed. Set it in the " +
          "project's environment; Vercel sends it on scheduled runs.",
      },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const status = pinningStatus();
  if (!status.configured) {
    return NextResponse.json(
      { skipped: "No pinning provider is configured. Set PINATA_JWT.", status },
      { status: 200 }
    );
  }

  const db = supabaseAdmin();
  const proposals = await sweepProposals(db);
  const votes = await sweepVotes(db);

  // A missing column here is migration 008 (or 003) not having been pasted in
  // yet, which is a thing to say plainly rather than a 500 to decode later.
  for (const r of [proposals, votes]) {
    if (r.error && (isMissingColumn(r.error) || isMissingTable(r.error))) {
      return NextResponse.json(
        {
          error:
            "The schema is behind this deployment. Run supabase/migrations/" +
            "008_ipfs_receipts.sql in the SQL editor, then run this again.",
          detail: (r.error as { message?: string }).message,
        },
        { status: 503 }
      );
    }
    if (r.error) {
      return NextResponse.json(
        { error: (r.error as { message?: string }).message ?? "Sweep failed." },
        { status: 500 }
      );
    }
  }

  const done =
    proposals.out.pinned + votes.out.pinned === 0 &&
    proposals.out.failed + votes.out.failed === 0;

  return NextResponse.json({
    proposals: proposals.out,
    votes: votes.out,
    // Whether another run has anything left to do. A full batch means there
    // probably is; the cron will get there, or you can call it again now.
    complete: done,
    status,
  });
}

/** Vercel's scheduler issues GET, so the sweep answers GET. */
export async function GET(req: NextRequest) {
  return sweep(req);
}

/** POST too, because running a backfill by hand should not need a browser. */
export async function POST(req: NextRequest) {
  return sweep(req);
}
