/**
 * Telling apart the two ways this database says "not yet".
 *
 * Migrations here are pasted into the Supabase SQL editor by hand, so a
 * deployment can be ahead of its schema for as long as that takes. The
 * portal's standing answer is to degrade rather than fall over: a feature
 * whose table has not arrived reports itself unavailable, and a guard whose
 * column has not arrived stays off, but neither takes the page down.
 *
 * That only works if the two cases can be told apart, and they are easy to
 * confuse. Postgres has distinct codes — 42P01 for the table, 42703 for the
 * column — but supabase-js usually surfaces PostgREST's answer instead, which
 * comes from its own schema cache and phrases both failures as the same
 * sentence with a different noun:
 *
 *   Could not find the table 'public.votes' in the schema cache
 *   Could not find the 'signed_at' column of 'votes' in the schema cache
 *
 * So the column test matches the noun rather than the sentence, and callers
 * asking both questions ask that one first. A looser test answers yes to both
 * and the first branch wins every time.
 *
 * These live apart from lib/supabase.ts deliberately: that module builds a
 * client from the environment as soon as it is imported, and a pair of pure
 * predicates should be checkable without one.
 */

interface PgError {
  code?: string;
  message?: string;
}

/** "That table is not there yet." */
export function isMissingTable(error: PgError | null) {
  if (!error) return false;
  if (isMissingColumn(error)) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache/i.test(error.message ?? "")
  );
}

/** "That column is not there yet." Ask this before asking about the table. */
export function isMissingColumn(error: PgError | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "") ||
    /could not find the .* column/i.test(error.message ?? "")
  );
}
