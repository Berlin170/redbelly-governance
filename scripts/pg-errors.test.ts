/**
 * Missing-table vs missing-column tests. Run with:  npm run test
 *
 * These two decide whether a half-migrated deployment degrades or breaks, and
 * they are easy to get wrong because PostgREST phrases both failures as the
 * same sentence with a different noun. Getting them backwards is quiet in the
 * worst way: a missing column read as a missing table takes a working feature
 * offline, and a missing table read as a missing column leaves a guard
 * reporting itself active over a table that is not there.
 *
 * The messages below are the ones PostgREST actually returns, not paraphrases.
 */

import { isMissingTable, isMissingColumn } from "../lib/pg-errors";

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

const missingTable = {
  code: "PGRST205",
  message: "Could not find the table 'public.avatar_uploads' in the schema cache",
};

const missingColumn = {
  code: "PGRST204",
  message: "Could not find the 'signed_at' column of 'votes' in the schema cache",
};

const pgMissingTable = { code: "42P01", message: 'relation "votes" does not exist' };
const pgMissingColumn = { code: "42703", message: 'column "signed_at" does not exist' };

console.log("\nno error");
{
  check("null is neither", [isMissingTable(null), isMissingColumn(null)], [false, false]);
}

console.log("\nmissing table");
{
  check("PostgREST table error is a table", isMissingTable(missingTable), true);
  check("PostgREST table error is not a column", isMissingColumn(missingTable), false);
  check("Postgres 42P01 is a table", isMissingTable(pgMissingTable), true);
  check("Postgres 42P01 is not a column", isMissingColumn(pgMissingTable), false);
}

console.log("\nmissing column");
{
  // The case that motivated splitting these apart: both messages end in "in
  // the schema cache", so the table test has to refuse this one on its own.
  check("PostgREST column error is a column", isMissingColumn(missingColumn), true);
  check("PostgREST column error is NOT a table", isMissingTable(missingColumn), false);
  check("Postgres 42703 is a column", isMissingColumn(pgMissingColumn), true);
  check("Postgres 42703 is not a table", isMissingTable(pgMissingColumn), false);
}

console.log("\nunrelated failures");
{
  const other = { code: "23505", message: "duplicate key value violates unique constraint" };
  check("a constraint violation is neither", [isMissingTable(other), isMissingColumn(other)], [false, false]);

  const noCode = { message: "network unreachable" };
  check("an uncoded error is neither", [isMissingTable(noCode), isMissingColumn(noCode)], [false, false]);

  // An error carrying no message at all must not throw on the regex tests.
  check("an empty error object is neither", [isMissingTable({}), isMissingColumn({})], [false, false]);
}

console.log(
  failures === 0
    ? `\n${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`
);

process.exit(failures === 0 ? 0 : 1);
