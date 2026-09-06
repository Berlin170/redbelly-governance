import {
  createPublicClient,
  http,
  formatEther,
  getAddress,
  keccak256,
  encodeAbiParameters,
  zeroAddress,
} from "viem";
import {
  accessContract,
  accessContractIsPinned,
  activeChain,
  bootstrapRegistry,
  KYC_LAYOUT_CANARY,
  KYC_USERS_SLOT,
  RPC_URL,
} from "./chains";
import { supabaseAdmin } from "./supabase";
import { stakedBalance } from "./staking";
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

const registryAbi = [
  {
    name: "getContractAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "contractName", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const permissionAbi = [
  {
    name: "isAllowed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_address", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isPermissionedAccessEnabled",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getPermissionExtenders",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
] as const;

/** Where `kycUsers[address]` lives, by Solidity's mapping slot rule. */
function kycSlot(address: `0x${string}`): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [address, KYC_USERS_SLOT]
    )
  );
}

/** A storage word read as the boolean a `mapping(address => bool)` holds. */
function asFlag(word: `0x${string}` | undefined): boolean | null {
  if (!word) return null;
  const value = BigInt(word);
  if (value === 0n) return false;
  if (value === 1n) return true;
  return null;
}

/**
 * Did this address pass Redbelly's passport KYC?
 *
 * Only asked about addresses an extender claims, which is a handful of the
 * electorate — everyone else is settled by the ABI alone and never reaches a
 * storage read.
 *
 * The slot is not part of any published interface, so the reads that answer
 * the question are accompanied by two that check the question is still being
 * asked of the right place: an address known to hold KYC must read true, and
 * the zero address must read false. If either control disagrees, the layout
 * has moved and we return null rather than a guess. Refusing a vote is loud
 * and the voter says so; admitting a company as a person is silent.
 */
async function passedKyc(
  registry: `0x${string}`,
  address: `0x${string}`,
  at: { blockNumber?: bigint }
): Promise<boolean | null> {
  try {
    const [subject, control, empty] = await Promise.all(
      [address, KYC_LAYOUT_CANARY, zeroAddress as `0x${string}`].map((a) =>
        client.getStorageAt({ address: registry, slot: kycSlot(a), ...at })
      )
    );

    if (asFlag(control) !== true || asFlag(empty) !== false) return null;
    return asFlag(subject);
  } catch {
    return null;
  }
}

/**
 * Resolved once per process. The registry answer cannot change without a
 * governance action on Redbelly's side, and re-reading it on every vote would
 * add a round trip to a number that is stable for months.
 */
let resolvedPermission: `0x${string}` | null | undefined;

/**
 * Where the access contract lives.
 *
 * An explicit `NEXT_PUBLIC_IDENTITY_REGISTRY` wins outright — an operator who
 * pinned an address meant it. Otherwise ask Redbelly's bootstrap registry for
 * `"permission"`, which is how the protocol's own sample resolves it, and fall
 * back to our compiled-in address if that read fails. The two agree today; the
 * registry is what keeps them agreeing after a redeploy.
 */
async function permissionContract(): Promise<`0x${string}` | null> {
  if (accessContractIsPinned()) return accessContract();
  if (resolvedPermission !== undefined) return resolvedPermission;

  const registry = bootstrapRegistry();
  if (registry) {
    try {
      const found = await client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "getContractAddress",
        args: ["permission"],
      });
      if (found && BigInt(found) !== 0n) {
        resolvedPermission = getAddress(found);
        return resolvedPermission;
      }
    } catch {
      // Fall through to the pinned address rather than failing the vote.
    }
  }

  resolvedPermission = accessContract();
  return resolvedPermission;
}

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
 * On mainnet this reads Redbelly's network access contract directly, so the
 * answer comes from the protocol rather than from a list this server keeps.
 *
 * `isAllowed` on its own is not the test we want. Its logic is "permissioned
 * access off, or this address passed KYC, or some extender vouches for it",
 * and the extenders are what grant *business* accounts. A registered company
 * therefore answers true, and counting it as a person would hand a legal
 * entity a human's vote.
 *
 * So an individual is an address the access contract allows that no extender
 * claims — or that one does claim while the contract's KYC set still records a
 * passport against it, because a person who also registered a business holds
 * both grants and is no less a person for it. Redbelly's own
 * `permission-validation` sample stops at the subtraction; that is where it is
 * wrong, and it cost a real member their vote here.
 *
 * Note what this does and does not prove. It establishes that an address
 * belongs to a verified person. It does not establish that two addresses
 * belong to two *different* people: one passport can enable several accounts,
 * measured at roughly ten. The complete `PermissionUpgradeable` ABI carries no
 * function grouping addresses by identity, and the credential presented to
 * `request` carries only `publicAddress`, so nothing on chain can close this.
 * Until a per-person nullifier exists, this is proof of personhood per
 * address, and a holder of several credentialed addresses can vote more than
 * once — up to that ceiling, which is the honest claim to make for it.
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
  const registry = await permissionContract();

  if (!registry && !activeChain.testnet) {
    throw new Error(
      "Identity voting is disabled: no access contract is known for this " +
        "chain. Set NEXT_PUBLIC_IDENTITY_REGISTRY, or eligibility would rest " +
        "on a list this server controls."
    );
  }

  if (registry) {
    const at = blockNumber ? { blockNumber: BigInt(blockNumber) } : {};
    const address = getAddress(voter);

    // `isAllowed` short-circuits to true for *everyone* when permissioned
    // access is off. It is on today and the ABI offers no way to turn it back
    // off, but an upgrade could, and the failure would be silent: an open gate
    // that still reports each voter as verified. Check rather than trust.
    const [enabled, allowed, extenders] = await Promise.all([
      client.readContract({
        address: registry,
        abi: permissionAbi,
        functionName: "isPermissionedAccessEnabled",
        ...at,
      }),
      client.readContract({
        address: registry,
        abi: permissionAbi,
        functionName: "isAllowed",
        args: [address],
        ...at,
      }),
      client.readContract({
        address: registry,
        abi: permissionAbi,
        functionName: "getPermissionExtenders",
        ...at,
      }),
    ]);

    if (!enabled) {
      throw new Error(
        "Identity voting is disabled: Redbelly's permissioned access is off, " +
          "so the access contract allows every address. Counting that as " +
          "verified would open the gate to anyone."
      );
    }

    if (!allowed) return 0;

    // Extenders grant business accounts. Asked at the snapshot block like
    // everything else, so the electorate stays fixed once voting opens.
    //
    // A read that fails is deliberately not treated as "not a business". We
    // would not know either way, and the two errors are not equal: refusing a
    // person their vote is loud and they say so, while admitting a company as
    // a person is silent and corrupts the tally. So an unreadable extender
    // fails the whole check rather than quietly granting the vote.
    const businessChecks = await Promise.all(
      extenders.map((extender) =>
        client.readContract({
          address: extender,
          abi: permissionAbi,
          functionName: "isAllowed",
          args: [address],
          ...at,
        })
      )
    );

    if (!businessChecks.some(Boolean)) return 1;

    // Claimed by an extender — but a business grant does not cancel a passport.
    // A person who registered a company holds both, and subtracting every
    // extender-claimed address took the vote off two addresses belonging to a
    // member who had already voted in earlier gated proposals with them. So
    // ask the KYC set directly, and only rule the address a company when it
    // answers false. Unreadable counts as false: see `passedKyc`.
    return (await passedKyc(registry, address, at)) === true ? 1 : 0;
  }

  const { data } = await supabaseAdmin()
    .from("verified_addresses")
    .select("address")
    .eq("address", voter.toLowerCase())
    .maybeSingle();

  return data ? 1 : 0;
}

/**
 * May this address vote at all?
 *
 * Deliberately separate from voting power. Eligibility asks whether an
 * address belongs to a verified person; power asks how much its vote weighs.
 * Conflating them meant a DAO could not have RBNT-weighted voting restricted
 * to verified members — it had to give up weighting to get the gate.
 *
 * Read at the proposal's snapshot block, like everything else, so a wallet
 * credentialed after voting opened cannot join a vote in progress.
 */
export async function isIdentityVerified(
  voter: string,
  blockNumber?: number | null
): Promise<boolean> {
  return (await verifiedIdentityPower(voter, blockNumber)) === 1;
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
      // Wallet plus stake. Locking coins in a pool does not stop them being
      // the holder's coins, and the alternative gives the least say to the
      // members who committed the most.
      const [wei, staked] = await Promise.all([
        client.getBalance({ address, ...blockArg }),
        stakedBalance(client, address, blockNumber),
      ]);
      return Number(formatEther(wei + staked));
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

/**
 * Seconds between when a block was mined and when a proposal was written.
 *
 * A snapshot block is just an integer, and an integer means something
 * different on every chain. Switch networks, restore a database, import from
 * elsewhere, and a proposal can end up pointing at a block that exists but
 * belongs to a different history — the read succeeds and returns fiction.
 * A proposal is created at the chain's tip, so its block should carry roughly
 * the same timestamp. A large drift means the number is not from this chain.
 */
export async function snapshotDrift(
  blockNumber: number,
  createdAt: string
): Promise<number> {
  const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
  const mined = Number(block.timestamp) * 1000;
  return Math.abs(mined - new Date(createdAt).getTime()) / 1000;
}

/** Drift beyond this means the snapshot block is not from this chain. */
export const MAX_SNAPSHOT_DRIFT_SECONDS = 2 * 60 * 60;
