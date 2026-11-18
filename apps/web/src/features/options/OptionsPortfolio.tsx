"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { useToast } from "@/components/ui/Toast";
import { useWallet } from "@/features/wallet/WalletProvider";
import { floatApi, type OptionsPortfolioDto } from "@/lib/api-client";
import { formatUnits } from "@/lib/units";
import styles from "./OptionsPortfolio.module.css";
import { cancelOptionsWithdrawal, claimOptionsPosition, claimOptionsWithdrawal } from "@/lib/options-transactions";

export function OptionsPortfolio() {
  const { address, provider, openConnect } = useWallet();
  const { notify } = useToast();
  const [portfolio, setPortfolio] = useState<OptionsPortfolioDto>();
  const [loading, setLoading] = useState(false);

  useEffect(() => setPortfolio(undefined), [address]);

  const authorize = async () => {
    if (!address || !provider) return;
    setLoading(true);
    try {
      const challenge = await floatApi.getOptionsPortfolioChallenge(address);
      const signature = await provider.request<unknown>({
        method: "personal_sign",
        params: [challenge.message, address],
      });
      if (typeof signature !== "string") throw new Error("Invalid wallet signature");
      setPortfolio(await floatApi.getOptionsPortfolio(challenge.message, signature));
    } catch {
      notify("Options portfolio authorization failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Reveal className={`container ${styles.section}`}>
      <div className={styles.heading}>
        <p className="eyebrow">Wallet portfolio</p>
        <h2>Your option positions.</h2>
      </div>
      {!address ? (
        <EmptyState
          title="Connect a wallet to continue"
          description="Positions and withdrawal requests are returned only after wallet ownership is proven."
          action={<Button onClick={openConnect}>Connect wallet</Button>}
        />
      ) : portfolio === undefined ? (
        <EmptyState
          title="Authorize read-only portfolio access"
          description="Sign a one-time message. This does not send a transaction or approve token spending."
          action={<Button onClick={authorize} loading={loading}>Authorize wallet</Button>}
        />
      ) : (
        <div className={styles.grids}>
          <PortfolioTable portfolio={portfolio} provider={provider} account={address} notify={notify} />
          <WithdrawalTable portfolio={portfolio} provider={provider} account={address} notify={notify} />
        </div>
      )}
    </Reveal>
  );
}

function PortfolioTable({ portfolio, provider, account, notify }: {
  portfolio: OptionsPortfolioDto;
  provider: ReturnType<typeof useWallet>["provider"];
  account: string;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const claim = async (seriesId: string, size18: string) => {
    try {
      if (!provider) throw new Error("WALLET_PROVIDER_MISSING");
      const config = await floatApi.getPublicConfig();
      if (!config.optionsMarketAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      await claimOptionsPosition({ provider, account, market: config.optionsMarketAddress as `0x${string}`, seriesId: seriesId as `0x${string}`, size18: BigInt(size18) });
      notify("Option claim confirmed", "success");
    } catch {
      notify("Claim is not available or failed simulation", "error");
    }
  };
  return (
    <section aria-labelledby="option-positions-title">
      <h3 id="option-positions-title">Open positions</h3>
      {portfolio.positions.length === 0 ? <p>No open option positions.</p> : (
        <div className={styles.scroller} role="region" aria-label="Open option positions" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Series</th><th scope="col">Size</th><th scope="col">Net cash flow</th><th scope="col">Action</th></tr></thead>
            <tbody>{portfolio.positions.map((position) => (
              <tr key={position.seriesId}>
                <td className="tabular">{shortId(position.seriesId)}</td>
                <td className="tabular">{formatUnits(position.size18, 18, 4)} {position.underlyingSymbol ?? shortId(position.underlying)}</td>
                <td className="tabular">{formatSignedUsdg(position.netCashFlow6)}</td>
                <td><Button onClick={() => claim(position.seriesId, position.size18)}>Claim if settled</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WithdrawalTable({ portfolio, provider, account, notify }: {
  portfolio: OptionsPortfolioDto;
  provider: ReturnType<typeof useWallet>["provider"];
  account: string;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const claim = async (requestId: string) => {
    try {
      if (!provider) throw new Error("WALLET_PROVIDER_MISSING");
      const config = await floatApi.getPublicConfig();
      if (!config.optionsVaultAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      await claimOptionsWithdrawal({ provider, account, vault: config.optionsVaultAddress as `0x${string}`, requestId: BigInt(requestId) });
      notify("Withdrawal claim confirmed", "success");
    } catch {
      notify("Withdrawal is not claimable or failed simulation", "error");
    }
  };
  const cancel = async (requestId: string) => {
    try {
      if (!provider) throw new Error("WALLET_PROVIDER_MISSING");
      const config = await floatApi.getPublicConfig();
      if (!config.optionsVaultAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      await cancelOptionsWithdrawal({ provider, account, vault: config.optionsVaultAddress as `0x${string}`, requestId: BigInt(requestId) });
      notify("Withdrawal request cancelled", "success");
    } catch {
      notify("Withdrawal cancellation failed simulation", "error");
    }
  };
  return (
    <section aria-labelledby="option-withdrawals-title">
      <h3 id="option-withdrawals-title">LP withdrawals</h3>
      {portfolio.withdrawals.length === 0 ? <p>No withdrawal requests.</p> : (
        <div className={styles.scroller} role="region" aria-label="LP withdrawal requests" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Request</th><th scope="col">State</th><th scope="col">Shares</th><th scope="col">Action</th></tr></thead>
            <tbody>{portfolio.withdrawals.map((withdrawal) => (
              <tr key={withdrawal.requestId}>
                <td className="tabular">{withdrawal.requestId}</td>
                <td>{withdrawal.state.replace(/^Withdrawal/, "")}</td>
                <td className="tabular">{formatUnits(withdrawal.shares, 18, 4)}</td>
                <td>
                  {withdrawal.state === "WithdrawalFinalized" && <Button onClick={() => claim(withdrawal.requestId)}>Claim</Button>}
                  {withdrawal.state === "WithdrawalRequested" && <Button onClick={() => cancel(withdrawal.requestId)}>Cancel</Button>}
                  {withdrawal.state !== "WithdrawalFinalized" && withdrawal.state !== "WithdrawalRequested" && "Complete"}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatSignedUsdg(value: string): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "-" : "+";
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${formatUnits(absolute.toString(), 6, 2)} USDG`;
}
