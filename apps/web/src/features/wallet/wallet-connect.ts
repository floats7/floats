import { createAppKit, type AppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { defineChain } from "viem";
import { floatApi } from "@/lib/api-client";

let appKitPromise: Promise<AppKit> | undefined;

export function getWalletConnectAppKit(): Promise<AppKit> {
  appKitPromise ??= initializeAppKit();
  return appKitPromise;
}

async function initializeAppKit(): Promise<AppKit> {
  const config = await floatApi.getPublicConfig();
  const isTestnet = config.appEnvironment === "testnet";
  const network = defineChain({
    id: config.chainId,
    name: isTestnet ? "Robinhood Chain Testnet" : "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: {
        http: [isTestnet
          ? "https://rpc.testnet.chain.robinhood.com"
          : "https://rpc.mainnet.chain.robinhood.com"],
      },
    },
    blockExplorers: { default: { name: "Robinhood Explorer", url: config.blockExplorerUrl } },
    testnet: isTestnet,
  });

  return createAppKit({
    adapters: [new EthersAdapter()],
    networks: [network],
    defaultNetwork: network,
    projectId: config.walletConnectProjectId,
    metadata: {
      name: "Floats",
      description: "The onchain IPO index on Robinhood Chain.",
      url: window.location.origin,
      icons: [`${window.location.origin}/icon.png`],
    },
    themeMode: "dark",
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
    },
  });
}
