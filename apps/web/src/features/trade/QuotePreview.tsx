import { SummaryList } from "@/components/ui/SummaryList";
import type { AssetDto, IndexStateDto } from "@/lib/api-client";
import { formatPercent } from "@/lib/format";
import { formatUnits } from "@/lib/units";
import { cashSummaryRows } from "./trade-summary";
import styles from "./QuotePreview.module.css";
import type { TradeRequest } from "@/lib/trade";

export function CashPreview({ request }: { request: TradeRequest }) {
  return <SummaryList rows={cashSummaryRows(request).filter((row) => row.label !== "You pay")} />;
}

interface InKindPreviewProps {
  readonly direction: TradeRequest["direction"];
  readonly rawShares?: string;
  readonly inKindFeeBps?: number;
  readonly data: IndexStateDto | null;
  readonly assets: readonly AssetDto[];
}

export function InKindPreview({ direction, rawShares, inKindFeeBps, data, assets }: InKindPreviewProps) {
  if (direction === "Mint") {
    return <p>Buying with in-kind settlement is not supported by the deployed vault. Use cash to buy, or select Sell for an in-kind exit.</p>;
  }
  if (!rawShares || inKindFeeBps === undefined || !data || BigInt(data.totalSupply18) === 0n) {
    return <p>Finalized vault balances are not available for this preview yet.</p>;
  }

  const shares = BigInt(rawShares);
  const feeBps = BigInt(inKindFeeBps);
  const feeShares = shares * feeBps / 10_000n;
  const redeemedShares = shares - feeShares;
  const supply = BigInt(data.totalSupply18);
  const legs = data.holdings.flatMap((holding) => {
    const asset = assets.find((candidate) => candidate.tokenAddress.toLowerCase() === holding.tokenAddress.toLowerCase());
    if (!asset) return [];
    const amount = BigInt(holding.rawBalance) * redeemedShares / supply;
    return [{ symbol: asset.symbol, amount: formatUnits(amount.toString(), asset.decimals, 6) }];
  });

  const holdingsValue = data.holdings.reduce((total, holding) => total + BigInt(holding.valueUsd18 ?? "0"), 0n);
  const idleUsd18 = BigInt(data.navUsd18) > holdingsValue ? BigInt(data.navUsd18) - holdingsValue : 0n;
  const idleUsdgRaw = idleUsd18 / 1_000_000_000_000n;
  const usdgAmount = idleUsdgRaw * redeemedShares / supply;
  const payoutLegs = usdgAmount > 0n
    ? [{ symbol: "USDG", amount: formatUnits(usdgAmount.toString(), 6, 6) }, ...legs]
    : legs;

  return (
    <div className={styles.legs}>
      <SummaryList
        rows={[
          { label: "You sell", value: `${formatUnits(shares.toString(), 18, 6)} fIPO` },
          { label: "Protocol fee", value: `${formatUnits(feeShares.toString(), 18, 6)} fIPO (${formatPercent(inKindFeeBps / 100)})` },
          { label: "Net shares settled", value: `${formatUnits(redeemedShares.toString(), 18, 6)} fIPO`, strong: true },
          { label: "Settlement slippage", value: "None — proportional in-kind transfer" },
          { label: "Snapshot block", value: data.blockNumber.toString() },
        ]}
      />
      <p className="eyebrow">Estimated token payout</p>
      <ul className={styles.legList}>
        {payoutLegs.map((leg) => (
          <li key={leg.symbol} className={styles.leg}>
            <span>{leg.symbol}</span>
            <span className="tabular">{leg.amount}</span>
          </li>
        ))}
      </ul>
      <p className={styles.disclaimer}>Estimate derived from the latest finalized indexer snapshot. The transaction settles against vault balances at execution time.</p>
    </div>
  );
}
