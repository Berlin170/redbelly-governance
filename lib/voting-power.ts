import { createPublicClient, http, formatEther, getAddress } from "viem";
import { accessContract, activeChain, RPC_URL } from "./chains";
import { supabaseAdmin } from "./supabase";
import type { VotingStrategy } from "./types";

const client = createPublicClient({
  chain: activeChain,
  transport: http(RPC_URL),
});

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

/**
 * Whether identity checks are backed by an on-chain contract rather than a
 * table this deployment controls.
 */
export function identityRegistryConfigured(): boolean {
  return accessContract() !== null;
}

/**
 * Identity-verified voting power.
 *
 * On mainnet this reads Redbelly's network access contract directly. An
 * address only returns true there if its owner claimed a Receptor access
 * credential, which requires a passport verified by biometric check — so the
 * answer comes from the protocol, not from a list this server keeps.
 *
 * Note what this does and does not prove. It establishes that an address
 * belongs to a verified person. It does not establish that two addresses
 * belong to two *different* people: one credential can enable several
 * accounts. Until a per-person nullifier is available, this is proof of
 * personhood per address, and a determined holder of several enabled accounts
 * could still vote more than once.
 *
 * Eligibility is read at the proposal's snapshot block, not at vote time, for
 * the same reason balances are: the electorate is fixed when the proposal is
 * created. An address credentialed after a vote opens cannot join it, so
 * nobody can look at a live tally and mint the addresses needed to swing it.
 *
 * Testnet has no such contract, so it falls back to a `verified_addresses`
 * table the operator controls — fine for rehearsal, refused on mainnet.
 */
async function verifiedIdentityPower(
  voter: string,
  blockNumber?: number | null
): Promise<number> {
  const registry = accessContract();

  if (!registry && !activeChain.testnet) {
    throw new Error(
      "Identity voting is disabled: no access contract is known for this " +
        "chain. Set NEXT_PUBLIC_IDENTITY_REGISTRY, or eligibility would rest " +
        "on a list this server controls."
    );
  }

  if (registry) {
    const isAllowed = await client.readContract({
      address: registry,
      abi: [
        {
          name: "isAllowed",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "bool" }],
        },
      ] as const,
      functionName: "isAllowed",
      args: [getAddress(voter)],
      ...(blockNumber ? { blockNumber: BigInt(blockNumber) } : {}),
    });
    return isAllowed ? 1 : 0;
  }

  const { data } = await supabaseAdmin()
    .from("verified_addresses")
    .select("address")
    .eq("address", voter.toLowerCase())
    .maybeSingle();

  return data ? 1 : 0;
}

export async function getVotingPower(params: {
  voter: string;
  strategy: VotingStrategy;
  tokenAddress?: string | null;
  blockNumber?: number | null;
}): Promise<number> {
  const { voter, strategy, tokenAddress, blockNumber } = params;
  const address = getAddress(voter);
  const blockArg = blockNumber ? { blockNumber: BigInt(blockNumber) } : {};

  switch (strategy) {
    case "native-balance": {
      const wei = await client.getBalance({ address, ...blockArg });
      return Number(formatEther(wei));
    }

    case "erc20-balance": {
      if (!tokenAddress) throw new Error("Proposal has no token address set");
      const token = getAddress(tokenAddress);
      const [raw, decimals] = await Promise.all([
        client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
          ...blockArg,
        }),
        client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      ]);
      return Number(raw) / 10 ** Number(decimals);
    }

    case "verified-identity":
      return verifiedIdentityPower(voter, blockNumber);

    default:
      throw new Error(`Unknown strategy: ${strategy}`);
  }
}

export async function currentBlock(): Promise<number> {
  return Number(await client.getBlockNumber());
}
