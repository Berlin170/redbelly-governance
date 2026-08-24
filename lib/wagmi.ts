import { http, createConfig } from "wagmi";
import { injected } from "@wagmi/core";
import { redbellyMainnet, redbellyTestnet, RPC_URL, CHAIN_ID } from "./chains";

export const wagmiConfig = createConfig({
  chains: CHAIN_ID === 151 ? [redbellyMainnet] : [redbellyTestnet],
  connectors: [injected()],
  transports: {
    [redbellyMainnet.id]: http(CHAIN_ID === 151 ? RPC_URL : undefined),
    [redbellyTestnet.id]: http(CHAIN_ID === 153 ? RPC_URL : undefined),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
