#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
    pub relayer: Address,
    pub paused: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Merchant {
    pub account: Address,
    pub active: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    Created,
    Confirmed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentIntent {
    pub payer: Address,
    pub merchant_id: BytesN<32>,
    pub merchant: Address,
    pub amount: i128,
    pub memo_hash: BytesN<32>,
    pub expires_at: u64,
    pub created_at: u64,
    pub status: PaymentStatus,
    pub payment_hash: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    Merchant(BytesN<32>),
    Intent(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Paused = 3,
    InvalidAmount = 4,
    InvalidExpiry = 5,
    MerchantMissing = 6,
    MerchantInactive = 7,
    IntentExists = 8,
    IntentMissing = 9,
    IntentExpired = 10,
    InvalidStatus = 11,
}

#[contract]
pub struct CPayPayments;

#[contractimpl]
impl CPayPayments {
    pub fn __constructor(env: Env, admin: Address, token: Address, relayer: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }

        let config = Config {
            admin,
            token,
            relayer,
            paused: false,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        extend_instance_ttl(&env);
        env.events()
            .publish((symbol_short!("config"), symbol_short!("init")), ());
    }

    pub fn config(env: Env) -> Result<Config, Error> {
        extend_instance_ttl(&env);
        read_config(&env)
    }

    pub fn set_admin(env: Env, admin: Address) -> Result<(), Error> {
        update_config(&env, |mut config| {
            config.admin.require_auth();
            config.admin = admin;
            config
        })?;

        env.events()
            .publish((symbol_short!("config"), symbol_short!("admin")), ());
        Ok(())
    }

    pub fn set_token(env: Env, token: Address) -> Result<(), Error> {
        update_config(&env, |mut config| {
            config.admin.require_auth();
            config.token = token;
            config
        })?;

        env.events()
            .publish((symbol_short!("config"), symbol_short!("token")), ());
        Ok(())
    }

    pub fn set_relayer(env: Env, relayer: Address) -> Result<(), Error> {
        update_config(&env, |mut config| {
            config.admin.require_auth();
            config.relayer = relayer;
            config
        })?;

        env.events()
            .publish((symbol_short!("config"), symbol_short!("relayer")), ());
        Ok(())
    }

    pub fn set_paused(env: Env, paused: bool) -> Result<(), Error> {
        update_config(&env, |mut config| {
            config.admin.require_auth();
            config.paused = paused;
            config
        })?;

        env.events()
            .publish((symbol_short!("config"), symbol_short!("paused")), paused);
        Ok(())
    }

    pub fn register_merchant(
        env: Env,
        merchant_id: BytesN<32>,
        account: Address,
    ) -> Result<Merchant, Error> {
        require_admin(&env)?;

        let now = env.ledger().timestamp();
        let merchant = Merchant {
            account,
            active: true,
            created_at: now,
            updated_at: now,
        };
        let key = DataKey::Merchant(merchant_id.clone());

        env.storage().persistent().set(&key, &merchant);
        extend_persistent_ttl(&env, &key);
        env.events().publish(
            (symbol_short!("merchant"), symbol_short!("set")),
            merchant_id,
        );

        Ok(merchant)
    }

    pub fn set_merchant_active(
        env: Env,
        merchant_id: BytesN<32>,
        active: bool,
    ) -> Result<Merchant, Error> {
        require_admin(&env)?;

        let key = DataKey::Merchant(merchant_id.clone());
        let mut merchant = read_merchant(&env, &merchant_id)?;
        merchant.active = active;
        merchant.updated_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &merchant);
        extend_persistent_ttl(&env, &key);
        env.events().publish(
            (symbol_short!("merchant"), symbol_short!("active")),
            (merchant_id, active),
        );

        Ok(merchant)
    }

    pub fn merchant(env: Env, merchant_id: BytesN<32>) -> Result<Merchant, Error> {
        let key = DataKey::Merchant(merchant_id.clone());
        extend_persistent_ttl(&env, &key);
        read_merchant(&env, &merchant_id)
    }

    pub fn create_intent(
        env: Env,
        payer: Address,
        merchant_id: BytesN<32>,
        intent_id: BytesN<32>,
        amount: i128,
        expires_at: u64,
        memo_hash: BytesN<32>,
    ) -> Result<PaymentIntent, Error> {
        payer.require_auth();
        require_not_paused(&env)?;

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let now = env.ledger().timestamp();
        if expires_at <= now {
            return Err(Error::InvalidExpiry);
        }

        let intent_key = DataKey::Intent(intent_id.clone());
        if env.storage().temporary().has(&intent_key) {
            return Err(Error::IntentExists);
        }

        let merchant = read_merchant(&env, &merchant_id)?;
        if !merchant.active {
            return Err(Error::MerchantInactive);
        }

        let intent = PaymentIntent {
            payer,
            merchant_id,
            merchant: merchant.account,
            amount,
            memo_hash,
            expires_at,
            created_at: now,
            status: PaymentStatus::Created,
            payment_hash: None,
        };

        env.storage().temporary().set(&intent_key, &intent);
        extend_temporary_ttl(&env, &intent_key);
        env.events().publish(
            (symbol_short!("intent"), symbol_short!("create")),
            intent_id,
        );

        Ok(intent)
    }

    pub fn confirm_intent(
        env: Env,
        intent_id: BytesN<32>,
        payment_hash: BytesN<32>,
    ) -> Result<PaymentIntent, Error> {
        let config = read_config(&env)?;
        config.relayer.require_auth();
        require_not_paused_with_config(&env, &config)?;

        let key = DataKey::Intent(intent_id.clone());
        let mut intent = read_intent(&env, &intent_id)?;

        if intent.status != PaymentStatus::Created {
            return Err(Error::InvalidStatus);
        }

        if intent.expires_at < env.ledger().timestamp() {
            return Err(Error::IntentExpired);
        }

        intent.status = PaymentStatus::Confirmed;
        intent.payment_hash = Some(payment_hash);

        env.storage().temporary().set(&key, &intent);
        extend_temporary_ttl(&env, &key);
        env.events().publish(
            (symbol_short!("intent"), symbol_short!("confirm")),
            intent_id,
        );

        Ok(intent)
    }

    pub fn cancel_intent(
        env: Env,
        payer: Address,
        intent_id: BytesN<32>,
    ) -> Result<PaymentIntent, Error> {
        payer.require_auth();

        let key = DataKey::Intent(intent_id.clone());
        let mut intent = read_intent(&env, &intent_id)?;

        if intent.payer != payer {
            return Err(Error::InvalidStatus);
        }

        if intent.status != PaymentStatus::Created {
            return Err(Error::InvalidStatus);
        }

        intent.status = PaymentStatus::Cancelled;

        env.storage().temporary().set(&key, &intent);
        extend_temporary_ttl(&env, &key);
        env.events().publish(
            (symbol_short!("intent"), symbol_short!("cancel")),
            intent_id,
        );

        Ok(intent)
    }

    pub fn intent(env: Env, intent_id: BytesN<32>) -> Result<PaymentIntent, Error> {
        let key = DataKey::Intent(intent_id.clone());
        extend_temporary_ttl(&env, &key);
        read_intent(&env, &intent_id)
    }

    pub fn extend_ttl(env: Env) -> Result<(), Error> {
        require_admin(&env)?;
        extend_instance_ttl(&env);
        Ok(())
    }
}

fn read_config(env: &Env) -> Result<Config, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(Error::NotInitialized)
}

fn update_config(env: &Env, update: impl FnOnce(Config) -> Config) -> Result<Config, Error> {
    let config = read_config(env)?;
    let updated = update(config);
    env.storage().instance().set(&DataKey::Config, &updated);
    extend_instance_ttl(env);
    Ok(updated)
}

fn require_admin(env: &Env) -> Result<Config, Error> {
    let config = read_config(env)?;
    config.admin.require_auth();
    extend_instance_ttl(env);
    Ok(config)
}

fn require_not_paused(env: &Env) -> Result<Config, Error> {
    let config = read_config(env)?;
    require_not_paused_with_config(env, &config)?;
    Ok(config)
}

fn require_not_paused_with_config(env: &Env, config: &Config) -> Result<(), Error> {
    extend_instance_ttl(env);
    if config.paused {
        return Err(Error::Paused);
    }
    Ok(())
}

fn read_merchant(env: &Env, merchant_id: &BytesN<32>) -> Result<Merchant, Error> {
    let key = DataKey::Merchant(merchant_id.clone());
    let merchant = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::MerchantMissing)?;
    extend_persistent_ttl(env, &key);
    Ok(merchant)
}

fn read_intent(env: &Env, intent_id: &BytesN<32>) -> Result<PaymentIntent, Error> {
    let key = DataKey::Intent(intent_id.clone());
    let intent = env
        .storage()
        .temporary()
        .get(&key)
        .ok_or(Error::IntentMissing)?;
    extend_temporary_ttl(env, &key);
    Ok(intent)
}

fn extend_instance_ttl(env: &Env) {
    let max_ttl = env.storage().max_ttl();
    env.storage().instance().extend_ttl(max_ttl / 2, max_ttl);
}

fn extend_persistent_ttl(env: &Env, key: &DataKey) {
    let max_ttl = env.storage().max_ttl();
    env.storage()
        .persistent()
        .extend_ttl(key, max_ttl / 2, max_ttl);
}

fn extend_temporary_ttl(env: &Env, key: &DataKey) {
    let max_ttl = env.storage().max_ttl();
    env.storage()
        .temporary()
        .extend_ttl(key, max_ttl / 2, max_ttl);
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN, Env};

    fn id(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    #[test]
    fn registers_merchant_and_tracks_payment_intent() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let relayer = Address::generate(&env);
        let merchant = Address::generate(&env);
        let payer = Address::generate(&env);

        let contract_id = env.register(CPayPayments, (&admin, &token, &relayer));
        let client = CPayPaymentsClient::new(&env, &contract_id);

        let merchant_id = id(&env, 1);
        let intent_id = id(&env, 2);
        let memo_hash = id(&env, 3);
        let payment_hash = id(&env, 4);

        client
            .try_register_merchant(&merchant_id, &merchant)
            .unwrap()
            .unwrap();

        let intent = client
            .try_create_intent(
                &payer,
                &merchant_id,
                &intent_id,
                &100_0000000_i128,
                &(env.ledger().timestamp() + 600),
                &memo_hash,
            )
            .unwrap()
            .unwrap();

        assert_eq!(intent.status, PaymentStatus::Created);
        assert_eq!(intent.amount, 100_0000000_i128);

        let confirmed = client
            .try_confirm_intent(&intent_id, &payment_hash)
            .unwrap()
            .unwrap();

        assert_eq!(confirmed.status, PaymentStatus::Confirmed);
        assert_eq!(confirmed.payment_hash, Some(payment_hash));
    }

    #[test]
    fn blocks_inactive_merchants() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let relayer = Address::generate(&env);
        let merchant = Address::generate(&env);
        let payer = Address::generate(&env);

        let contract_id = env.register(CPayPayments, (&admin, &token, &relayer));
        let client = CPayPaymentsClient::new(&env, &contract_id);

        let merchant_id = id(&env, 5);
        let intent_id = id(&env, 6);

        client
            .try_register_merchant(&merchant_id, &merchant)
            .unwrap()
            .unwrap();
        client
            .try_set_merchant_active(&merchant_id, &false)
            .unwrap()
            .unwrap();

        let result = client
            .try_create_intent(
                &payer,
                &merchant_id,
                &intent_id,
                &50_i128,
                &(env.ledger().timestamp() + 600),
                &id(&env, 7),
            )
            .unwrap();

        assert_eq!(result, Err(Error::MerchantInactive));
    }
}
