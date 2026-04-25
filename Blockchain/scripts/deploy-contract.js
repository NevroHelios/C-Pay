const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { requireEnv } = require('../src/config');

const rootDir = path.resolve(__dirname, '..');
const contractManifest = path.join(rootDir, 'contracts', 'cpay_payments', 'Cargo.toml');
const outputDir = path.join(rootDir, 'target', 'stellar');
const contractIdsPath = path.join(rootDir, 'contract-ids.json');
const wasmCandidates = [
  path.join(outputDir, 'cpay_payments.optimized.wasm'),
  path.join(outputDir, 'cpay_payments.wasm'),
];

function run(command, args, options = {}) {
  const result = execFileSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });

  return options.capture ? result.trim() : '';
}

function cliNetworkArgs() {
  const args = ['--network', process.env.STELLAR_CLI_NETWORK || process.env.STELLAR_NETWORK || 'testnet'];

  if (process.env.SOROBAN_RPC_URL) {
    args.push('--rpc-url', process.env.SOROBAN_RPC_URL);
  }

  if (process.env.SOROBAN_NETWORK_PASSPHRASE) {
    args.push('--network-passphrase', process.env.SOROBAN_NETWORK_PASSPHRASE);
  }

  return args;
}

function readContractIds() {
  if (!fs.existsSync(contractIdsPath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(contractIdsPath, 'utf8'));
}

function writeContractIds(ids) {
  fs.writeFileSync(contractIdsPath, `${JSON.stringify(ids, null, 2)}\n`);
}

function resolveWasmPath() {
  const wasmPath = wasmCandidates.find(candidate => fs.existsSync(candidate));

  if (!wasmPath) {
    throw new Error(`Built WASM not found. Checked: ${wasmCandidates.join(', ')}`);
  }

  return wasmPath;
}

function isContractId(value) {
  return /^C[A-Z2-7]{55}$/.test(value || '');
}

function main() {
  const sourceAccount = requireEnv('STELLAR_CLI_SOURCE_ACCOUNT');
  const assetCode = requireEnv('ASSET_CODE');
  const issuer = requireEnv('ASSET_ISSUER_PUBLIC_KEY');
  const admin = requireEnv('CONTRACT_ADMIN_PUBLIC_KEY');
  const relayer = requireEnv('RELAYER_PUBLIC_KEY');
  const networkArgs = cliNetworkArgs();
  const asset = `${assetCode}:${issuer}`;

  fs.mkdirSync(outputDir, { recursive: true });

  run('stellar', [
    'contract',
    'build',
    '--manifest-path',
    contractManifest,
    '--optimize',
    '--out-dir',
    outputDir,
  ]);

  const existingIds = readContractIds();
  const existingTokenContractId = isContractId(process.env.TOKEN_CONTRACT_ID)
    ? process.env.TOKEN_CONTRACT_ID
    : existingIds.tokenContractId;
  const tokenContractId = isContractId(existingTokenContractId)
    ? existingTokenContractId
    : run('stellar', [
      'contract',
      'asset',
      'deploy',
      '--asset',
      asset,
      '--source-account',
      sourceAccount,
      ...networkArgs,
    ], { capture: true });

  const cpayContractId = run('stellar', [
    'contract',
    'deploy',
    '--wasm',
    resolveWasmPath(),
    '--source-account',
    sourceAccount,
    '--alias',
    'cpay-payments',
    ...networkArgs,
    '--',
    '--admin',
    admin,
    '--token',
    tokenContractId,
    '--relayer',
    relayer,
  ], { capture: true });

  const ids = {
    ...existingIds,
    asset,
    tokenContractId,
    cpayContractId,
    network: process.env.STELLAR_CLI_NETWORK || process.env.STELLAR_NETWORK || 'testnet',
    updatedAt: new Date().toISOString(),
  };

  writeContractIds(ids);

  console.log('Contract deployment complete.');
  console.log(`TOKEN_CONTRACT_ID=${tokenContractId}`);
  console.log(`CPAY_CONTRACT_ID=${cpayContractId}`);
  console.log(`Saved ${path.relative(rootDir, contractIdsPath)}`);
}

main();
