import { defineChain } from "viem";

export const redbellyMainnet = defineChain({
  id: 151,
  name: "Redbelly Network",
  nativeCurrency: { name: "Redbelly", symbol: "RBNT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://governors.mainnet.redbelly.network"] },
  },
  blockExplorers: {
    default: { name: "Routescan", url: "https://redbelly.routescan.io" },
  },
});

export const redbellyTestnet = defineChain({
  id: 153,
  name: "Redbelly Testnet",
  nativeCurrency: { name: "Redbelly", symbol: "RBNT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://governors.testnet.redbelly.network"] },
  },
  blockExplorers: {
    default: {
      name: "Redbelly Explorer",
      url: "https://explorer.testnet.redbelly.network",
    },
  },
  testnet: true,
});

/**
 * Redbelly's network access contract. Every account must call `request(...)`
 * on it to gain write access, which requires a credential issued against a
 * biometric passport check — so `isAllowed(address)` is a public,
 * permissionless read of whether an address is permitted on the network.
 *
 * Note that `isAllowed` alone is NOT a test for a natural person. Businesses
 * are granted through separate extender contracts and answer true here too;
 * see `isIdentityVerified` in `voting-power.ts` for the individual-person test.
 *
 * Deployed on mainnet only; testnet has no equivalent at this address.
 * Override with NEXT_PUBLIC_IDENTITY_REGISTRY if Redbelly redeploys it.
 */
export const REDBELLY_ACCESS_CONTRACT: Record<number, `0x${string}`> = {
  151: "0xcb385cD90ca6b219798F57B4a7958897e91A9163",
};

/**
 * Redbelly's bootstrap registry, which resolves core contracts by name.
 * `getContractAddress("permission")` returns the access contract above, so we
 * prefer asking the registry over trusting a pinned address that a redeploy
 * would silently invalidate. The pin stays as the fallback for when the
 * registry read fails, and an explicit env override still wins over both.
 *
 * The name is case-sensitive: "permission" resolves, "Permission" reverts.
 */
export const BOOTSTRAP_CONTRACTS_REGISTRY: Record<number, `0x${string}`> = {
  151: "0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5",
};

/**
 * Where the access contract keeps its KYC set.
 *
 * `PermissionUpgradeable` exposes no getter for it — `isAllowed` folds KYC and
 * business grants into one boolean — so the only way to ask "did *this person*
 * pass a passport check" is to read the mapping out of storage. Slot 20 was
 * found by probing and then checked against every address that has ever voted
 * here: it is 1 for all 155 KYC'd voters, 0 for the one business-only account
 * and for all four addresses the contract does not allow, and never holds a
 * value other than 0 or 1.
 *
 * This is the one thing here that reads a contract's internals rather than its
 * ABI, and an upgrade could move it without warning. `passedKyc` in
 * `voting-power.ts` therefore proves the slot still behaves like the mapping
 * before trusting a single answer from it.
 */
export const KYC_USERS_SLOT = 20n;

/**
 * An address known to have passed KYC, used to prove the slot above still
 * points at the mapping. It reads 1 at every block back to 1,000,000, so it
 * works as a control at historical snapshot blocks too. This is the operator's
 * own verified wallet by default — pinning a stranger's would make our gate
 * depend on someone else's credential staying valid.
 */
export const KYC_LAYOUT_CANARY: `0x${string}` =
  (process.env.NEXT_PUBLIC_KYC_LAYOUT_CANARY as `0x${string}`) ??
  "0xB80e7a43F8A162CED2DD367A1d41F9B28Cd0e7Aa";

/**
 * Defaults to mainnet. A missing env var should fail loudly against the real
 * chain rather than quietly serve testnet results as if they counted.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 151);

export const activeChain = CHAIN_ID === 151 ? redbellyMainnet : redbellyTestnet;

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? activeChain.rpcUrls.default.http[0];

/** The access contract for the active chain, if there is one. */
export function accessContract(): `0x${string}` | null {
  const override = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY;
  if (override) return override as `0x${string}`;
  return REDBELLY_ACCESS_CONTRACT[CHAIN_ID] ?? null;
}

/** Whether an explicit override is set, which the registry must not overrule. */
export function accessContractIsPinned(): boolean {
  return !!process.env.NEXT_PUBLIC_IDENTITY_REGISTRY;
}

/** The bootstrap registry for the active chain, if there is one. */
export function bootstrapRegistry(): `0x${string}` | null {
  return BOOTSTRAP_CONTRACTS_REGISTRY[CHAIN_ID] ?? null;
}

export function explorerTx(hash: string) {
  return `${activeChain.blockExplorers?.default.url}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `${activeChain.blockExplorers?.default.url}/address/${address}`;
}
