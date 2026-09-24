// Run against a local server: node scripts/voting-ui.test.mjs [baseUrl].
// Every API response and wallet signature is simulated; no real ballot is sent.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(process.env.PLAYWRIGHT_RESOLVE_FROM ?? import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:3000";
const address = "0x1111111111111111111111111111111111111111";
const otherAddress = "0x2222222222222222222222222222222222222222";
const now = Date.now();
const iso = (offset) => new Date(now + offset).toISOString();
const results = { system: "single-choice", scores: [0, 0], total: 0,
  participation: 0, winner: null, quorumReached: false, identityCount: 0,
  identityQuorumReached: true, voterCount: 0, scoreUnit: "power" };
const proposal = { id: "ui-active", space_id: "redbelly", author: address,
  title: "Community grants programme", body: "## Funding community projects\n\n" +
    "Members are asked to approve a community grants programme with public progress reports.\n\n".repeat(25),
  choices: ["For", "Against"], voting_system: "single-choice", strategy: "native-balance",
  require_verified: false, quorum: 100, identity_quorum: 0, snapshot_block: 12345,
  start_at: iso(-86400000), end_at: iso(86400000), created_at: iso(-86400000),
  source: "native", signature: null, source_receipt: null, vote_count: 0, results };
const upcoming = { ...proposal, id: "ui-upcoming", title: "Next month's budget", start_at: iso(86400000), end_at: iso(172800000) };
const closed = { ...proposal, id: "ui-closed", title: "Previous community decision", start_at: iso(-172800000), end_at: iso(-86400000) };
const browser = await chromium.launch({ headless: true });
mkdirSync(".next/ui-review", { recursive: true });
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }

try {
  for (const width of [390, 1440]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.addInitScript(({ address, theme }) => {
        localStorage.setItem("theme", theme);
        const listeners = {};
        window.testWallet = {
          address, reject: false, signing: false,
          change(next) { this.address = next; (listeners.accountsChanged ?? []).forEach((fn) => fn([next])); },
        };
        window.ethereum = {
          on(event, fn) { (listeners[event] ??= []).push(fn); },
          removeListener(event, fn) { listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn); },
          async request({ method }) {
            if (method === "eth_requestAccounts" || method === "eth_accounts") return [window.testWallet.address];
            if (method === "eth_chainId") return "0x97";
            if (method === "wallet_requestPermissions" || method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
            if (method === "eth_signTypedData_v4") {
              window.testWallet.signing = true;
              await new Promise((resolve) => { window.testWallet.finish = resolve; });
              if (window.testWallet.reject) throw Object.assign(new Error("User rejected request"), { code: 4001 });
              return "0x" + "1".repeat(130);
            }
            return null;
          },
        };
      }, { address, theme });
      let vote = null;
      let powerMode = "eligible";
      let postCount = 0;
      let releasePower;
      let releaseSave;
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        let json = {};
        if (url.pathname === "/api/space") json = { space: { id: "redbelly", name: "Redbelly DAO", about: "Community governance", admins: [], members: [], followers_count: 0 }, stats: { proposalCount: 3, voteCount: 0, activeCount: 1, voterCount: 0, avgTurnout: 0, closedCount: 1 } };
        else if (url.pathname === "/api/proposals") json = { proposals: [proposal, upcoming, closed] };
        else if (url.pathname.startsWith("/api/proposals/")) json = { proposal, votes: vote ? [vote] : [], results };
        else if (url.pathname === "/api/profile") json = { profiles: {} };
        else if (url.pathname === "/api/power") {
          if (powerMode === "wait") await new Promise((resolve) => { releasePower = resolve; });
          if (powerMode === "error") return route.fulfill({ status: 503, json: { error: "Unavailable" } });
          json = { power: url.searchParams.get("voter")?.toLowerCase() === otherAddress ? 0 : 250 };
        } else if (url.pathname === "/api/votes" && route.request().method() === "POST") {
          postCount++;
          await new Promise((resolve) => { releaseSave = resolve; });
          const { message } = route.request().postDataJSON();
          vote = { id: "test-vote", proposal_id: proposal.id, voter: address,
            choice: JSON.parse(message.choice), voting_power: 250, reason: null,
            signed_at: Number(message.timestamp), created_at: iso(0), source_receipt: null };
          json = { vote };
        } else if (url.pathname === "/api/votes") json = { proposals: vote ? [proposal.id] : [] };
        await route.fulfill({ json });
      });
      await page.goto(base);
      await page.getByRole("heading", { name: "Upcoming", exact: false }).waitFor();
      const recent = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recently closed" }) });
      check(!(await recent.innerText()).includes(upcoming.title), "Upcoming proposal must not appear in recently closed");
      await page.goto(`${base}/proposal/${proposal.id}`);
      await page.getByRole("heading", { name: proposal.title, exact: true }).waitFor();
      await page.getByText("Connect your wallet to check eligibility", { exact: true }).waitFor();
      check((await page.locator("time").first().innerText()).length > 15, "Deadline includes a formatted date");
      if (width === 390) {
        const preview = await page.getByRole("heading", { name: "What you’re voting on" }).boundingBox();
        const ballot = await page.getByText("Cast your vote", { exact: true }).boundingBox();
        check(preview.y < ballot.y, "Mobile shows proposal context before voting");
        await page.getByRole("button", { name: "Read the full proposal" }).click();
        await page.getByRole("button", { name: "Show less" }).click();
      }
      powerMode = "wait";
      await page.getByRole("button", { name: "Connect wallet", exact: true }).first().click();
      const browserWallet = page.getByRole("button", { name: "Browser wallet", exact: false });
      if (await browserWallet.isVisible()) await browserWallet.click();
      await page.getByText("Checking eligibility…", { exact: true }).waitFor();
      check(await page.getByRole("button", { name: "Review and sign" }).isDisabled(), "Cannot sign while checking eligibility");
      powerMode = "eligible";
      releasePower();
      await page.getByText("Eligible to vote", { exact: true }).waitFor();
      await page.getByRole("button", { name: "For", exact: true }).click();
      await page.getByRole("button", { name: "Review and sign" }).click();
      await page.getByRole("button", { name: "Sign in wallet", exact: true }).click();
      await page.getByRole("button", { name: "Waiting for wallet..." }).waitFor();
      check(postCount === 0, "No ballot is submitted before wallet approval");
      await page.evaluate(() => { window.testWallet.reject = true; window.testWallet.finish(); });
      await page.getByRole("button", { name: "Sign in wallet", exact: true }).waitFor();
      check(postCount === 0, "Wallet cancellation never submits a ballot");
      await page.evaluate(() => { window.testWallet.reject = false; });
      await page.getByRole("button", { name: "Sign in wallet", exact: true }).click();
      await page.getByRole("button", { name: "Waiting for wallet..." }).waitFor();
      await page.evaluate(() => window.testWallet.finish());
      await page.getByRole("button", { name: "Submitting vote..." }).waitFor();
      await page.waitForFunction(() => document.body.innerText.includes("Recording your vote"));
      // The UI updates before fetch interception, so wait for that boundary too.
      for (let n = 0; !releaseSave && n < 100; n++) await new Promise((r) => setTimeout(r, 20));
      releaseSave();
      await page.getByText("Vote recorded", { exact: true }).waitFor();
      await page.getByText("IPFS receipt not available yet. Your vote is recorded.", { exact: true }).waitFor();
      vote.source_receipt = "bafy-test-receipt";
      await page.getByRole("button", { name: "Refresh receipt" }).click();
      await page.getByRole("link", { name: "View IPFS receipt", exact: true }).waitFor();
      check(postCount === 1, "Receipt refresh does not cast another vote");
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Page has no horizontal overflow");
      await page.screenshot({ path: `.next/ui-review/proposal-${width}-${theme}.png`, fullPage: true });
      powerMode = "error";
      await page.evaluate((next) => window.testWallet.change(next), otherAddress);
      await page.getByText("Eligibility unavailable", { exact: true }).waitFor();
      check(await page.getByRole("button", { name: "Review and sign" }).isDisabled(), "Previous wallet eligibility cannot enable a new wallet");
      powerMode = "eligible";
      await page.getByRole("button", { name: "Check again", exact: true }).click();
      await page.getByText("Not eligible for this proposal", { exact: true }).waitFor();
      check(await page.getByRole("button", { name: "For", exact: true }).getAttribute("aria-pressed") === "false", "Wallet switch resets ballot selection");
      check(errors.length === 0, `No runtime errors: ${errors.join(", ")}`);
      await context.close();
      console.log(`Passed: ${width}px / ${theme}`);
    }
  }
  console.log(`${checks} voting UI checks passed.`);
} finally {
  await browser.close();
}
