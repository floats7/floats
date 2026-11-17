<p align="center">
  <img src="./assets/floats-banner.png" alt="Floats index constituents banner" width="100%" />
</p>

<div align="center">

# Floats

### Onchain exposure to newly public companies

[![Launch Floats](https://img.shields.io/badge/Launch_Floats-floats.trade-111827?style=for-the-badge)](https://floats.trade/)
[![Follow Floats on X](https://img.shields.io/badge/Follow_on_X-@floats37-000000?style=for-the-badge&logo=x)](https://x.com/floats37)

</div>

Floats is an onchain index protocol designed to provide transparent, rules-based exposure to tokenized shares of recently public companies. The protocol combines an ERC-4626 vault, deterministic index governance, oracle-based valuation, constrained execution, and independently indexed public data.

This README is a product and system overview. It intentionally excludes private operational documentation, credentials, deployment manifests, internal research, and security-sensitive runbooks.

## Product thesis

Access to newly public companies is fragmented across brokers, jurisdictions, trading hours, and individual listings. Building and maintaining a diversified portfolio manually introduces several problems:

- investors must discover and evaluate each new listing;
- portfolio weights drift as prices and index membership change;
- tokenized equities may have different transfer, pause, and issuer controls;
- liquidity, oracle quality, and trading availability vary between assets;
- operational and governance decisions are difficult to verify without a public audit trail.

Floats turns these concerns into an explicit protocol methodology. Users hold one vault share representing a proportional claim on the vault's assets. Constituent selection, weights, valuation, fees, rebalances, and emergency controls are governed by bounded onchain rules rather than an opaque portfolio manager.

## Product goals

Floats is designed to:

1. Provide diversified exposure to eligible newly public companies through one onchain position.
2. Keep portfolio construction and accounting transparent and reproducible.
3. Preserve user exit paths when normal cash operations or price feeds are unavailable.
4. Separate governance, emergency response, keeper execution, pricing, and data indexing responsibilities.
5. Fail closed when an asset, oracle, route, or authorization cannot be validated.
6. Make protocol state understandable through a backend API and independently indexed read models.

Floats does not promise returns, eliminate issuer risk, or make tokenized securities permissionless. Eligibility, transferability, trading access, and legal availability can depend on issuers, infrastructure providers, and user jurisdiction.

## How Floats works

### 1. Deposit

An eligible user deposits USDG into `FloatsVault`. The vault issues `fIPO` shares using ERC-4626 accounting. Deposits are subject to protocol status, configured limits, and the current operating policy.

### 2. Portfolio construction

`IndexRegistry` stores the active constituent set, asset identity, target weights, oracle references, eligibility state, and lifecycle metadata. Registry changes use delayed proposal and activation steps so membership cannot change silently or atomically without an observable governance operation.

### 3. Valuation

`NavOracle` normalizes supported price feeds and token decimals into a consistent valuation unit. The vault values idle USDG and tracked constituents at a single state boundary. Invalid, stale, or paused inputs fail closed rather than producing a misleading NAV.

### 4. Rebalancing

`Rebalancer` executes only instructions that match a governance-authorized hash. Every instruction includes bounded amounts, deadlines, routes, and replay protection. `SwapAdapter` restricts routers, selectors, token pairs, slippage, and executors, then clears temporary token allowances after execution.

### 5. Redemption

Normal redemptions return USDG when cash operations and liquidity constraints permit. An oracle-independent in-kind redemption path is designed to preserve proportional exit access when normal pricing or trading infrastructure is unavailable.

### 6. Public data

A backend-only indexer reads finalized blockchain events, handles bounded reorg recovery, and projects canonical state into the protocol database. The browser communicates only with the Floats backend API and never receives database credentials, signing keys, or privileged RPC configuration.

## System architecture

```text
User wallet
    |
    v
Floats web application
    |
    v
Backend API -----------------------> Database read models
    |                                      ^
    |                                      |
    v                                      |
FloatsVault <---- NavOracle          Finalized event indexer
    |               ^                      ^
    |               |                      |
    +---- IndexRegistry                    |
    |                                      |
    +---- FeeModule                        |
    |                                      |
    +---- Rebalancer ---> SwapAdapter -----+
                              |
                              v
                       Approved liquidity routes
```

### Core contracts

| Component | Responsibility |
|---|---|
| `FloatsVault` | ERC-4626 shares, deposits, redemptions, TVL limits, pauses, fee integration, and in-kind exits |
| `IndexRegistry` | Versioned constituents, identity, target weights, lifecycle state, and delayed activation |
| `NavOracle` | Decimal normalization, oracle health validation, and total portfolio valuation |
| `SwapQuoteOracle` | Oracle-derived output bounds for constrained execution |
| `SwapAdapter` | Router and selector allowlists, allowance hygiene, slippage enforcement, and balance-delta validation |
| `Rebalancer` | Authorized instructions, keeper permissions, deadlines, chunk limits, and replay protection |
| `FeeModule` | Bounded management and transaction fee configuration with explicit treasury routing |
| `TimelockController` | Delayed governance execution and role administration |

## Index methodology

Floats is intended to track an eligibility-filtered basket of tokenized shares associated with recently public companies. A production universe must satisfy explicit requirements before an asset can become active:

- canonical contract identity and independently verified metadata;
- acceptable transfer and holder behavior for smart-contract custody;
- reliable price feeds with known decimals and health semantics;
- sufficient liquidity through an approved route;
- documented issuer controls, pause behavior, upgrades, and corporate actions;
- operational and legal approval for the target network and user experience.

Target weights are committed as a complete registry version. The registry validates identity uniqueness, total weight, lifecycle dates, and bounded constituent counts. Partial configuration changes cannot silently produce an invalid index.

## Asset lifecycle

An asset can move through explicit states rather than disappearing from accounting:

```text
Candidate -> Pending -> Active -> Exit-only -> Removed
                  \-> Rejected
```

- **Candidate:** under technical, liquidity, oracle, and policy review.
- **Pending:** approved but waiting for the activation boundary.
- **Active:** eligible for portfolio allocation and rebalancing.
- **Exit-only:** no new exposure is added; the protocol may reduce or distribute the position.
- **Removed:** no longer part of the active index methodology.
- **Rejected:** failed a required eligibility gate.

Corporate actions, account restrictions, token pauses, feed failures, or implementation upgrades can move an asset out of normal operation. Floats treats these conditions as explicit protocol states and operational risks.

## Governance and trust model

Floats separates authority across narrowly defined roles:

- **Timelock governance** changes registry state, modules, routes, fees, and long-lived permissions.
- **Guardian** may pause defined emergency surfaces but cannot restore service unilaterally.
- **Keeper** executes pre-authorized operational instructions and cannot invent new portfolio decisions.
- **Treasury** receives configured protocol fees but does not control vault accounting.
- **Indexer** produces public read models but cannot mutate onchain protocol state.
- **Backend API** controls database access and exposes only bounded public response fields.

The current governance configuration uses a five-minute timelock on testnet and mainnet. This favors operational speed but offers a shorter review and cancellation window than a long-delay governance system. Users and integrators should treat that as an explicit trust assumption.

## Security model

Floats follows several defensive principles:

- fail closed on stale, invalid, or paused oracle data;
- validate chain ID, addresses, token decimals, and environment boundaries;
- constrain swap routers, selectors, spenders, recipients, amounts, and slippage;
- use exact or temporary approvals and clear allowances after execution;
- prevent instruction replay and reject expired operations;
- separate governance, guardian, keeper, treasury, and indexing privileges;
- retain an oracle-independent proportional exit path;
- process only finalized event ranges and rewind bounded state after a reorg;
- keep database, provider, and signing credentials on the server side;
- exclude environments, manifests, receipts, caches, documentation, and local operational state from the public repository.

Smart contracts and tokenized securities remain high-risk systems. Audits, testing, monitoring, governance review, and legal analysis reduce risk but cannot remove it.

## Data architecture

The indexer maintains replay-safe, finalized projections for:

- canonical protocol events;
- chain checkpoints and ingestion health;
- NAV and share-price history;
- constituent metadata and holdings;
- registry changes;
- user deposits and redemptions;
- rebalance, fee, pause, and governance operations.

`RPC_URL` is reserved for deployment and transactional operations. `RPC_INDEXER` is a separate endpoint for historical logs and finalized state ingestion. This isolation prevents indexer throughput requirements from interfering with transaction operations.

## Network environments

Floats maintains strict separation between:

- **Robinhood Chain Testnet** for public testing, fixtures, governance drills, and canary execution.
- **Robinhood Chain Mainnet** for production deployment only after technical, security, oracle, liquidity, operational, and legal gates are satisfied.

Runtime configuration belongs in private `.env.testnet` and `.env.mainnet` files. Committed `.example` files define the configuration schema without containing credentials.

## Product surfaces

The Floats application is designed around four user needs:

1. **Understand:** methodology, current constituents, weights, oracle health, and governance changes.
2. **Evaluate:** finalized NAV, share price, holdings, and historical protocol state.
3. **Transact:** connect a wallet, obtain a bounded quote, deposit USDG, and redeem shares.
4. **Verify:** inspect contract state, transaction history, index updates, and operational status.

Browser-visible data is intentionally bounded. Secrets cannot be hidden inside frontend code or network responses, so all privileged data access stays behind the backend API.

## Floats Options

Floats Options is a future protocol layer for fully collateralized, cash-settled options on supported Floats and constituent references. It is intentionally separated from Floats Core because options introduce additional pricing, settlement, liquidity, legal, and signer-security requirements.

Options development should begin only after the Core system, market universe, oracle behavior, and testnet operations satisfy their independent readiness gates.

## Repository scope

The public repository contains the implementation required to understand, reproduce, and review the protocol:

- Solidity contracts and testnet fixtures;
- deployment and governance script source without runtime credentials;
- backend API, indexer, and keeper source;
- web application source;
- database migrations and generated public types;
- environment schemas and local quality tooling.

The repository intentionally excludes:

- runtime environment files and provider credentials;
- private keys, keystores, certificates, and signing material;
- deployment manifests, receipts, broadcasts, caches, and build output;
- internal documentation, research, evidence, and operational runbooks;
- local databases, editor state, and agent configuration.

Run the public-tree guard before every commit or release:

```bash
npm run check:public
```

## Current status

Floats Core `0.2.0` is deployed and activated on Robinhood Chain Testnet. Core governance, routine rebalance, fast constituent entry, keeper cleanup, finalized event indexing, and database reconciliation have been exercised on testnet.

Mainnet launch remains subject to independent universe, oracle, liquidity, compliance, security review, and operational readiness gates. Testnet assets and fixtures have no monetary value and must not be represented as canonical production assets.

## License

Floats is licensed under the Apache License 2.0. See [LICENSE](./LICENSE) for the complete terms.

## Disclaimer

Floats is experimental software. Nothing in this repository is investment, legal, tax, or financial advice. Tokenized shares may be restricted, paused, upgraded, frozen, redeemed, or otherwise controlled by their issuers and infrastructure providers. Access may be unavailable in some jurisdictions. Users are responsible for understanding the contracts, assets, risks, and applicable laws before interacting with the protocol.
