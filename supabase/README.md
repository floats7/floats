# Supabase Development

The project uses separate Supabase projects for testnet and mainnet. Never point
both environments at the same project URL.

## Direct project workflow

```bash
npm run migrate:supabase -- .env.testnet
```

The runner requires `SUPABASE_DB_URL`, obtains a PostgreSQL advisory lock, verifies immutable
SHA-256 checksums, and records each migration atomically. It never prints the connection string.
Use the mainnet environment only when intentionally applying the identical reviewed schema to the
isolated production project.

Generate database types only from the applied remote schema:

```bash
supabase gen types typescript --schema public --remote="$SUPABASE_DB_URL"
```

The generated artifact lives at `packages/database/src/database.generated.ts`; application code
must derive database row/view types from it instead of declaring duplicate handwritten shapes.

The generated type file must never be handwritten. Regenerate it after every
migration and review the diff together with the SQL migration.

## Access model

- Backend services use only the server-side `sb_secret_...` key.
- Browser clients never receive a Supabase URL, publishable key, or secret key.
- Asset, NAV, holding, and ingestion-health read models are exposed only through the application backend API.
- Migration `202611170003_backend_only_access.sql` removes legacy browser-read policies and revokes `anon` and `authenticated` schema privileges, including future default privileges.
- Raw events, checkpoints, and user transaction history have no browser policy.
- Wallet-specific transaction history must be exposed through an authenticated
  server API after signature/session verification.

The backend must authenticate and authorize requests and return only contractually
defined fields. Local Supabase runtime state is ignored; migrations and this configuration remain
publishable source artifacts.
