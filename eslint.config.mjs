import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * ESLint was never set up in this project. `next lint` had been the test
 * script's neighbour in package.json for long enough to look like coverage,
 * but with no config and no packages installed it only ever offered to create
 * them — and answered its own prompt with silence in CI, exiting clean without
 * reading a line of source. A check that cannot fail is worse than no check,
 * because it is counted.
 *
 * `next/core-web-vitals` carries the React and accessibility rules; the
 * `next/typescript` half adds the TypeScript ones. Both come through
 * FlatCompat, which is how eslint-config-next is still shipped.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "supabase/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
