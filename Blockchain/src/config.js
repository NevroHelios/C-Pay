require('dotenv').config();

const StellarSdk = require('@stellar/stellar-sdk');

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

function getNetworkConfig() {
  const networkName = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  const preset = NETWORKS[networkName] || NETWORKS.testnet;

  return {
    name: networkName,
    horizonUrl: process.env.STELLAR_HORIZON_URL || preset.horizonUrl,
    passphrase: process.env.STELLAR_NETWORK_PASSPHRASE || preset.passphrase,
    friendbotUrl: preset.friendbotUrl,
    baseFee: process.env.STELLAR_BASE_FEE || StellarSdk.BASE_FEE,
  };
}

function getSorobanConfig() {
  const network = getNetworkConfig();

  return {
    rpcUrl: process.env.SOROBAN_RPC_URL || defaultSorobanRpcUrl(network.name),
    passphrase: process.env.SOROBAN_NETWORK_PASSPHRASE || network.passphrase,
    cliNetwork: process.env.STELLAR_CLI_NETWORK || network.name,
    cliSourceAccount: process.env.STELLAR_CLI_SOURCE_ACCOUNT || '',
    tokenContractId: process.env.TOKEN_CONTRACT_ID || '',
    cpayContractId: process.env.CPAY_CONTRACT_ID || '',
  };
}

function defaultSorobanRpcUrl(networkName) {
  return networkName === 'testnet' ? 'https://soroban-testnet.stellar.org' : '';
}

function getServer() {
  const { horizonUrl } = getNetworkConfig();
  assertTrustedHorizonUrl(horizonUrl);

  return new StellarSdk.Horizon.Server(horizonUrl, {
    allowHttp: horizonUrl.startsWith('http://'),
  });
}

function assertTrustedHorizonUrl(horizonUrl) {
  const parsed = new URL(horizonUrl);
  const allowCustomHorizon = process.env.ALLOW_CUSTOM_HORIZON === 'true';
  const allowedHosts = new Set([
    'horizon-testnet.stellar.org',
    'horizon.stellar.org',
  ]);

  if (parsed.protocol !== 'https:' && process.env.ALLOW_HTTP_HORIZON !== 'true') {
    throw new Error('Horizon URL must use HTTPS unless ALLOW_HTTP_HORIZON=true');
  }

  if (!allowCustomHorizon && !allowedHosts.has(parsed.hostname)) {
    throw new Error('Custom Horizon hosts require ALLOW_CUSTOM_HORIZON=true');
  }
}

function getAssetConfig() {
  return {
    code: process.env.ASSET_CODE || 'CPINR',
    issuer: process.env.ASSET_ISSUER_PUBLIC_KEY || '',
    distribution: process.env.ASSET_DISTRIBUTION_PUBLIC_KEY || '',
    initialSupply: process.env.INITIAL_SUPPLY || '1000000000',
    trustlineLimit: process.env.TRUSTLINE_LIMIT || '1000000000',
    homeDomain: process.env.ASSET_HOME_DOMAIN || '',
    lockIssuer: process.env.LOCK_ISSUER_AFTER_SETUP === 'true',
  };
}

function getAsset() {
  const { code, issuer } = getAssetConfig();
  if (!code || !issuer) {
    throw new Error('ASSET_CODE and ASSET_ISSUER_PUBLIC_KEY are required');
  }

  return new StellarSdk.Asset(code, issuer);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

module.exports = {
  StellarSdk,
  getAsset,
  getAssetConfig,
  getNetworkConfig,
  getServer,
  getSorobanConfig,
  requireEnv,
};
