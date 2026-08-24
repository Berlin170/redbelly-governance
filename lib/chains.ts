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
 * on it to gain write access, which requires a Receptor access credential
 * backed by a biometric passport check — so `isAllowed(address)` is a public,
 * permissionless read of whether an address belongs to a verified person.
 *
 * Deployed on mainnet only; testnet has no equivalent at this address.
 * Override with NEXT_PUBLIC_IDENTITY_REGISTRY if Redbelly redeploys it.
 */
export const REDBELLY_ACCESS_CONTRACT: Record<number, `0x${string}`> = {
  151: "0xcb385cD90ca6b219798F57B4a7958897e91A9163",
};

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 153);

export const activeChain = CHAIN_ID === 151 ? redbellyMainnet : redbellyTestnet;

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? activeChain.rpcUrls.default.http[0];

/** The access contract for the active chain, if there is one. */
export function accessContract(): `0x${string}` | null {
  const override = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY;
  if (override) return override as `0x${string}`;
  return REDBELLY_ACCESS_CONTRACT[CHAIN_ID] ?? null;
}

export function explorerTx(hash: string) {
  return `${activeChain.blockExplorers?.default.url}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `${activeChain.blockExplorers?.default.url}/address/${address}`;
}
