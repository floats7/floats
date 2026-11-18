import { Icon } from "@/components/ui/Icon";
import styles from "./ContractRegistry.module.css";

interface ContractEntry {
  readonly name: string;
  readonly address: `0x${string}`;
  readonly group: "Core protocol" | "Options protocol";
}

interface NetworkDeployment {
  readonly name: string;
  readonly chainId: number;
  readonly explorerUrl: string;
  readonly contracts: readonly ContractEntry[];
}

const deployments: readonly NetworkDeployment[] = [
  {
    name: "Robinhood Chain Mainnet",
    chainId: 4663,
    explorerUrl: "https://robinhoodchain.blockscout.com",
    contracts: [
      { name: "FloatsVault", address: "0x4B129357B164d65834bdBA935c3cD08FcB7e14DA", group: "Core protocol" },
      { name: "IndexRegistry", address: "0xBD5a9d71dec44bc7282d341eBFD9b4043e16dd77", group: "Core protocol" },
      { name: "NavOracle", address: "0xBC888398B61c12D87F498f27f6B0e02EA028904C", group: "Core protocol" },
      { name: "SwapQuoteOracle", address: "0xaBF633841c9235F8Ca917545849d1FEceC4C7D45", group: "Core protocol" },
      { name: "SwapAdapter", address: "0x8Ec314BEE8Aa662ab921965A8A9480e844978A4d", group: "Core protocol" },
      { name: "FeeModule", address: "0xA092D9b487005f0329C2F72b59e94c59bfB6236D", group: "Core protocol" },
      { name: "Rebalancer", address: "0xf608d88d3562371Fd703c0FeA7d69194C4E2510B", group: "Core protocol" },
      { name: "TimelockController", address: "0xDFbdB6007f872f41A63868eBc0937db6780ab203", group: "Core protocol" },
      { name: "OptionsSeriesRegistry", address: "0x9A1C381951fbB5c79Aaa5C729C58fca3137D7Ae4", group: "Options protocol" },
      { name: "OptionsPriceOracle", address: "0x45929Aca47E308825bE955635bcE5D27cb2e200e", group: "Options protocol" },
      { name: "OptionToken", address: "0x5DB95504b438607A1fb6A395774885DD96Ee8653", group: "Options protocol" },
      { name: "OptionsVault", address: "0x24c24ceDB0Ba78c26b1217AE25d4176365B75D05", group: "Options protocol" },
      { name: "QuoteVerifier", address: "0xBD623f09A09Bb03c01d955854e90870E37a9B27D", group: "Options protocol" },
      { name: "OptionsSettlementEngine", address: "0xAeaa8C3c8d58b9E006c35f5cbFa25d7DC0954D4e", group: "Options protocol" },
      { name: "OptionsRiskManager", address: "0xaA2302013446FF36A309060402A05E13C08c07Fa", group: "Options protocol" },
      { name: "OptionsMarket", address: "0xcAfD3d13022b793c90914dc7a83228513Fe1F00b", group: "Options protocol" },
    ],
  },
  {
    name: "Robinhood Chain Testnet",
    chainId: 46630,
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    contracts: [
      { name: "FloatsVault", address: "0x85ADaaA58cEC8F7b6eb729CF7eb4695a9A0fb53C", group: "Core protocol" },
      { name: "IndexRegistry", address: "0xa30782F3C23247e3e2cAe4c932240CEaB65c36F6", group: "Core protocol" },
      { name: "NavOracle", address: "0x0BAAB1032aeB12fda26b089225244844aFB971A9", group: "Core protocol" },
      { name: "SwapQuoteOracle", address: "0x41150A33E6e4eBCaCc317AB934CB549834C02ee7", group: "Core protocol" },
      { name: "SwapAdapter", address: "0x497a369e856528FC849f7CC816d7c068615BB104", group: "Core protocol" },
      { name: "FeeModule", address: "0x2ae6cfB18F6d959875836E25397A119bBC534993", group: "Core protocol" },
      { name: "Rebalancer", address: "0x85F0503C4852B9E68405eb827Ad0a2AA5df17D0C", group: "Core protocol" },
      { name: "TimelockController", address: "0x325C780cb851d114ab9E15752731EeAcb96f47bA", group: "Core protocol" },
      { name: "OptionsSeriesRegistry", address: "0x4f8181b44d03d5f0f54b8297895f41118fac52d4", group: "Options protocol" },
      { name: "OptionsPriceOracle", address: "0xDBf8aa19F4cb4f5aBCbEe9F2E809401dD41dfb81", group: "Options protocol" },
      { name: "OptionToken", address: "0x657c7160fab41889daefedd630f0b98cf49af308", group: "Options protocol" },
      { name: "OptionsVault", address: "0x78182dddc56f510fa584cf8b7a5c91ef0b387db2", group: "Options protocol" },
      { name: "QuoteVerifier", address: "0xfd2ee2a317c13a654400fb94851948eb870e8fb9", group: "Options protocol" },
      { name: "OptionsSettlementEngine", address: "0x36fc3d475d124cb9a9d5e3adf1dbee532afc2d49", group: "Options protocol" },
      { name: "OptionsRiskManager", address: "0xbed0fd20d5c5ec7ec4cab4af0f602f36f86bdcd1", group: "Options protocol" },
      { name: "OptionsMarket", address: "0x4427a070161aff5f07aff05f2dcaf27b81a6760b", group: "Options protocol" },
    ],
  },
] as const;

export function ContractRegistry() {
  return (
    <section className={`container ${styles.section}`} aria-labelledby="contract-registry-title">
      <header className={styles.header}>
        <p className="eyebrow">Verified deployments</p>
        <h2 id="contract-registry-title">Public contract registry.</h2>
        <p>Canonical Floats contract addresses for every supported network. Always verify the network and full address before interacting.</p>
      </header>
      <div className={styles.networks}>
        {deployments.map((network) => (
          <article key={network.chainId} className={styles.network}>
            <div className={styles.networkHeader}>
              <div><h3>{network.name}</h3><p>Chain ID <span className="tabular">{network.chainId}</span></p></div>
              <a href={network.explorerUrl} target="_blank" rel="noreferrer">Open explorer <Icon name="external-link" /></a>
            </div>
            {(["Core protocol", "Options protocol"] as const).map((group) => (
              <div key={group} className={styles.group}>
                <h4>{group}</h4>
                <div className={styles.scroller} role="region" aria-label={`${network.name} ${group} contracts`} tabIndex={0}>
                  <table>
                    <thead><tr><th scope="col">Contract</th><th scope="col">Address</th><th scope="col">Explorer</th></tr></thead>
                    <tbody>{network.contracts.filter((contract) => contract.group === group).map((contract) => (
                      <tr key={contract.address}>
                        <td>{contract.name}</td>
                        <td className="tabular">{contract.address}</td>
                        <td><a href={`${network.explorerUrl}/address/${contract.address}`} target="_blank" rel="noreferrer" aria-label={`View ${contract.name} on ${network.name} explorer`}><Icon name="external-link" />View</a></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
