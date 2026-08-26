/**
 * Rebuild this portal's record from IPFS alone.
 *
 *   node scripts/rebuild-from-ipfs.mjs                 # verify, write JSON
 *   node scripts/rebuild-from-ipfs.mjs --out ./archive # where to write it
 *   node scripts/rebuild-from-ipfs.mjs --restore       # put missing rows back
 *
 * An untested backup is a story people tell each other, so this script is the
 * test. It starts from the pinning provider's own index — not from our
 * database — walks every receipt, checks each signature against the payload it
 * covers, and reassembles the proposals and votes tables from what verifies.
 * If Supabase were deleted tonight, this is the recovery, and running it on an
 * ordinary Tuesday is how anyone knows that in advance.
 *
 * Two things it deliberately does not do.
 *
 * It does not trust `meta`. Voting power, row ids and timestamps in a receipt
 * are this server's own bookkeeping and were never signed, so a restore
 * carries them across as recorded but they prove nothing; only the contents of
 * `data` are backed by a signature. Re-measuring power means replaying
 * balances at the snapshot block against an archive node, which is a different
 * job than this one.
 *
 * And --restore only inserts what is missing. It never overwrites a live row.
 * A recovery tool that can quietly rewrite the present is a worse hazard than
 * the outage it was written for.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTypedData, getAddress } from "viem";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// -------------------------------------------------------------------- env
function loadEnv() {
  try {
    const text = readFileSync(resolve(root, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (value) process.env[m[1]] ??= value;
    }
  } catch {
    // Running against a machine with only environment variables is fine.
  }
}
loadEnv();

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PINATA_JWT = process.env.PINATA_JWT;
const GATEWAY = (
  option("--gateway", process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://ipfs.io")
).replace(/\/$/, "");
const OUT = resolve(root, option("--out", "archive"));
const RESTORE = flag("--restore");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!PINATA_JWT) {
  console.error("PINATA_JWT is not set. Nothing to enumerate.");
  process.exit(1);
}
if (RESTORE && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error("--restore needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ enumerate
/**
 * Every receipt the provider is holding for us, oldest first.
 *
 * This is the step that makes the archive independent. Listing CIDs out of our
 * own `source_receipt` column would produce a backup whose index lives inside
 * the thing being backed up — fine until the day you actually need it.
 */
async function listPins() {
  const all = [];
  let offset = 0;
  for (;;) {
    const url =
      `https://api.pinata.cloud/data/pinList?status=pinned` +
      `&pageLimit=1000&pageOffset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
    });
    if (!res.ok) {
      throw new Error(`Pinata list failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    const rows = json.rows ?? [];
    all.push(...rows);
    if (rows.length < 1000) break;
    offset += rows.length;
  }
  return all;
}

async function fetchReceipt(cid, attempt = 1) {
  try {
    const res = await fetch(`${GATEWAY}/ipfs/${cid}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    return await res.json();
  } catch (err) {
    // Gateways are flaky in a way that says nothing about whether the content
    // is there. Three tries before calling a receipt unreachable.
    if (attempt < 3) {
      await sleep(attempt * 1500);
      return fetchReceipt(cid, attempt + 1);
    }
    throw err;
  }
}

// --------------------------------------------------------------- verify
/**
 * The receipt carries its own domain and types, so verification never consults
 * anything in this repository. That is the whole point: a check that depends
 * on our constants is a check you are still trusting us to have run honestly.
 */
async function verifyReceipt(r) {
  if (!r || typeof r !== "object") return "not an object";
  if (r.kind !== "vote" && r.kind !== "proposal") return "unknown kind";
  if (!r.data?.message || !r.data?.types) return "no signed data";
  if (typeof r.sig !== "string") return "no signature";

  const fields = r.data.types[r.data.primaryType];
  if (!fields) return `no type definition for ${r.data.primaryType}`;

  const message = {};
  for (const f of fields) {
    const v = r.data.message[f.name];
    if (v === undefined) return `missing field ${f.name}`;
    message[f.name] = /^u?int\d*$/.test(f.type) ? BigInt(v) : v;
  }

  const from = r.data.message.from;
  if (getAddress(r.address) !== getAddress(from)) {
    return "envelope address does not match the signed payload";
  }

  const ok = await verifyTypedData({
    address: getAddress(from),
    domain: {
      name: r.data.domain?.name,
      version: r.data.domain?.version,
      chainId: r.data.domain?.chainId == null ? undefined : Number(r.data.domain.chainId),
    },
    types: r.data.types,
    primaryType: r.data.primaryType,
    message,
    signature: r.sig,
  });
  return ok ? null : "signature does not match the payload";
}

// ------------------------------------------------------------ reassemble
function proposalRow(r, cid) {
  const m = r.data.message;
  return {
    id: r.meta.proposal_id,
    space_id: m.space,
    author: getAddress(m.from),
    title: m.title,
    body: m.body,
    choices: JSON.parse(m.choices),
    voting_system: m.votingSystem,
    strategy: m.strategy,
    require_verified: !!m.requireVerified,
    snapshot_block: r.meta.snapshot_block ?? null,
    quorum: r.meta.quorum ?? 0,
    start_at: new Date(Number(m.start) * 1000).toISOString(),
    end_at: new Date(Number(m.end) * 1000).toISOString(),
    created_at: r.meta.created_at ?? new Date(Number(m.timestamp) * 1000).toISOString(),
    signature: r.sig,
    signed_at: Number(m.timestamp),
    source: "native",
    source_receipt: cid,
  };
}

function voteRow(r, cid) {
  const m = r.data.message;
  return {
    id: r.meta.vote_id ?? undefined,
    proposal_id: m.proposal,
    voter: getAddress(m.from),
    choice: JSON.parse(m.choice),
    // Unsigned: this is what the server measured, not what the voter claimed.
    voting_power: Number(r.meta.voting_power ?? 0),
    reason: m.reason || null,
    signature: r.sig,
    signed_at: Number(m.timestamp),
    created_at: r.meta.created_at ?? new Date(Number(m.timestamp) * 1000).toISOString(),
    source: "native",
    source_receipt: cid,
  };
}

// --------------------------------------------------------------- restore
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

/**
 * Insert rows that are not there, and only those.
 *
 * `Prefer: resolution=ignore-duplicates` is what keeps this additive: a row
 * whose key already exists is left exactly as the database has it, which means
 * a restore run against a healthy database is a no-op rather than a rewrite.
 */
async function restore(table, rows, conflict) {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const out = await db(`${table}?on_conflict=${conflict}`, {
      body: chunk,
      headers: {
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
    });
    inserted += (out ?? []).length;
  }
  return inserted;
}

// ------------------------------------------------------------------ main
async function main() {
  console.log(`Enumerating pins…`);
  const pins = await listPins();
  console.log(`  ${pins.length} pinned object(s)`);

  const proposals = [];
  const votes = [];
  const failures = [];

  for (const [i, pin] of pins.entries()) {
    const cid = pin.ipfs_pin_hash;
    process.stdout.write(`\r  reading ${i + 1}/${pins.length}…`);
    let receipt;
    try {
      receipt = await fetchReceipt(cid);
    } catch (err) {
      failures.push({ cid, reason: `unreachable: ${err.message}` });
      continue;
    }

    const problem = await verifyReceipt(receipt);
    if (problem) {
      failures.push({ cid, reason: problem });
      continue;
    }

    if (receipt.kind === "proposal") proposals.push(proposalRow(receipt, cid));
    else votes.push(voteRow(receipt, cid));
  }
  process.stdout.write("\n");

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "proposals.json"), JSON.stringify(proposals, null, 2));
  writeFileSync(resolve(OUT, "votes.json"), JSON.stringify(votes, null, 2));
  writeFileSync(
    resolve(OUT, "failures.json"),
    JSON.stringify(failures, null, 2)
  );

  console.log(`\nVerified and written to ${OUT}`);
  console.log(`  proposals   ${proposals.length}`);
  console.log(`  votes       ${votes.length}`);
  console.log(`  failures    ${failures.length}`);

  // Loud, because a receipt that does not verify is the one result of this
  // script that needs a human. Everything else is arithmetic.
  for (const f of failures.slice(0, 20)) {
    console.log(`    ! ${f.cid}  ${f.reason}`);
  }
  if (failures.length > 20) console.log(`    … and ${failures.length - 20} more`);

  if (!RESTORE) {
    console.log(`\nNothing was written to the database. Pass --restore to put`);
    console.log(`missing rows back; existing rows are never touched.`);
    return;
  }

  // Proposals first: votes reference them, and a ballot whose proposal is
  // absent is a foreign key error rather than a restore.
  console.log(`\nRestoring…`);
  const p = await restore("proposals", proposals, "id");
  const v = await restore("votes", votes, "proposal_id,voter");
  console.log(`  proposals inserted  ${p}`);
  console.log(`  votes inserted      ${v}`);
  console.log(`  (rows already present were left alone)`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
