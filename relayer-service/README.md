# C-Pay Stellar Relayer

Backend service that sponsors Stellar account setup, submits fee-bump payments, handles test Add Money distribution, and connects merchant payments to the deployed Soroban payment-intent contract.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

## Required Environment

- `STELLAR_NETWORK`: `testnet` or `public`
- `STELLAR_HORIZON_URL`: Horizon endpoint
- `STELLAR_NETWORK_PASSPHRASE`: network passphrase
- `CPINR_ASSET_CODE`: `CPINR`
- `CPINR_ASSET_ISSUER`: issuer public key from blockchain setup
- `SPONSOR_SECRET`: secret seed for the account that sponsors reserves and pays fees
- `DISTRIBUTION_SECRET`: secret seed for the hot distribution account
- `SOROBAN_RPC_URL`: Soroban RPC endpoint for contract calls
- `TOKEN_CONTRACT_ID`: Stellar Asset Contract ID for CPINR
- `CPAY_CONTRACT_ID`: deployed C-Pay payments contract ID
- `CONTRACT_FLOW_ENABLED`: enables contract-backed merchant payment intents
- `RELAYER_SECRET`: secret seed for the contract relayer account that confirms intents
- `CONTRACT_ADMIN_SECRET`: secret seed for merchant registration and merchant account rotation
- `RELAYER_AUTH_REQUIRED`: set to `true` for production/public-network deployments
- `SUPABASE_JWT_SECRET`: required for legacy HS256 Supabase JWT verification when relayer auth is enabled, unless using Supabase Auth API validation with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`: optional; enables persistent Add Money claim logging/cooldowns
- `SUPABASE_SERVICE_ROLE_KEY`: optional; required with `SUPABASE_URL` for relayer-only writes to `add_money_claims`
- `ENABLE_ADD_MONEY`: defaults off on `public`; keep off for real-money production

Keep issuer secrets offline. The relayer needs sponsor and capped distribution secrets for Stellar payments, plus contract admin/relayer secrets only while this MVP backend owns contract sync and confirmation.

## Endpoints

- `GET /health`
- `GET /account/:accountId/status`
- `GET /account/:accountId/balance`
- `POST /accounts/prepare`
- `POST /accounts/submit`
- `GET /contract/config`
- `POST /contract/merchants/register`
- `POST /payments/intents/prepare`
- `POST /payments/intents/submit`
- `POST /payments/submit`
- `POST /add-money`
- `GET /tx/:hash`

## Contract Payment Flow

1. App merchant registration saves the merchant in Supabase, then calls `/contract/merchants/register`.
2. Merchant QR payment calls `/payments/intents/prepare`; relayer builds a Soroban `create_intent` transaction.
3. App signs that XDR with the payer wallet and submits it to `/payments/intents/submit`.
4. App signs the classic Stellar CPINR payment and submits it to `/payments/submit` with `intentId`.
5. Relayer validates the CPINR payment against the contract intent, submits the fee-bump transaction, then calls `confirm_intent`.

## Production Notes

- Put the relayer behind HTTPS.
- Restrict `CORS_ORIGIN` to app domains/builds.
- Enable `RELAYER_AUTH_REQUIRED=true` and configure Supabase token verification so only authenticated app users can spend sponsored relayer resources.
- Leave `ENABLE_ADD_MONEY=false` on public network unless you intentionally operate a funded, abuse-resistant promotion flow.
- Rotate `SPONSOR_SECRET` and `DISTRIBUTION_SECRET` through infrastructure secrets.
- Rotate `RELAYER_SECRET` with contract `set_relayer` if it is exposed.
- Prefer multisig or a controlled backend job for `CONTRACT_ADMIN_SECRET` before public-network use.
- Keep `ADD_MONEY_AMOUNT`, `MAX_PAYMENT_AMOUNT`, and `ADD_MONEY_COOLDOWN_MS` policy controlled.
- Configure `ALERT_WEBHOOK_URL` for low XLM or low CPINR inventory alerts.
