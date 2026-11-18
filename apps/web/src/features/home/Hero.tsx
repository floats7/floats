import { MaskedHeading } from "@/components/ui/MaskedHeading";
import { Reveal } from "@/components/ui/Reveal";
import { HoldingsTicker } from "./HoldingsTicker";
import { ShootingStars } from "./ShootingStars";
import { HeroStage } from "./HeroStage";
import styles from "./Hero.module.css";
import { ContractAddressBadge } from "./ContractAddressBadge";

export function Hero() {
  const configuredAddress = process.env.FLOATS_CONTRACT_ADDRESS?.trim();
  const contractAddress = configuredAddress && /^0x[0-9a-fA-F]{40}$/.test(configuredAddress)
    ? configuredAddress as `0x${string}`
    : undefined;
  return (
    <section className={styles.hero} aria-labelledby="hero-title" data-hud-index="001" data-hud-title="Floats" data-hud-meta="Onchain IPO index">
      <ShootingStars />
      <span className={styles.limb} aria-hidden="true" />
      <HeroStage />

      <div className={styles.copy}>
        {contractAddress && <ContractAddressBadge address={contractAddress} />}
        <MaskedHeading
          id="hero-title"
          className={styles.title}
          lines={[
            <span key="line">
              Every fresh IPO. <span className="metal-text">One token.</span>
            </span>,
          ]}
        />
      </div>

      <div className={styles.footer}>
        <Reveal delay={0.6} className={styles.caption}>
          <span className={styles.number}>001</span>
          <span className={styles.name}>Hold the new</span>
          <span className={styles.text}>The index of newly listed companies, held onchain as a single token. Rebalanced by rule, settled on Robinhood Chain.</span>
        </Reveal>
        <HoldingsTicker />
      </div>
    </section>
  );
}
