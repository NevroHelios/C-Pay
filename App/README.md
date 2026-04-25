# C-Pay Mobile App

Expo React Native app for INR-first payments on Stellar.

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

## Wallet Security

- Wallets are Stellar keypairs.
- The Stellar secret key is encrypted before storage with XChaCha20-Poly1305.
- PIN-derived keys use PBKDF2-SHA256.
- Raw PINs are not persisted in AsyncStorage.
- The app keeps only a short-lived in-memory PIN session after successful authentication.
