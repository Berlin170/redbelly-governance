/**
 * Profile normalisation tests. Run with:  npm run test
 *
 * These are not cosmetic. The API route rejects any payload whose fields
 * disagree with their normalised form, so this function decides what the
 * wallet signs and what the table is allowed to keep. Two failure modes matter
 * and neither one throws: normalising too little lets a name render as
 * something other than what is stored, and normalising differently on the two
 * sides makes every honest save look like a forgery.
 */

import {
  cleanText,
  cleanUrl,
  cleanHandle,
  normalizeProfile,
  unnormalizedFields,
  PROFILE_LIMITS,
} from "../lib/profile-fields";

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}\n          got  ${a}\n          want ${e}`);
}

// ------------------------------------------------------------------ text

console.log("\ntext");
{
  check("plain text survives", cleanText("Alice", 40), "Alice");
  check("surrounding space goes", cleanText("  Alice  ", 40), "Alice");
  check("non-strings become empty", cleanText(42, 40), "");
  check("missing becomes empty", cleanText(undefined, 40), "");

  // A name is a label on an address, never a substitute for it — but a label
  // that renders as something other than what is stored is a different thing.
  check(
    "bidi overrides are stripped",
    cleanText("Ali\u202ecents\u202c", 40),
    "Alicents"
  );
  check("control characters are stripped", cleanText("Al\u0001ice", 40), "Alice");
  check("newlines count as control characters", cleanText("Al\nice", 40), "Alice");

  check(
    "over-long text is cut to the cap",
    cleanText("x".repeat(100), PROFILE_LIMITS.name).length,
    PROFILE_LIMITS.name
  );

  // Trimming after stripping, so a name that is only control characters is empty
  // rather than whitespace.
  check("a string of only control characters is empty", cleanText("\u0001\u0002", 40), "");
}

// ------------------------------------------------------------------- url

console.log("\nurl");
{
  check(
    "https survives",
    cleanUrl("https://example.com/a.png"),
    "https://example.com/a.png"
  );
  check("http survives", cleanUrl("http://example.com/a.png"), "http://example.com/a.png");

  // An avatar is fetched and rendered. A javascript: or data: URL there is a
  // script, not a face.
  check("javascript: is refused", cleanUrl("javascript:alert(1)"), "");
  check("data: is refused", cleanUrl("data:image/png;base64,AAAA"), "");
  check("nonsense is refused", cleanUrl("not a url"), "");
  check("empty stays empty", cleanUrl(""), "");

  // URL.toString() is the normaliser, and it is not a no-op: this is exactly
  // the kind of rewrite that used to happen after signing.
  check("a bare host gains its path", cleanUrl("https://example.com"), "https://example.com/");
}

// ---------------------------------------------------------------- handle

console.log("\nhandle");
{
  check("a bare handle survives", cleanHandle("alice"), "alice");
  check("a leading @ is dropped", cleanHandle("@alice"), "alice");
  check("a pasted profile URL is reduced", cleanHandle("https://x.com/alice"), "alice");
  check("a trailing slash is dropped", cleanHandle("https://github.com/alice/"), "alice");
  check("empty stays empty", cleanHandle(""), "");
}

// ------------------------------------------------------- the whole record

console.log("\nprofile");
{
  const raw = {
    displayName: "  Alice  ",
    bio: "Builder",
    avatar: "https://example.com/a.png",
    twitter: "@alice",
    github: "https://github.com/alice",
  };

  check("every field is normalised together", normalizeProfile(raw), {
    displayName: "Alice",
    bio: "Builder",
    avatar: "https://example.com/a.png",
    twitter: "alice",
    github: "alice",
  });

  // Absent is spelled "" and is as much a part of the signed claim as any
  // text, so a cleared bio cannot be replayed as if it were never cleared.
  check("absent fields are empty strings, not undefined", normalizeProfile({}), {
    displayName: "",
    bio: "",
    avatar: "",
    twitter: "",
    github: "",
  });

  // What the route actually calls. Normalised input must report no drift, or
  // every honest save is refused.
  check(
    "already-normal input reports no drift",
    unnormalizedFields(normalizeProfile(raw)),
    []
  );
  check("raw input reports exactly the fields that change", unnormalizedFields(raw), [
    "displayName",
    "twitter",
    "github",
  ]);
  check("an empty record reports no drift", unnormalizedFields({}), []);

  // The round trip the client and server both depend on: normalising twice
  // must equal normalising once, or the two sides can never agree.
  check(
    "normalisation is idempotent",
    normalizeProfile(normalizeProfile(raw)),
    normalizeProfile(raw)
  );
}

console.log(
  failures === 0
    ? `\n${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`
);

process.exit(failures === 0 ? 0 : 1);
