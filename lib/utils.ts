import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddress(address: string, size = 4) {
  if (!address) return "";
  return `${address.slice(0, 2 + size)}...${address.slice(-size)}`;
}

export function formatPower(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function timeLeft(endAt: string) {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export function proposalState(startAt: string, endAt: string) {
  const now = Date.now();
  if (now < new Date(startAt).getTime()) return "pending" as const;
  if (now > new Date(endAt).getTime()) return "closed" as const;
  return "active" as const;
}

/** Snapshot shows proposals as a short hex handle; imported ids keep theirs. */
export function shortProposalId(proposal: {
  id: string;
  source_id?: string | null;
}) {
  const raw = proposal.source_id ?? proposal.id;
  return `#${raw.replace(/^0x/, "").slice(0, 5)}`;
}

export function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * Snapshot pins every proposal and ballot to IPFS. Linking the receipt turns
 * an imported record from something you take on our word into something you
 * can check against the original, signature and all.
 */
export function receiptUrl(cid: string | null | undefined) {
  if (!cid) return null;
  const hash = cid.replace(/^ipfs:\/\//, "");
  return `https://snapshot.4everland.link/ipfs/${hash}`;
}
