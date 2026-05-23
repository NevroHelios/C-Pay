# Contributing to C-Pay

Thanks for helping improve C-Pay. This repo contains a mobile app, a Stellar relayer, and Soroban contract code, so contributions should be careful about user safety, payment correctness, and clear UX.

## Project Areas

- `App/`: Expo React Native mobile wallet and merchant app.
- `relayer-service/`: Express service for sponsored account setup, payments, Add Money, and contract coordination.
- `Blockchain/`: Stellar asset scripts, Soroban contract, and blockchain helper tests.
- `public/`: Screenshots and demo assets used by documentation.

## Before You Start

1. Open an issue or comment on an existing issue before starting large work.
2. Keep changes scoped to one feature, bug, or refactor.
3. Do not commit real secrets, Stellar secret seeds, service-role keys, production `.env` files, or private user data.
4. Treat wallet, relayer, transaction, and contract changes as security-sensitive.

## Local Setup

Install dependencies in each package you touch:

```bash
cd App
npm install

cd ../relayer-service
npm install

cd ../Blockchain
npm install
```

Copy environment examples as needed:

```bash
cp App/.env.example App/.env
cp relayer-service/.env.example relayer-service/.env
cp Blockchain/.env.example Blockchain/.env
```

Use testnet values for local development. Never use production funds or production secret seeds in local files.

## Running Checks

For mobile app changes:

```bash
cd App
npx tsc --noEmit
npx expo install --check
```

For relayer changes:

```bash
cd relayer-service
node --check server.js
node --check test-relayer.js
npm test -- --passWithNoTests --runInBand
```

For blockchain and contract changes:

```bash
cd Blockchain
npm test -- --runInBand
cargo fmt --manifest-path contracts/cpay_payments/Cargo.toml -- --check
cargo test --manifest-path contracts/cpay_payments/Cargo.toml
```

Run only the checks relevant to your change if you are making a small documentation update.

## Mobile UX Guidelines

- Keep screens simple, readable, and safe for payment decisions.
- Prefer reusable components from `App/src/components/` over one-off UI.
- Use the shared theme in `App/src/constants/theme.ts`.
- Make payment, recovery, export-key, and merchant actions explicit and hard to misread.
- Support small screens, large text, screen readers, and clear loading/error states.
- Avoid adding "coming soon" buttons unless the issue explicitly asks for a placeholder.

## Security Guidelines

- Never expose Stellar `S...` secret seeds in app code, docs, screenshots, logs, or examples.
- Keep Supabase service-role keys only in backend environments.
- Bind authenticated users to their own wallet and merchant records in backend changes.
- Do not trust client-written transaction status for balances, receipts, or merchant analytics.
- Add tests for payment validation, relayer authorization, and contract state transitions when changing those paths.

## Pull Request Checklist

- Describe the user problem and the implemented solution.
- List the main files changed.
- Include screenshots or short recordings for UI changes.
- Include test output, or explain why tests were not run.
- Note any migration, environment, or deployment steps.
- Confirm no secrets or private user data were added.

## Documentation

Update documentation when a change affects setup, environment variables, contract IDs, public API endpoints, user flows, screenshots, or production notes. Keep public docs privacy-safe and avoid publishing real pilot user information.
