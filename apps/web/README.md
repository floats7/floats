# Floatss Web

Next.js 16 and React 19 frontend for Floatss. Black, white and brushed-metal design system with motion powered by `motion`.

## Commands

```bash
npm run dev        # start the dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## Structure

| Path | Purpose |
| --- | --- |
| `src/app` | Routes, global tokens (`globals.css`), geo-block `proxy.ts` |
| `src/components` | Shared UI (`ui`), layout shell, brand and chart components |
| `src/features` | One folder per page, with its own sections and styles |
| `src/data` | Typed sample data. Replace with indexer reads in P3 |
| `src/lib` | Pure helpers: formatting, dates, quotes, motion tokens |

## Simulated flows

Wallet and transactions are simulated until contracts are wired in.

- Connect wallet: approve, reject and retry states.
- Mint and redeem (cash and in-kind): review, pending steps, success and failure dialogs. Reject in the wallet step to see the rejected state. Cash trades above 5,000 USDG while US markets are closed fail with a slippage revert.
- Portfolio balances and history update after each successful trade.

## Notes

- All figures are simulated sample data until the indexer and contracts are wired in.
- `RESTRICTED_COUNTRIES` in `src/lib/constants.ts` must be replaced with the official Stock Token exclusion list before launch.
- Styling uses CSS Modules and semantic tokens. Raw colors live only in `globals.css`.
