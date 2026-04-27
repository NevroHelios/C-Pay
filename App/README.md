# C-Pay Mobile App

Expo React Native app for closed-pilot C-Pay credits on Stellar testnet. The active MVP login flow uses Supabase email OTP; phone OTP is intentionally paused until an SMS provider subscription is ready.

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

Keep `EXPO_PUBLIC_DEV_MODE=false` for production/internal pilot builds that should use real Supabase email OTP. `EXPO_PUBLIC_PILOT_MODE=true` is separate and only controls closed-pilot/test-credit UX.

## Auth and Recovery

- Login/onboarding uses Supabase email OTP through `src/services/auth.ts`.
- The OTP input is sized for the current 8-digit email code flow.
- `users.email` stores the verified email address; `users.phone_number` remains for future phone OTP.
- New profiles must create an encrypted cloud backup in `CloudBackupSetupScreen`.
- After app data loss or reinstall, `RestoreWalletScreen` verifies email, decrypts the Supabase `wallet_backups` row with the recovery password, and asks the user to create a new local PIN.
- Merchant data is not inside the backup; after wallet restore, merchant rows are loaded again from Supabase by wallet address/auth user.

## Production Builds

Android release APK:

```bash
npm run build:android:production-apk
```

All production platforms configured in EAS:

```bash
npm run build:production:all
```

APK is the Android artifact. Apple devices require the iOS production build from EAS.

## Wallet Security

- Wallets are Stellar keypairs.
- The Stellar secret key is encrypted before storage with XChaCha20-Poly1305.
- PIN-derived keys use PBKDF2-SHA256.
- Cloud backup recovery-password keys use PBKDF2-SHA256 with 120000 iterations.
- Cloud backup ciphertext uses XChaCha20-Poly1305 and stores only salt, nonce, ciphertext, and metadata in Supabase.
- Raw PINs are not persisted in AsyncStorage.
- The app keeps only a short-lived in-memory PIN session after successful authentication.
