// Read-only checks. Never print credentials or write to the database.
// Usage: node scripts/production-check.mjs [production-origin]
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const env = process.env;
const origin = new URL(process.argv[2] ?? env.NEXT_PUBLIC_SITE_URL ?? "https://redbelly-governance.vercel.app").origin;
const report = { checkedAt: new Date().toISOString(), origin, checks: [] };
const record = (name, status, detail) => report.checks.push({ name, status, detail });
const fetchTimed = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SPACE_ID", "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "PINATA_JWT", "CRON_SECRET"];
for (const name of required) record(`Local environment: ${name}`, env[name]?.trim() ? "PASS" : "MISSING", "Presence only; hosted values must be checked separately.");
record("Local chain", Number(env.NEXT_PUBLIC_CHAIN_ID ?? 151) === 151 ? "PASS" : "WARN", `Chain ${Number(env.NEXT_PUBLIC_CHAIN_ID ?? 151)}`);
record("Development API proxy", env.NEXT_PUBLIC_API_PROXY ? "WARN" : "PASS", env.NEXT_PUBLIC_API_PROXY ? "Enabled locally; must not accidentally ship." : "Disabled locally.");
record("Receipt mirror", env.IPFS_PIN_SERVICE_URL && env.IPFS_PIN_SERVICE_TOKEN ? "PASS" : "WARN", "A second pinning provider is optional redundancy.");

async function check(name, fn) {
  try { await fn(); }
  catch { record(name, "UNVERIFIED", "Request failed or timed out; no credential values logged."); }
}

await Promise.all([
  check("Production homepage", async () => {
    const res = await fetchTimed(origin);
    const html = await res.text();
    record("Production homepage", res.ok ? "PASS" : "FAIL", `HTTP ${res.status}; HTTPS ${new URL(res.url).protocol === "https:"}`);
    record("Production security headers", "INFO", {
      hsts: !!res.headers.get("strict-transport-security"),
      csp: !!res.headers.get("content-security-policy"),
      frameOptions: !!res.headers.get("x-frame-options"),
      nosniff: res.headers.get("x-content-type-options") === "nosniff",
    });
    record("Production document", html.includes("Redbelly") ? "PASS" : "WARN", "Checked for portal branding.");
  }),
  check("Production space", async () => {
    const res = await fetchTimed(`${origin}/api/space`);
    const json = await res.json();
    record("Production space", res.ok && json.space?.id === env.NEXT_PUBLIC_SPACE_ID ? "PASS" : "FAIL", {
      http: res.status, matchesLocalSpace: json.space?.id === env.NEXT_PUBLIC_SPACE_ID,
      adminCount: json.space?.admins?.length ?? 0, stats: json.stats,
    });
  }),
  check("Production receipts", async () => {
    const res = await fetchTimed(`${origin}/api/ipfs`);
    const json = await res.json();
    record("Production receipts", res.ok && json.pinning?.configured && !json.error ? "PASS" : "FAIL", {
      http: res.status, configured: json.pinning?.configured, provider: json.pinning?.primary,
      mirrorCount: json.pinning?.mirrors?.length ?? 0, proposals: json.proposals, votes: json.votes,
      errorPresent: !!json.error,
    });
  }),
  check("Cron access guard", async () => {
    // Intentionally omit authorization: the route must refuse before pinning.
    const res = await fetchTimed(`${origin}/api/ipfs/pin`);
    record("Cron access guard", res.status === 401 ? "PASS" : "FAIL", `Unauthenticated request: HTTP ${res.status}`);
  }),
  check("Mainnet RPC", async () => {
    const rpc = env.NEXT_PUBLIC_RPC_URL || "https://governors.mainnet.redbelly.network";
    const res = await fetchTimed(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    const json = await res.json();
    record("Mainnet RPC", Number(json.result) === 151 ? "PASS" : "FAIL", { http: res.status, chainId: Number(json.result) || null });
  }),
  check("Database schema", async () => {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchTimed } });
    const columns = {
      spaces: "id,admins,members,snapshot_space",
      proposals: "id,source,source_receipt,signed_at,require_verified,identity_quorum,results_hash,anchor_tx",
      votes: "id,source_receipt,signed_at",
      profiles: "address",
      follows: "follower,source",
      avatar_uploads: "id",
      verified_addresses: "address",
    };
    await Promise.all(Object.entries(columns).map(async ([table, select]) => {
      const res = await db.from(table).select(select, { count: "exact" }).limit(0);
      record(`Schema: ${table}`, res.error ? "FAIL" : "PASS", { rows: res.count, errorCode: res.error?.code ?? null });
    }));
    if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchTimed } });
      const [admin, publicRead] = await Promise.all([
        db.from("avatar_uploads").select("id", { count: "exact" }).limit(0),
        anon.from("avatar_uploads").select("id", { count: "exact" }).limit(0),
      ]);
      record("Avatar metadata read restriction", !admin.error && admin.count > 0 && (publicRead.count === 0 || publicRead.error?.code === "42501") ? "PASS" : "UNVERIFIED", "Compared service-role and anonymous visibility; not a complete RLS audit.");
    }
  }),
]);

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.checks.some((c) => ["FAIL", "MISSING", "UNVERIFIED"].includes(c.status)) ? 1 : 0;
