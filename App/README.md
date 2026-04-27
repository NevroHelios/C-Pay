# C-Pay Mobile App

Expo React Native app for closed-pilot C-Pay credits on Stellar testnet.

## Setup

```bash
npm install
copy .env.example .env
npm start
```

Set these values after completing `Blockchain/README.md`:

- `EXPO_PUBLIC_CPINR_ASSET_CODE=CPINR`
- `EXPO_PUBLIC_CPINR_ASSET_ISSUER=<issuer public key>`
- `EXPO_PUBLIC_STELLAR_RELAYER_URL=<relayer base URL>`
- `EXPO_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org`
- `EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015`
- `EXPO_PUBLIC_PILOT_MODE=true`
- `EXPO_PUBLIC_PILOT_CREDIT_UNIT=credits`

Keep `EXPO_PUBLIC_DEV_MODE=false` for production/internal pilot builds that should use real OTP. `EXPO_PUBLIC_PILOT_MODE=true` is separate and only controls closed-pilot/test-credit UX.

## Wallet Security

- Wallets are Stellar keypairs.
- The Stellar secret key is encrypted before storage with XChaCha20-Poly1305.
- PIN-derived keys use PBKDF2-SHA256.
- Raw PINs are not persisted in AsyncStorage.
- The app keeps only a short-lived in-memory PIN session after successful authentication.
