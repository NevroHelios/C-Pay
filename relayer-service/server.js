require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const StellarSdk = require('@stellar/stellar-sdk');

const app = express();
const PORT = Number(process.env.PORT || 3000);

const NETWORKS = {
  testnet: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: StellarSdk.Networks.TESTNET,
    friendbotUrl: 'https://friendbot.stellar.org',
  },
  public: {
    horizonUrl: 'https://horizon.stellar.org',
    passphrase: StellarSdk.Networks.PUBLIC,
    friendbotUrl: null,
  },
};

const config = loadConfig();
const server = new StellarSdk.Horizon.Server(config.horizonUrl, {
  allowHttp: config.horizonUrl.startsWith('http://'),
});
const sponsorKeypair = StellarSdk.Keypair.fromSecret(config.sponsorSecret);
const distributionKeypair = StellarSdk.Keypair.fromSecret(config.distributionSecret);
const cpinrAsset = new StellarSdk.Asset(config.assetCode, config.assetIssuer);
const idempotencyCache = new Map();
const addMoneyCooldowns = new Map();

let lowBalanceAlertSent = false;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '64kb' }));

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use(limiter);

app.get('/', (_req, res) => {
  res.json({
    service: 'C-Pay Stellar Relayer',
    status: 'running',
    health: '/health',
    endpoints: [
      'GET /health',
      'GET /account/:accountId/status',
      'GET /account/:accountId/balance',
      'POST /accounts/prepare',
      'POST /accounts/submit',
      'POST /payments/submit',
      'POST /add-money',
      'GET /tx/:hash',
    ],
  });
});

app.get('/health', async (_req, res) => {
  const [sponsorBalances, distributionBalances] = await Promise.all([
    getBalances(sponsorKeypair.publicKey()),
    getBalances(distributionKeypair.publicKey()),
  ]);

  const sponsorXlm = Number(sponsorBalances.xlm || '0');
  const distributionAsset = Number(distributionBalances.asset || '0');
  const lowXlm = sponsorXlm < config.lowXlmThreshold;
  const lowAsset = distributionAsset < config.lowAssetThreshold;

  if ((lowXlm || lowAsset) && !lowBalanceAlertSent) {
    await sendLowBalanceAlert({ sponsorXlm, distributionAsset, lowXlm, lowAsset });
    lowBalanceAlertSent = true;
  } else if (!lowXlm && !lowAsset) {
    lowBalanceAlertSent = false;
  }

  res.json({
    status: 'healthy',
    network: config.networkName,
    assetCode: config.assetCode,
    assetIssuer: config.assetIssuer,
    sponsorPublicKey: sponsorKeypair.publicKey(),
    distributionPublicKey: distributionKeypair.publicKey(),
    sponsorXlmBalance: sponsorBalances.xlm,
    distributionCpinrBalance: distributionBalances.asset,
    lowXlm,
    lowAsset,
    timestamp: new Date().toISOString(),
  });
});

app.get('/account/:accountId/status', async (req, res) => {
  const accountId = assertAccountId(req.params.accountId, 'accountId');
  const status = await getAccountStatus(accountId);
  res.json(status);
});

app.get('/account/:accountId/balance', async (req, res) => {
  const accountId = assertAccountId(req.params.accountId, 'accountId');
  const balances = await getBalances(accountId);
  res.json({
    accountId,
    assetCode: config.assetCode,
    assetIssuer: config.assetIssuer,
    balance: balances.asset,
    xlmBalance: balances.xlm,
  });
});

app.post('/accounts/prepare', async (req, res) => {
  const accountId = assertAccountId(req.body.accountId, 'accountId');
  const status = await getAccountStatus(accountId);

  if (status.exists && status.hasTrustline) {
    return res.json({
      alreadyReady: true,
      accountId,
      sponsorPublicKey: sponsorKeypair.publicKey(),
    });
  }

  const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
  const builder = new StellarSdk.TransactionBuilder(sponsorAccount, {
    fee: config.baseFee,
    networkPassphrase: config.passphrase,
  });

  builder.addOperation(StellarSdk.Operation.beginSponsoringFutureReserves({
    sponsoredId: accountId,
  }));

  if (!status.exists) {
    builder.addOperation(StellarSdk.Operation.createAccount({
      destination: accountId,
      startingBalance: config.startingBalance,
    }));
  }

  builder.addOperation(StellarSdk.Operation.changeTrust({
    asset: cpinrAsset,
    limit: config.trustlineLimit,
    source: accountId,
  }));

  builder.addOperation(StellarSdk.Operation.endSponsoringFutureReserves({
    source: accountId,
  }));

  const transaction = builder
    .setTimeout(config.transactionTimeoutSeconds)
    .build();
  transaction.sign(sponsorKeypair);

  res.json({
    alreadyReady: false,
    accountId,
    xdr: transaction.toXDR(),
    networkPassphrase: config.passphrase,
    sponsorPublicKey: sponsorKeypair.publicKey(),
    requiresAccountSignature: true,
  });
});

app.post('/accounts/submit', async (req, res) => {
  const signedXdr = assertXdr(req.body.signedXdr);
  const tx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, config.passphrase);
  const result = await server.submitTransaction(tx);

  res.json({
    hash: result.hash,
    ledger: result.ledger,
    status: 'success',
  });
});

app.post('/payments/submit', async (req, res) => {
  const signedXdr = assertXdr(req.body.signedXdr);
  const idempotencyKey = normalizeOptionalString(req.body.idempotencyKey);

  if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
    return res.json(idempotencyCache.get(idempotencyKey));
  }

  const innerTransaction = StellarSdk.TransactionBuilder.fromXDR(signedXdr, config.passphrase);
  validatePaymentTransaction(innerTransaction);

  const maxFee = (BigInt(config.baseFee) * BigInt(config.feeBumpMultiplier)).toString();
  const feeBump = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
    sponsorKeypair.publicKey(),
    maxFee,
    innerTransaction,
    config.passphrase
  );
  feeBump.sign(sponsorKeypair);

  const result = await server.submitTransaction(feeBump);
  const response = {
    hash: result.hash,
    ledger: result.ledger,
    status: 'success',
  };

  if (idempotencyKey) {
    idempotencyCache.set(idempotencyKey, response);
    setTimeout(() => idempotencyCache.delete(idempotencyKey), config.idempotencyTtlMs).unref();
  }

  res.json(response);
});

app.post('/add-money', async (req, res) => {
  const accountId = assertAccountId(req.body.accountId, 'accountId');
  const amount = normalizeAmount(req.body.amount || config.addMoneyAmount, config.maxAddMoneyAmount);
  const idempotencyKey = normalizeOptionalString(req.body.idempotencyKey);

  if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
    return res.json(idempotencyCache.get(idempotencyKey));
  }

  const status = await getAccountStatus(accountId);
  if (!status.exists || !status.hasTrustline) {
    return res.status(409).json({
      error: 'Account is not ready to receive Add Money balance',
      code: 'ACCOUNT_NOT_READY',
    });
  }

  const cooldownUntil = addMoneyCooldowns.get(accountId) || 0;
  if (Date.now() < cooldownUntil) {
    return res.status(429).json({
      error: 'Add Money is cooling down for this account',
      retryAfterSeconds: Math.ceil((cooldownUntil - Date.now()) / 1000),
    });
  }

  const distributionBalances = await getBalances(distributionKeypair.publicKey());
  if (Number(distributionBalances.asset || '0') < Number(amount)) {
    return res.status(503).json({
      error: `Add Money is temporarily unavailable because the relayer distribution account has insufficient ${config.assetCode}.`,
      code: 'DISTRIBUTION_LOW_ASSET',
      distributionBalance: distributionBalances.asset,
      requiredAmount: amount,
    });
  }

  const distributionAccount = await server.loadAccount(distributionKeypair.publicKey());
  const tx = new StellarSdk.TransactionBuilder(distributionAccount, {
    fee: config.baseFee,
    networkPassphrase: config.passphrase,
  })
    .addOperation(StellarSdk.Operation.payment({
      destination: accountId,
      asset: cpinrAsset,
      amount,
    }))
    .addMemo(StellarSdk.Memo.text('add-money'))
    .setTimeout(config.transactionTimeoutSeconds)
    .build();

  tx.sign(distributionKeypair);

  const result = await server.submitTransaction(tx);
  const response = {
    hash: result.hash,
    ledger: result.ledger,
    status: 'success',
    amount,
    assetCode: config.assetCode,
  };

  addMoneyCooldowns.set(accountId, Date.now() + config.addMoneyCooldownMs);
  if (idempotencyKey) {
    idempotencyCache.set(idempotencyKey, response);
    setTimeout(() => idempotencyCache.delete(idempotencyKey), config.idempotencyTtlMs).unref();
  }

  res.json(response);
});

app.get('/tx/:hash', async (req, res) => {
  const hash = normalizeOptionalString(req.params.hash);
  if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) {
    return res.status(400).json({ error: 'Invalid transaction hash' });
  }

  try {
    const tx = await server.transactions().transaction(hash).call();
    return res.json({
      hash,
      status: 'success',
      ledger: tx.ledger,
      createdAt: tx.created_at,
      feeCharged: tx.fee_charged,
    });
  } catch (error) {
    if (error?.response?.status === 404) {
      return res.json({ hash, status: 'pending' });
    }
    throw error;
  }
});

app.use((error, _req, res, _next) => {
  const status = error.statusCode || error.status || 500;
  const message = status >= 500 ? 'Relayer service error' : error.message;

  if (status >= 500) {
    console.error('Relayer error:', {
      message: error.message,
      response: error.response?.data,
    });
  }

  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`C-Pay Stellar relayer listening on port ${PORT}`);
  console.log(`Network: ${config.networkName}`);
  console.log(`Sponsor: ${sponsorKeypair.publicKey()}`);
  console.log(`Distribution: ${distributionKeypair.publicKey()}`);
});

function loadConfig() {
  const networkName = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  const network = NETWORKS[networkName] || NETWORKS.testnet;
  const horizonUrl = process.env.STELLAR_HORIZON_URL || network.horizonUrl;
  const passphrase = process.env.STELLAR_NETWORK_PASSPHRASE || network.passphrase;
  const sponsorSecret = requireEnv('SPONSOR_SECRET');
  const distributionSecret = requireEnv('DISTRIBUTION_SECRET');
  const assetCode = process.env.CPINR_ASSET_CODE || 'CPINR';
  const assetIssuer = requireEnv('CPINR_ASSET_ISSUER');

  assertTrustedHorizonUrl(horizonUrl);

  return {
    networkName,
    horizonUrl,
    passphrase,
    sponsorSecret,
    distributionSecret,
    assetCode,
    assetIssuer,
    baseFee: process.env.STELLAR_BASE_FEE || StellarSdk.BASE_FEE,
    feeBumpMultiplier: Number(process.env.FEE_BUMP_MULTIPLIER || 10),
    transactionTimeoutSeconds: Number(process.env.TRANSACTION_TIMEOUT_SECONDS || 60),
    startingBalance: process.env.STARTING_BALANCE || '1.5',
    trustlineLimit: process.env.TRUSTLINE_LIMIT || '1000000000',
    addMoneyAmount: process.env.ADD_MONEY_AMOUNT || '100',
    maxAddMoneyAmount: Number(process.env.MAX_ADD_MONEY_AMOUNT || 1000),
    maxPaymentAmount: Number(process.env.MAX_PAYMENT_AMOUNT || 100000),
    addMoneyCooldownMs: Number(process.env.ADD_MONEY_COOLDOWN_MS || 24 * 60 * 60 * 1000),
    idempotencyTtlMs: Number(process.env.IDEMPOTENCY_TTL_MS || 10 * 60 * 1000),
    lowXlmThreshold: Number(process.env.LOW_XLM_THRESHOLD || 5),
    lowAssetThreshold: Number(process.env.LOW_CPINR_THRESHOLD || 1000),
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function assertTrustedHorizonUrl(horizonUrl) {
  const parsed = new URL(horizonUrl);
  const allowCustom = process.env.ALLOW_CUSTOM_HORIZON === 'true';
  const allowedHosts = new Set(['horizon-testnet.stellar.org', 'horizon.stellar.org']);

  if (parsed.protocol !== 'https:' && process.env.ALLOW_HTTP_HORIZON !== 'true') {
    throw new Error('Horizon URL must use HTTPS unless ALLOW_HTTP_HORIZON=true');
  }

  if (!allowCustom && !allowedHosts.has(parsed.hostname)) {
    throw new Error('Custom Horizon hosts require ALLOW_CUSTOM_HORIZON=true');
  }
}

function assertAccountId(value, label) {
  if (!StellarSdk.StrKey.isValidEd25519PublicKey(value || '')) {
    const error = new Error(`Invalid Stellar ${label}`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function assertXdr(value) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 20000) {
    const error = new Error('Invalid transaction XDR');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeAmount(value, maxAmount) {
  const amount = String(value).trim();

  if (!/^\d+(\.\d{1,7})?$/.test(amount)) {
    const error = new Error('Amount must be a positive number with up to 7 decimal places');
    error.statusCode = 400;
    throw error;
  }

  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > maxAmount) {
    const error = new Error(`Amount must be greater than 0 and no more than ${maxAmount}`);
    error.statusCode = 400;
    throw error;
  }

  return amount;
}

async function getBalances(accountId) {
  try {
    const account = await server.loadAccount(accountId);
    const xlm = account.balances.find(balance => balance.asset_type === 'native')?.balance || '0';
    const asset = account.balances.find(balance =>
      balance.asset_code === config.assetCode &&
      balance.asset_issuer === config.assetIssuer
    )?.balance || '0';

    return { xlm, asset };
  } catch (error) {
    if (error?.response?.status === 404) {
      return { xlm: '0', asset: '0' };
    }
    throw error;
  }
}

async function getAccountStatus(accountId) {
  try {
    const account = await server.loadAccount(accountId);
    const hasTrustline = account.balances.some(balance =>
      balance.asset_code === config.assetCode &&
      balance.asset_issuer === config.assetIssuer
    );

    return {
      accountId,
      exists: true,
      hasTrustline,
      sequence: account.sequence,
    };
  } catch (error) {
    if (error?.response?.status === 404) {
      return {
        accountId,
        exists: false,
        hasTrustline: false,
      };
    }
    throw error;
  }
}

function validatePaymentTransaction(transaction) {
  if (!transaction.source) {
    const error = new Error('Transaction source is required');
    error.statusCode = 400;
    throw error;
  }

  if (transaction.operations.length !== 1) {
    const error = new Error('Payment transaction must contain exactly one operation');
    error.statusCode = 400;
    throw error;
  }

  const operation = transaction.operations[0];
  if (operation.type !== 'payment') {
    const error = new Error('Only payment operations are accepted');
    error.statusCode = 400;
    throw error;
  }

  assertAccountId(operation.destination, 'destination');
  normalizeAmount(operation.amount, config.maxPaymentAmount);

  if (
    operation.asset.code !== config.assetCode ||
    operation.asset.issuer !== config.assetIssuer
  ) {
    const error = new Error('Payment asset is not supported');
    error.statusCode = 400;
    throw error;
  }
}

async function sendLowBalanceAlert({ sponsorXlm, distributionAsset, lowXlm, lowAsset }) {
  if (!process.env.ALERT_WEBHOOK_URL) {
    return;
  }

  const warnings = [
    lowXlm ? `Sponsor XLM balance is ${sponsorXlm}` : null,
    lowAsset ? `Distribution CPINR balance is ${distributionAsset}` : null,
  ].filter(Boolean);

  await fetch(process.env.ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: 'cpay-stellar-relayer',
      network: config.networkName,
      warnings,
      sponsorPublicKey: sponsorKeypair.publicKey(),
      distributionPublicKey: distributionKeypair.publicKey(),
      timestamp: new Date().toISOString(),
    }),
  });
}
