import { createPublicClient, http, parseAbi, type Address } from "viem";

const RPC_URL = process.env.RPC_INDEXER ?? process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const EXPECTED_CHAIN_ID = 4663;

const FEEDS = [
  { symbol: "CRCL", address: "0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a" },
  { symbol: "CRWV", address: "0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C" },
  { symbol: "SPCX", address: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb" },
] as const satisfies readonly { symbol: string; address: Address }[];

const aggregatorAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

async function inspectFeeds() {
  const client = createPublicClient({ transport: http(RPC_URL) });
  const chainId = await client.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Expected chain ${EXPECTED_CHAIN_ID}, received ${chainId}`);
  }

  const observedAt = BigInt(Math.floor(Date.now() / 1_000));
  const results = await Promise.all(FEEDS.map(async (feed) => {
    const [code, decimals, description, round] = await Promise.all([
      client.getCode({ address: feed.address }),
      client.readContract({ address: feed.address, abi: aggregatorAbi, functionName: "decimals" }),
      client.readContract({ address: feed.address, abi: aggregatorAbi, functionName: "description" }),
      client.readContract({ address: feed.address, abi: aggregatorAbi, functionName: "latestRoundData" }),
    ]);

    if (!code || code === "0x") throw new Error(`${feed.symbol} feed has no runtime code`);
    const [roundId, answer, startedAt, updatedAt, answeredInRound] = round;
    if (answer <= 0n || updatedAt === 0n || answeredInRound < roundId) {
      throw new Error(`${feed.symbol} feed returned an invalid round`);
    }

    return {
      symbol: feed.symbol,
      address: feed.address,
      description,
      decimals,
      roundId: roundId.toString(),
      answer: answer.toString(),
      startedAt: startedAt.toString(),
      updatedAt: updatedAt.toString(),
      ageSeconds: (observedAt - updatedAt).toString(),
      runtimeBytes: (code.length - 2) / 2,
    };
  }));

  return { chainId, observedAt: observedAt.toString(), feeds: results };
}

try {
  console.log(JSON.stringify(await inspectFeeds(), null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown feed inspection failure";
  console.error(`Feed inspection failed: ${message}`);
  process.exitCode = 1;
}
