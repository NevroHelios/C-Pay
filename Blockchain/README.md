# C-Pay Stellar Blockchain Setup

This folder owns the Stellar asset setup and the Soroban contract used by C-Pay.

The efficient production design is:

- `CPINR` is the Stellar issued asset for INR-denominated C-Pay balances.
- The Stellar Asset Contract exposes `CPINR` to Soroban.
- `cpay_payments` stores merchant registration and payment intent status.
- The app never stores issuer, distribution, admin, or relayer secrets.
- The relayer verifies Stellar payments and confirms intents in the contract.

## Folder Layout

```text
Blockchain/
  contracts/cpay_payments/   Rust Soroban payment-intent contract
  scripts/create-keypairs.js Generates Stellar keypairs for setup
  scripts/setup-testnet-asset.js Issues CPINR on Stellar testnet
  scripts/deploy-contract.js Builds and deploys the Soroban contracts
  src/config.js              Shared Stellar config helpers
  src/stellarRail.js         Transaction helper functions
  test/stellarRail.test.js   JavaScript helper tests
```

## Accounts

`ASSET_ISSUER` creates the `CPINR` asset. Keep this account cold, use multisig for production, and never use it from the mobile app or hot backend payment flow.

`ASSET_DISTRIBUTION` receives the issued `CPINR` supply and handles operational distribution. Keep only the amount needed for operations in this account.

`CONTRACT_ADMIN` controls the Soroban contract configuration, merchant registry, pause switch, and relayer rotation. Use a dedicated account, not a user wallet.

`RELAYER` confirms payment intents after the backend has verified the Stellar transaction. Keep this secret only in backend infrastructure.

## Required Tools

- Node.js 18 or newer
- Rust 1.84.0 or newer
- `wasm32v1-none` Rust target
- Stellar CLI v25 or newer

Install the Rust target:

```bash
rustup target add wasm32v1-none
```

Check the Stellar CLI:

```bash
stellar version
```

## Environment Variables

Create `Blockchain/.env` from `.env.example`.

| Variable | Purpose |
| --- | --- |
| `STELLAR_NETWORK` | `testnet` for test setup, `public` for production |
| `STELLAR_HORIZON_URL` | Horizon endpoint for classic Stellar payments |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase used for transaction XDR |
| `STELLAR_BASE_FEE` | Classic Stellar base fee in stroops |
| `SOROBAN_RPC_URL` | RPC endpoint for Soroban contract deployment |
| `SOROBAN_NETWORK_PASSPHRASE` | Passphrase used by Soroban RPC transactions |
| `STELLAR_CLI_NETWORK` | Stellar CLI network alias, usually `testnet` |
| `STELLAR_CLI_SOURCE_ACCOUNT` | CLI identity or secret used to deploy contracts |
| `ASSET_CODE` | Asset code, currently `CPINR` |
| `ASSET_ISSUER_PUBLIC_KEY` | Public key of the issuer account |
| `ASSET_DISTRIBUTION_PUBLIC_KEY` | Public key of the distribution account |
| `CONTRACT_ADMIN_PUBLIC_KEY` | Public key allowed to administer the contract |
| `RELAYER_PUBLIC_KEY` | Public key allowed to confirm payment intents |
| `TOKEN_CONTRACT_ID` | Stellar Asset Contract ID for `CPINR` after deployment |
| `CPAY_CONTRACT_ID` | Deployed `cpay_payments` contract ID |
| `ASSET_ISSUER_SECRET` | Testnet setup only; do not keep online in production |
| `ASSET_DISTRIBUTION_SECRET` | Testnet setup only; backend-only if used operationally |
| `INITIAL_SUPPLY` | Testnet amount issued to distribution |
| `TRUSTLINE_LIMIT` | Distribution account trustline limit |
| `ASSET_HOME_DOMAIN` | Optional Stellar asset home domain |
| `LOCK_ISSUER_AFTER_SETUP` | `true` disables further testnet issuance after setup |

## Generate Keys

For local testnet setup:

```bash
npm run create:keypairs
```

The script prints:

- `ASSET_ISSUER_PUBLIC_KEY` and `ASSET_ISSUER_SECRET`
- `ASSET_DISTRIBUTION_PUBLIC_KEY` and `ASSET_DISTRIBUTION_SECRET`
- `CONTRACT_ADMIN_PUBLIC_KEY` and its secret
- `RELAYER_PUBLIC_KEY` and its secret

For the deployer identity, prefer the Stellar CLI secure store:

```bash
stellar keys generate cpay-deployer --fund
stellar keys public-key cpay-deployer
```

Set:

```text
STELLAR_CLI_SOURCE_ACCOUNT=cpay-deployer
```

For production, generate the issuer, admin, and relayer accounts using your key-management process. Do not rely on printed terminal secrets for production custody.

## Testnet Asset Setup

Install dependencies in `Blockchain/`:

```bash
npm install
```

Set these `.env` values first:

```text
STELLAR_NETWORK=testnet
ASSET_CODE=CPINR
ASSET_ISSUER_PUBLIC_KEY=<issuer public key>
ASSET_DISTRIBUTION_PUBLIC_KEY=<distribution public key>
ASSET_ISSUER_SECRET=<issuer secret>
ASSET_DISTRIBUTION_SECRET=<distribution secret>
INITIAL_SUPPLY=1000000000
TRUSTLINE_LIMIT=1000000000
```

Run:

```bash
npm run setup:testnet
```

This funds the issuer and distribution accounts on testnet, creates the distribution trustline, and sends the initial `CPINR` supply from issuer to distribution.

## Contract Build And Deploy

Set these `.env` values:

```text
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
SOROBAN_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_CLI_NETWORK=testnet
STELLAR_CLI_SOURCE_ACCOUNT=cpay-deployer
ASSET_CODE=CPINR
ASSET_ISSUER_PUBLIC_KEY=<issuer public key>
CONTRACT_ADMIN_PUBLIC_KEY=<admin public key>
RELAYER_PUBLIC_KEY=<relayer public key>
```

Build only:

```bash
npm run contract:build
```

Deploy the Stellar Asset Contract for `CPINR`, then deploy `cpay_payments`:

```bash
npm run deploy:contract
```

The deploy script writes `contract-ids.json` with:

- `tokenContractId`
- `cpayContractId`
- `asset`
- `network`

Use those values for `TOKEN_CONTRACT_ID` and `CPAY_CONTRACT_ID` in backend services.

Current testnet deployment in this workspace:

| Item | Value |
| --- | --- |
| Asset | `CPINR:GA2SFZ4GJVMLPULSJMTY7RMIOPQD5W5JGTDSD3N7I2PR5KZRFGPQF5BJ` |
| Stellar Asset Contract ID | `CDR6RDWPZAHOARJKV5YF57VEOE2PJQP6KTE5FGQSJVKLPN5M3KCFE3SN` |
| C-Pay payments contract ID | `CBHYSB5W6TRDTGGYSZUYJBXPPIO7XJS2SLNHJVKWEINOKQC7MKU4N6CR` |
| C-Pay payments Wasm hash | `24522af6d53859f9c453cea65912c4b13000baec04301598b12edc905f084fb9` |
| Updated | `2026-04-27T03:33:54.623Z` |

## Contract Behavior

`cpay_payments` exposes:

- `config`
- `set_admin`
- `set_token`
- `set_relayer`
- `set_paused`
- `register_merchant`
- `set_merchant_account`
- `set_merchant_active`
- `merchant`
- `create_intent`
- `confirm_intent`
- `cancel_intent`
- `intent`
- `extend_ttl`

Security and fee choices:

- Admin-only functions call `require_auth`.
- User-created payment intents require payer auth.
- Relayer confirmation requires relayer auth.
- Contract changes emit typed `#[contractevent]` events for config, merchant, and intent state.
- Merchant registry uses persistent storage.
- `register_merchant` rejects duplicate IDs; use `set_merchant_account` for account rotation.
- Payment intents use temporary storage to reduce storage cost.
- Payment intent expiry must be more than 30 seconds and no more than 24 hours in the future.
- The contract extends TTL when entries are touched.
- Payment movement stays on Stellar payment operations, so normal transfers remain cheap.
- The pause switch blocks new and confirmed intents during incidents.

## Payment Flow

1. Backend registers each merchant with a 32-byte merchant ID and merchant Stellar address.
2. App requests a payment intent from backend.
3. App signs a Stellar `CPINR` payment to the merchant address.
4. Relayer submits or fee-bumps the payment if the product flow requires sponsored fees.
5. Relayer verifies the transaction on Horizon.
6. Relayer calls `confirm_intent` with the Stellar transaction hash.
7. Backend stores the business receipt and app shows payment success.

The contract is not the payment custodian. Stellar account balances and Horizon payment records remain the money source of truth; the contract gives C-Pay a verifiable payment-intent state machine.

## Production Rules

- Keep issuer secrets offline after asset setup.
- Use multisig for issuer and contract admin.
- Keep distribution balances capped by policy.
- Keep relayer secrets only in backend secret storage.
- Do not put any secret seed in the mobile app.
- Rotate the relayer with `set_relayer` if the relayer key is exposed.
- Use `set_paused(true)` before emergency maintenance.
- Run contract tests and JavaScript helper tests before deployment.
- Monitor Soroban TTL and call `extend_ttl` or CLI TTL extension jobs before archival windows.

## Verification

Run JavaScript helper tests:

```bash
npm test
```

Run Rust contract tests:

```bash
cargo test --manifest-path contracts/cpay_payments/Cargo.toml
```

Build optimized Wasm:

```bash
npm run contract:build
```

Useful official docs:

- https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup
- https://developers.stellar.org/docs/tools/cli/stellar-cli
- https://developers.stellar.org/docs/build/guides/cli/deploy-stellar-asset-contract
- https://developers.stellar.org/docs/build/guides/storage/choosing-the-right-storage
