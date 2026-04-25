-- C-Pay Stellar Supabase schema
-- Run in the Supabase SQL editor for a fresh CPINR/Stellar setup.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT UNIQUE NOT NULL,
    cpay_id TEXT UNIQUE,
    phone_number TEXT UNIQUE,
    biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    profile_photo_url TEXT,
    display_name TEXT,
    stellar_network TEXT NOT NULL DEFAULT 'testnet',
    cpinr_asset_code TEXT NOT NULL DEFAULT 'CPINR',
    cpinr_asset_issuer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name TEXT NOT NULL,
    wallet_address TEXT UNIQUE NOT NULL,
    cpay_id TEXT UNIQUE,
    owner_name TEXT,
    email TEXT,
    phone_number TEXT,
    business_address TEXT,
    business_registration_number TEXT,
    description TEXT,
    category TEXT,
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_transactions INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC(20, 7) NOT NULL DEFAULT 0,
    stellar_network TEXT NOT NULL DEFAULT 'testnet',
    cpinr_asset_code TEXT NOT NULL DEFAULT 'CPINR',
    cpinr_asset_issuer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    transaction_id TEXT UNIQUE,
    transaction_type TEXT NOT NULL DEFAULT 'personal' CHECK (
        transaction_type IN ('personal', 'merchant', 'add_money', 'account_setup')
    ),
    merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
    tx_hash TEXT UNIQUE NOT NULL,
    stellar_network TEXT NOT NULL DEFAULT 'testnet',
    asset_code TEXT NOT NULL DEFAULT 'CPINR',
    asset_issuer TEXT,
    to_address TEXT NOT NULL,
    from_address TEXT NOT NULL DEFAULT '',
    amount NUMERIC(20, 7) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'success', 'failed')
    ),
    internal_status TEXT NOT NULL DEFAULT 'processing' CHECK (
        internal_status IN ('processing', 'submitted', 'confirmed', 'failed')
    ),
    user_visible_status TEXT NOT NULL DEFAULT 'success' CHECK (
        user_visible_status IN ('success', 'failed')
    ),
    merchant_name TEXT,
    note TEXT,
    sender_name TEXT,
    recipient_name TEXT,
    failure_reason TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_qr_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    qr_name TEXT NOT NULL,
    amount NUMERIC(20, 7),
    asset_code TEXT NOT NULL DEFAULT 'CPINR',
    asset_issuer TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    scan_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS add_money_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL,
    amount NUMERIC(20, 7) NOT NULL CHECK (amount > 0),
    asset_code TEXT NOT NULL DEFAULT 'CPINR',
    asset_issuer TEXT,
    tx_hash TEXT UNIQUE,
    idempotency_key TEXT UNIQUE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_available_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS relayer_idempotency_keys (
    key TEXT PRIMARY KEY,
    response JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing-project compatibility. Safe for empty/new projects and useful if
-- the table already exists from an older local setup.
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpay_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stellar_network TEXT NOT NULL DEFAULT 'testnet';
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpinr_asset_code TEXT NOT NULL DEFAULT 'CPINR';
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpinr_asset_issuer TEXT;
ALTER TABLE users DROP COLUMN IF EXISTS pin_hash;

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cpay_id TEXT UNIQUE;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS stellar_network TEXT NOT NULL DEFAULT 'testnet';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cpinr_asset_code TEXT NOT NULL DEFAULT 'CPINR';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cpinr_asset_issuer TEXT;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_id TEXT UNIQUE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_id UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stellar_network TEXT NOT NULL DEFAULT 'testnet';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS asset_code TEXT NOT NULL DEFAULT 'CPINR';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS asset_issuer TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recipient_name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_cpay_id ON users(cpay_id);
CREATE INDEX IF NOT EXISTS idx_merchants_wallet_address ON merchants(wallet_address);
CREATE INDEX IF NOT EXISTS idx_merchants_cpay_id ON merchants(cpay_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_from_address ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_to_address ON transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_qr_codes_merchant_id ON merchant_qr_codes(merchant_id);
CREATE INDEX IF NOT EXISTS idx_add_money_claims_wallet_address ON add_money_claims(wallet_address);
CREATE INDEX IF NOT EXISTS idx_add_money_claims_claimed_at ON add_money_claims(claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_relayer_idempotency_expires_at ON relayer_idempotency_keys(expires_at);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE add_money_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE relayer_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_insert" ON users;
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "users_update" ON users;
CREATE POLICY "users_update" ON users FOR UPDATE USING (true);

DROP POLICY IF EXISTS "merchants_select" ON merchants;
CREATE POLICY "merchants_select" ON merchants FOR SELECT USING (true);

DROP POLICY IF EXISTS "merchants_insert" ON merchants;
CREATE POLICY "merchants_insert" ON merchants FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "merchants_update" ON merchants;
CREATE POLICY "merchants_update" ON merchants FOR UPDATE USING (true);

DROP POLICY IF EXISTS "transactions_select" ON transactions;
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "transactions_insert" ON transactions;
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "transactions_update" ON transactions;
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (true);

DROP POLICY IF EXISTS "merchant_qr_codes_select" ON merchant_qr_codes;
CREATE POLICY "merchant_qr_codes_select" ON merchant_qr_codes FOR SELECT USING (true);

DROP POLICY IF EXISTS "merchant_qr_codes_manage" ON merchant_qr_codes;
CREATE POLICY "merchant_qr_codes_manage" ON merchant_qr_codes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "add_money_claims_service_select" ON add_money_claims;
CREATE POLICY "add_money_claims_service_select" ON add_money_claims FOR SELECT USING (true);

DROP POLICY IF EXISTS "relayer_idempotency_service_select" ON relayer_idempotency_keys;
CREATE POLICY "relayer_idempotency_service_select" ON relayer_idempotency_keys FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchants_updated_at ON merchants;
CREATE TRIGGER update_merchants_updated_at
BEFORE UPDATE ON merchants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_qr_codes_updated_at ON merchant_qr_codes;
CREATE TRIGGER update_merchant_qr_codes_updated_at
BEFORE UPDATE ON merchant_qr_codes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
