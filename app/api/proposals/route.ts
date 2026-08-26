import { NextRequest, NextResponse, after } from "next/server";
import { verifyTypedData, getAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingColumn } from "@/lib/pg-errors";
import { pinAndRecord } from "@/lib/ipfs";
import { proposalReceipt } from "@/lib/receipts";
import { domain, proposalTypes } from "@/lib/eip712";
import { currentBlock, getVotingPower } from "@/lib/voting-power";
import { LIMITS, dayAgo, PROPOSAL_THRESHOLD } from "@/lib/limits";
import { VOTING_SYSTEMS } from "@/lib/voting";
import { resultsFor } from "@/lib/results";
import type { Proposal, Vote } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * How long the CDN may serve this list without asking us again.
 *
 * Building it costs two round trips — every proposal in the space, then every
 * ballot in it — and then a tally per proposal. That was about two seconds of
 * server time on every single visit, paid again for each visitor, to produce a
 * page that changes when someone opens a proposal or casts a vote. Neither
 * happens thirty times a minute in a DAO.
 *
 * Thirty seconds is not a number picked for feel: `useProposals` already sets
 * `staleTime: 30_000`, so the client had long since decided a half-minute-old
 * list was current enough. This makes the CDN agree with it rather than
 * rebuilding from scratch behind a client that was not going to look.
 *
 * The one person who would notice staleness is whoever just published a
 * proposal, and they never see this list — `/create` redirects them to
 * `/proposal/{id}`, which is not cached. Same for voting: the detail endpoint
 * stays uncached, so a ballot always shows up the moment it is counted.
 */
const LIST_CACHE = "public, s-maxage=30, stale-while-revalidate=60";

export async function GET(req: NextRequest) {
  const space = req.nextUrl.searchParams.get("space") ?? process.env.NEXT_PUBLIC_SPACE_ID!;
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("proposals")
    .select("*")
    .eq("space_id", space)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const proposals = (data ?? []) as Proposal[];
  if (proposals.length === 0) {
    return NextResponse.json({ proposals: [] }, { headers: { "Cache-Control": LIST_CACHE } });
  }

  // One read for every ballot in the space rather than a query per proposal.
  // At DAO scale (hundreds of votes) this is cheaper than the round trips.
  const { data: voteRows } = await db
    .from("votes")
    .select("proposal_id, voter, choice, voting_power")
    .in(
      "proposal_id",
      proposals.map((p) => p.id)
    );

  const byProposal = new Map<string, Vote[]>();
  for (const v of (voteRows ?? []) as Vote[]) {
    const list = byProposal.get(v.proposal_id);
    if (list) list.push(v);
    else byProposal.set(v.proposal_id, [v]);
  }

  const enriched = proposals.map((p) => {
    const votes = byProposal.get(p.id) ?? [];
    return {
      ...p,
      vote_count: p.source_vote_count ?? votes.length,
      results: resultsFor(p, votes),
    };
  });

  // Only the successful list is cached. An error must not be, or one bad
  // minute at the database would be served to everyone for the next thirty
  // seconds after it had already recovered.
  return NextResponse.json(
    { proposals: enriched },
    { headers: { "Cache-Control": LIST_CACHE } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    const valid = await verifyTypedData({
      address: message.from,
      domain,
      types: proposalTypes,
      primaryType: "Proposal",
      message: {
        ...message,
        start: BigInt(message.start),
        end: BigInt(message.end),
        timestamp: BigInt(message.timestamp),
      },
      signature,
    });

    if (!valid) {
      return NextResponse.json({ error: "Signature does not match author." }, { status: 401 });
    }

    const choices: string[] = JSON.parse(message.choices);
    if (!Array.isArray(choices) || choices.length < 2) {
      return NextResponse.json({ error: "A proposal needs at least two choices." }, { status: 400 });
    }
    if (choices.length > LIMITS.maxChoices) {
      return NextResponse.json({ error: "Too many choices." }, { status: 400 });
    }

    if (message.title.length > LIMITS.titleChars) {
      return NextResponse.json({ error: "Title is too long." }, { status: 400 });
    }
    if (message.body.length > LIMITS.bodyChars) {
      return NextResponse.json({ error: "Body is too long." }, { status: 400 });
    }
    if (choices.some((c) => typeof c !== "string" || c.length > LIMITS.choiceChars)) {
      return NextResponse.json({ error: "A choice is too long." }, { status: 400 });
    }

    // Spam ceilings. Imported history is excluded (signature is null on it),
    // so a bulk import cannot exhaust the day's allowance for real authors.
    const db0 = supabaseAdmin();
    const since = dayAgo();

    const { count: authorToday } = await db0
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("author", getAddress(message.from))
      .not("signature", "is", null)
      .gte("created_at", since);

    if ((authorToday ?? 0) >= LIMITS.perAuthorPerDay) {
      return NextResponse.json(
        { error: `This address has already opened ${LIMITS.perAuthorPerDay} proposals today. Try again tomorrow.` },
        { status: 429 }
      );
    }

    const { count: spaceToday } = await db0
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("space_id", message.space)
      .not("signature", "is", null)
      .gte("created_at", since);

    if ((spaceToday ?? 0) >= LIMITS.perSpacePerDay) {
      return NextResponse.json(
        { error: "This space has reached its proposal limit for today." },
        { status: 429 }
      );
    }
    if (!VOTING_SYSTEMS.some((s) => s.value === message.votingSystem)) {
      return NextResponse.json({ error: "Unknown voting system." }, { status: 400 });
    }

    const start = Number(message.start);
    const end = Number(message.end);
    if (end <= start) {
      return NextResponse.json({ error: "Voting must close after it opens." }, { status: 400 });
    }

    // Balances are read at this block for the whole vote, so buying tokens
    // after a proposal opens cannot buy voting power in it.
    let snapshotBlock: number | null = null;
    try {
      snapshotBlock = await currentBlock();
    } catch {
      snapshotBlock = null; // RPC unreachable — fall back to live balances
    }

    // Proposal validation: hold a stake in the space, or be an admin of it.
    // Checked at the snapshot block like everything else, so an address cannot
    // borrow the threshold for the length of one transaction and hand it back.
    if (PROPOSAL_THRESHOLD > 0) {
      const { data: space } = await db0
        .from("spaces")
        .select("admins")
        .eq("id", message.space)
        .maybeSingle();

      const admins: string[] = (space?.admins ?? []).map((a: string) =>
        a.toLowerCase()
      );
      const isAdmin = admins.includes(message.from.toLowerCase());

      if (!isAdmin) {
        const held = await getVotingPower({
          voter: message.from,
          strategy: message.tokenAddress ? "erc20-balance" : "native-balance",
          tokenAddress: message.tokenAddress || null,
          blockNumber: snapshotBlock,
        });

        if (held < PROPOSAL_THRESHOLD) {
          return NextResponse.json(
            {
              error:
                `Opening a proposal requires ${PROPOSAL_THRESHOLD.toLocaleString()} RBNT. ` +
                `This address holds ${held.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}.`,
            },
            { status: 403 }
          );
        }
      }
    }

    const row: Record<string, unknown> = {
      space_id: message.space,
      author: getAddress(message.from),
      title: message.title,
      body: message.body,
      choices,
      voting_system: message.votingSystem,
      strategy: message.strategy,
      require_verified: !!message.requireVerified,
      token_address: message.tokenAddress || null,
      snapshot_block: snapshotBlock,
      quorum: Number(message.quorum ?? 0),
      start_at: new Date(start * 1000).toISOString(),
      end_at: new Date(end * 1000).toISOString(),
      signature,
      // The signed timestamp, kept for the same reason votes keep theirs:
      // re-verifying a published signature means rebuilding the payload it
      // covers, and `timestamp` is part of that payload. Without it the
      // signature on a proposal is a string nobody — including us — can check.
      signed_at: Number(message.timestamp),
    };

    const db = supabaseAdmin();
    let { data, error } = await db.from("proposals").insert(row).select().single();

    // signed_at arrives with migration 008, and this deployment may be ahead of
    // the SQL editor. Dropping it costs the receipt, not the proposal.
    if (error && isMissingColumn(error)) {
      console.warn(
        "[proposals] signed_at is missing — IPFS receipts are OFF until " +
          "supabase/migrations/008_ipfs_receipts.sql has been run."
      );
      delete row.signed_at;
      ({ data, error } = await db.from("proposals").insert(row).select().single());
    }

    if (error) {
      // 23505 on proposals_signature_key: this exact payload has been posted
      // before. Proposals publish their signatures, so a replay is not an
      // overwrite but a duplicate filed under the original author's name.
      // The unique index is what refuses it; this only explains the refusal.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This proposal has already been posted." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // After the response, for the same reason votes are: the proposal is
    // already open, and nothing about publishing a copy of it should be able
    // to stop it opening.
    const created = data;
    after(async () => {
      await pinAndRecord({
        table: "proposals",
        id: created.id,
        name: `proposal-${created.id}`,
        receipt: proposalReceipt(
          {
            from: message.from,
            space: message.space,
            title: message.title,
            body: message.body,
            choices: message.choices,
            votingSystem: message.votingSystem,
            strategy: message.strategy,
            requireVerified: !!message.requireVerified,
            start,
            end,
            timestamp: Number(message.timestamp),
          },
          signature,
          {
            proposal_id: created.id,
            snapshot_block: snapshotBlock,
            quorum: Number(message.quorum ?? 0),
            created_at: created.created_at ?? null,
          }
        ),
        db,
      });
    });

    return NextResponse.json({ proposal: data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create the proposal.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
