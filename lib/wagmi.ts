import { http, createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { redbellyMainnet, redbellyTestnet, RPC_URL, CHAIN_ID } from "./chains";

/**
 * A phone's browser has no extension to inject `window.ethereum`, so
 * `injected()` on its own leaves every mobile visitor tapping a button that
 * cannot do anything. WalletConnect is the bridge off the phone's browser and
 * into whichever wallet app is already installed. It needs a free project ID
 * from https://cloud.reown.com and stays out of the config until one is set,
 * so a missing key costs desktop nothing.
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

export const wagmiConfig = createConfig({
  chains: CHAIN_ID === 151 ? [redbellyMainnet] : [redbellyTestnet],
  connectors: [
    injected(),
    // No metadata: WalletConnect reads the title and origin off the document,
    // which keeps preview deploys from announcing themselves as production.
    ...(projectId ? [walletConnect({ projectId, showQrModal: true })] : []),
  ],
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
