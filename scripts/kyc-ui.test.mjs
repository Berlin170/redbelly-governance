// Run against a local server. Wallet and identity responses are simulated.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(process.env.PLAYWRIGHT_RESOLVE_FROM ?? import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const address = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const browser = await chromium.launch({ headless: true });
mkdirSync(".next/ui-review", { recursive: true });
try {
  for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(({ address, theme }) => {
      localStorage.setItem("theme", theme);
      const events = {};
      window.testWallet = { address, change(next) {
        this.address = next; (events.accountsChanged ?? []).forEach(fn => fn(next ? [next] : []));
      }};
      window.ethereum = {
        on(event, fn) { (events[event] ??= []).push(fn); },
        removeListener(event, fn) { events[event] = (events[event] ?? []).filter(f => f !== fn); },
        async request({ method }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [window.testWallet.address];
          if (method === "eth_chainId") return "0x97";
          if (method === "wallet_requestPermissions" || method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
          return null;
        },
      };
    }, { address, theme });
    let identityMode = "pending", requests = 0, release;
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      let json = {};
      if (url.pathname === "/api/identity") {
        requests++;
        if (identityMode === "pending") await new Promise(resolve => { release = resolve; });
        if (identityMode === "error") return route.fulfill({ status: 503, json: { error: "Unavailable" } });
        json = { verified: identityMode === "verified", chainId: 151 };
      } else if (url.pathname === "/api/space") {
        json = { space: { id: "redbelly", name: "Redbelly DAO", admins: [], members: [], followers_count: 0 },
          stats: { proposalCount: 0, voteCount: 0, activeCount: 0, voterCount: 0, avgTurnout: 0, closedCount: 0 } };
      } else if (url.pathname === "/api/proposals" || url.pathname === "/api/votes") json = { proposals: [] };
      else if (url.pathname === "/api/profile") json = { profiles: {} };
      await route.fulfill({ json });
    });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const connect = page.getByRole("button", { name: "Connect wallet", exact: true }).first();
    await connect.waitFor();
    assert.equal(requests, 0, "Disconnected visitor must not trigger identity lookup");
    await connect.click();
    const option = page.getByRole("button", { name: "Browser wallet", exact: false });
    if (await option.isVisible()) await option.click();
    await page.getByText("Checking wallet verification...", { exact: true }).waitFor();
    const warning = page.getByRole("heading", { name: "Complete KYC to participate in DAO voting" });
    assert.equal(await warning.count(), 0, "Pending request must not imply missing KYC");
    for (let i = 0; !release && i < 100; i++) await new Promise(r => setTimeout(r, 20));
    identityMode = "unverified"; release();
    await warning.waitFor();
    const link = page.getByRole("link", { name: /Complete KYC/ });
    assert.equal(await link.getAttribute("href"), "https://access.redbelly.network/");
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.ok(await page.getByText(/You can still browse proposals/).isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No mobile overflow");
    await page.screenshot({ path: `.next/ui-review/kyc-${width}-${theme}.png`, fullPage: true });
    identityMode = "error";
    await page.getByRole("button", { name: "Check again", exact: true }).click();
    await page.getByRole("button", { name: "Retry KYC check" }).waitFor();
    assert.equal(await warning.count(), 0, "Lookup error must not label wallet unverified");
    identityMode = "verified";
    await page.getByRole("button", { name: "Retry KYC check" }).click();
    await page.getByRole("button", { name: "Retry KYC check" }).waitFor({ state: "detached" });
    assert.equal(await warning.count(), 0, "Verified wallet must not show KYC warning");
    identityMode = "unverified";
    await page.evaluate(next => window.testWallet.change(next), other);
    await warning.waitFor();
    assert.ok(await page.locator("section[aria-labelledby='kyc-notice-title']").getByText("0x2222...2222", { exact: true }).isVisible());
    await page.evaluate(() => window.testWallet.change(null));
    await warning.waitFor({ state: "detached" });
    assert.deepEqual(errors, [], "No runtime errors");
    console.log(`KYC states passed: ${width}px / ${theme}`);
    await context.close();
  }
} finally { await browser.close(); }
