/**
 * Import a Snapshot space — its metadata, every proposal and every ballot —
 * into this portal's Supabase tables.
 *
 *   node scripts/import-snapshot.mjs            # imports NEXT_PUBLIC_SNAPSHOT_SPACE
 *   node scripts/import-snapshot.mjs rbnt.eth   # or an explicit space
 *
 * Re-running is safe: rows are upserted on (source, source_id), so the same
 * proposal is never imported twice and re-running picks up new votes.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// -------------------------------------------------------------------- env
function loadEnv() {
  const text = readFileSync(resolve(root, ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (value) process.env[m[1]] ??= value;
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SPACE_ID = process.env.NEXT_PUBLIC_SPACE_ID ?? "redbelly-dao";
const SNAPSHOT_SPACE =
  process.argv[2] ?? process.env.NEXT_PUBLIC_SNAPSHOT_SPACE ?? "rbnt.eth";
const HUB = "https://hub.snapshot.org/graphql";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}, attempt = 1) {
  const res = await fetch(HUB, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  // The public hub rate-limits fairly aggressively; back off rather than fail.
  if (res.status === 429 && attempt <= 5) {
    await sleep(attempt * 2000);
    return gql(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`Snapshot hub returned ${res.status}`);

  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

async function db(path, { method = "POST", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${res.status} on ${path}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** ipfs:// links do not load in a browser; use Snapshot's own CDN instead. */
function avatarUrl(raw) {
  if (!raw) return null;
  return raw.startsWith("ipfs://")
    ? `https://cdn.stamp.fyi/space/${SNAPSHOT_SPACE}?s=160`
    : raw;
}

/**
 * Snapshot's `type` vocabulary maps onto ours one-to-one, except that `basic`
 * is just single-choice with fixed For/Against/Abstain options.
 */
const TYPE_MAP = {
  basic: "single-choice",
  "single-choice": "single-choice",
  approval: "approval",
  quadratic: "quadratic",
  weighted: "weighted",
  "ranked-choice": "ranked-choice",
  copeland: "copeland",
};

const iso = (seconds) => new Date(seconds * 1000).toISOString();

// ----------------------------------------------------------------- space
async function importSpace() {
  const { space } = await gql(
    `query ($id: String!) {
       space(id: $id) {
         id name about avatar symbol followersCount admins members
         website twitter github
       }
     }`,
    { id: SNAPSHOT_SPACE }
  );

  if (!space) throw new Error(`Snapshot space "${SNAPSHOT_SPACE}" not found`);

  await db("spaces?on_conflict=id", {
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: [
      {
        id: SPACE_ID,
        name: space.name ?? "Redbelly DAO",
        about: space.about ?? null,
        avatar_url: avatarUrl(space.avatar),
        symbol: space.symbol ?? null,
        followers_count: space.followersCount ?? 0,
        admins: space.admins ?? [],
        members: space.members ?? [],
        website: space.website ?? null,
        twitter: space.twitter ? `https://x.com/${space.twitter}` : null,
        github: space.github ? `https://github.com/${space.github}` : null,
        snapshot_space: SNAPSHOT_SPACE,
      },
    ],
  });

  console.log(`space     ${space.name} — ${space.followersCount} followers`);
  return space;
}

// ------------------------------------------------------------- proposals
async function fetchAllProposals() {
  const all = [];
  const PAGE = 20;

  for (let skip = 0; ; skip += PAGE) {
    const { proposals } = await gql(
      `query ($space: String!, $first: Int!, $skip: Int!) {
         proposals(
           first: $first, skip: $skip,
           where: { space: $space },
           orderBy: "created", orderDirection: desc
         ) {
           id ipfs title body type state author created start end quorum
           choices scores scores_total votes snapshot discussion
         }
       }`,
      { space: SNAPSHOT_SPACE, first: PAGE, skip }
    );

    all.push(...proposals);
    if (proposals.length < PAGE) break;
    await sleep(300);
  }

  return all;
}

async function importProposals(proposals) {
  const rows = proposals.map((p) => ({
    space_id: SPACE_ID,
    author: p.author,
    title: p.title,
    body: p.body ?? "",
    discussion: p.discussion || null,
    choices: p.choices,
    voting_system: TYPE_MAP[p.type] ?? "single-choice",
    strategy: "native-balance",
    snapshot_block: p.snapshot ? Number(p.snapshot) : null,
    quorum: Number(p.quorum ?? 0),
    start_at: iso(p.start),
    end_at: iso(p.end),
    created_at: iso(p.created),
    signature: null,
    source: "snapshot",
    source_id: p.id,
    source_type: p.type,
    source_url: `https://snapshot.box/#/s:${SNAPSHOT_SPACE}/proposal/${p.id}`,
    source_scores: p.scores ?? null,
    source_scores_total: p.scores_total ?? null,
    source_vote_count: p.votes ?? 0,
    source_receipt: p.ipfs ?? null,
  }));

  await db("proposals?on_conflict=source,source_id", {
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: rows,
  });

  // Read back so votes can be attached to the local uuid, not the hex id.
  const saved = await db(
    `proposals?select=id,source_id&space_id=eq.${SPACE_ID}&source=eq.snapshot`,
    { method: "GET" }
  );

  const bySourceId = new Map(saved.map((r) => [r.source_id, r.id]));
  console.log(`proposals ${rows.length} imported`);
  return bySourceId;
}

// ------------------------------------------------------------------ votes
async function fetchVotes(proposalId) {
  const all = [];
  const PAGE = 500;

  for (let skip = 0; ; skip += PAGE) {
    const { votes } = await gql(
      `query ($proposal: String!, $first: Int!, $skip: Int!) {
         votes(
           first: $first, skip: $skip,
           where: { proposal: $proposal },
           orderBy: "created", orderDirection: desc
         ) { id ipfs voter created choice vp reason }
       }`,
      { proposal: proposalId, first: PAGE, skip }
    );

    all.push(...votes);
    if (votes.length < PAGE) break;
    await sleep(300);
  }

  return all;
}

async function importVotes(proposals, bySourceId) {
  let total = 0;

  for (const p of proposals) {
    const localId = bySourceId.get(p.id);
    if (!localId) {
      console.warn(`  ! no local row for ${p.id}, skipping its votes`);
      continue;
    }
    if (!p.votes) continue;

    const votes = await fetchVotes(p.id);

    // One ballot per address per proposal is a hard constraint here. Snapshot
    // keeps only the latest vote per voter too, but guard anyway: the newest
    // ballot wins, matching how re-voting behaves on this portal.
    const latest = new Map();
    for (const v of votes) {
      const key = v.voter.toLowerCase();
      const seen = latest.get(key);
      if (!seen || v.created > seen.created) latest.set(key, v);
    }

    const rows = [...latest.values()].map((v) => ({
      proposal_id: localId,
      voter: v.voter,
      choice: v.choice,
      voting_power: v.vp ?? 0,
      reason: v.reason || null,
      signature: null,
      created_at: iso(v.created),
      voted_at: iso(v.created),
      source: "snapshot",
      source_id: v.id,
      source_receipt: v.ipfs ?? null,
    }));

    if (rows.length) {
      await db("votes?on_conflict=proposal_id,voter", {
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: rows,
      });
    }

    total += rows.length;
    console.log(
      `  ${String(rows.length).padStart(4)} votes  ${p.title.slice(0, 58)}`
    );
    await sleep(250);
  }

  console.log(`votes     ${total} imported`);
}

// ------------------------------------------------------------------- run
async function main() {
  console.log(`Importing ${SNAPSHOT_SPACE} -> space "${SPACE_ID}"\n`);

  await importSpace();

  const proposals = await fetchAllProposals();
  const bySourceId = await importProposals(proposals);

  console.log("");
  await importVotes(proposals, bySourceId);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(`\nImport failed: ${err.message}`);
  process.exit(1);
});
