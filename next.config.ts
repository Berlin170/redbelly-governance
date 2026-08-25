import type { NextConfig } from "next";

/**
 * `wagmi/connectors` is a barrel: importing WalletConnect from it also drags
 * in connectors this portal never offers, each reaching for optional packages
 * nobody installs. Coinbase's Base Account SDK wants a handful of `@x402/*`
 * payment packages; MetaMask's SDK wants React Native's storage shim, which
 * only exists in a React Native app. WalletConnect's own logger adds one more:
 * pino reaches for a pretty-printer that only ever matters at a dev console.
 * None are used here, so the resolver is told they are absent rather than left
 * to warn about them on every build.
 */
const absentOptionalDeps = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client",
  "@react-native-async-storage/async-storage",
  "pino-pretty",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(absentOptionalDeps.map((name) => [name, false])),
    };
    return config;
  },
  turbopack: {
    resolveAlias: Object.fromEntries(
      // Turbopack has no `false`, so these point at an empty stub instead.
      absentOptionalDeps.map((name) => [name, "./lib/empty-module.ts"]),
    ),
  },
};

export default nextConfig;
