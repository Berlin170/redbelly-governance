import type { PublicClient } from "viem";
import { getAddress } from "viem";

/**
 * Staking pools whose deposits count as RBNT held.
 *
 * A staked coin is still the holder's coin. Leaving it out would mean the
 * members with the longest commitment to the network — the ones who locked
 * for a year — carry the least weight in its governance, which is backwards.
 * Snapshot solves this with a strategy per staking contract; here the pools
 * are listed once and added to the wallet balance.
 *
 * These are Reddex's RBNT pools on Redbelly mainnet, found by tracing stake
 * transactions on chain and confirmed against the amounts the Reddex UI
 * reports:
 *   0x43a1dc10…2817  no lock
 *   0x5e8040e8…946d  365 day lock
 *
 * Override with NEXT_PUBLIC_STAKING_POOLS (comma separated) when pools are
 * added or replaced. Set it to an empty string to count wallet balances only.
 */
const DEFAULT_POOLS = [
  "0x43a1dc107bbb06df266278056055ae7fc5bd2817",
  "0x5e8040e85d0e6363d798a43bea939c026449946d",
] as const;

export function stakingPools(): `0x${string}`[] {
  const configured = process.env.NEXT_PUBLIC_STAKING_POOLS;
  const list =
    configured === undefined
      ? [...DEFAULT_POOLS]
      : configured.split(",").map((a) => a.trim()).filter(Boolean);

  return list.map((a) => getAddress(a));
}

/**
 * `userInfo(address)` returns a struct whose first word is the staked amount.
 * Only that word is decoded; the rest is reward accounting that belongs to
 * the pool, not to voting power.
 */
const userInfoAbi = [
  {
    name: "userInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
] as const;

/**
 * Total staked across every configured pool, in whole RBNT.
 *
 * Errors are not swallowed. A pool that cannot be read would silently shrink
 * someone's voting power, and a vote recorded at the wrong weight is worse
 * than a vote that fails loudly and can be retried.
 */
export async function stakedBalance(
  client: PublicClient,
  voter: string,
  blockNumber?: number | null
): Promise<bigint> {
  const pools = stakingPools();
  if (pools.length === 0) return 0n;

  const blockArg = blockNumber ? { blockNumber: BigInt(blockNumber) } : {};
  const amounts = await Promise.all(
    pools.map((pool) =>
      client.readContract({
        address: pool,
        abi: userInfoAbi,
        functionName: "userInfo",
        args: [getAddress(voter)],
        ...blockArg,
      })
    )
  );

  return amounts.reduce((sum, a) => sum + (a as bigint), 0n);
}
