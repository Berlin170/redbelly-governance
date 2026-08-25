/**
 * Profile field normalisation, shared by the signer and the verifier.
 *
 * It lives here rather than in the API route because of what went wrong when
 * it lived there. The route sanitised each field *after* checking the
 * signature and stored the sanitised value, so the row and the signature
 * beside it described different strings: "@alice" was signed, "alice" was
 * kept. Anyone taking lib/eip712.ts at its word and re-verifying a stored
 * profile got a mismatch, and the promise that a signature can be checked
 * without trusting this server quietly stopped holding for profiles.
 *
 * Normalising before the wallet signs fixes it at the source. The client signs
 * the same string the server stores, the server re-derives it and refuses
 * anything that disagrees, and a stored profile is once again exactly what its
 * address put its name to.
 */

export const PROFILE_LIMITS = {
  name: 40,
  bio: 200,
  url: 500,
  handle: 40,
} as const;

/**
 * A handle is only ever a label on an address, never a substitute for it.
 * Anyone can sign the name "Redbelly Foundation", so nothing here polices what
 * people call themselves. What is stripped is narrower: control characters,
 * and the bidi overrides that let a name render as something other than what
 * is stored.
 */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e]/g, "")
    .trim()
    .slice(0, max);
}

/** Only http(s) images. A javascript: or data: avatar is a script, not a face. */
export function cleanUrl(value: unknown): string {
  const s = cleanText(value, PROFILE_LIMITS.url);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** Handles are stored bare, so "@name" and a pasted profile URL both work. */
export function cleanHandle(value: unknown): string {
  const s = cleanText(value, PROFILE_LIMITS.handle);
  if (!s) return "";
  return s
    .replace(/^@/, "")
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/\/$/, "");
}

export interface ProfileFields {
  displayName: string;
  bio: string;
  avatar: string;
  twitter: string;
  github: string;
}

/**
 * Every field is normalised, empty ones included. Absent is spelled "" and is
 * as much a part of the signed claim as any text — signing only what was
 * filled in would let a cleared bio be replayed as if it were never cleared.
 */
export function normalizeProfile(input: Partial<Record<keyof ProfileFields, unknown>>): ProfileFields {
  return {
    displayName: cleanText(input.displayName, PROFILE_LIMITS.name),
    bio: cleanText(input.bio, PROFILE_LIMITS.bio),
    avatar: cleanUrl(input.avatar),
    twitter: cleanHandle(input.twitter),
    github: cleanHandle(input.github),
  };
}

/** Which fields, if any, disagree with their normalised form. */
export function unnormalizedFields(input: Partial<Record<keyof ProfileFields, unknown>>): string[] {
  const normal = normalizeProfile(input);
  return (Object.keys(normal) as (keyof ProfileFields)[]).filter(
    (key) => normal[key] !== (typeof input[key] === "string" ? input[key] : "")
  );
}
