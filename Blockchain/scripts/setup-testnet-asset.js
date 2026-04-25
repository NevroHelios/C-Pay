const {
  StellarSdk,
  getAsset,
  getAssetConfig,
  getNetworkConfig,
  getServer,
  requireEnv,
} = require('../src/config');

async function fundWithFriendbot(publicKey) {
  const { friendbotUrl } = getNetworkConfig();
  if (!friendbotUrl) {
    return;
  }

  const response = await fetch(`${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Friendbot funding failed for ${publicKey}: ${body}`);
  }
}

async function submit(label, transaction) {
  const server = getServer();
  const result = await server.submitTransaction(transaction);
  console.log(`${label}: ${result.hash}`);
  return result;
}

async function main() {
  const issuer = StellarSdk.Keypair.fromSecret(requireEnv('ASSET_ISSUER_SECRET'));
  const distribution = StellarSdk.Keypair.fromSecret(requireEnv('ASSET_DISTRIBUTION_SECRET'));
  const assetConfig = getAssetConfig();
  const asset = getAsset();
  const network = getNetworkConfig();
  const server = getServer();

  if (assetConfig.issuer && assetConfig.issuer !== issuer.publicKey()) {
    throw new Error('ASSET_ISSUER_PUBLIC_KEY does not match ASSET_ISSUER_SECRET');
  }

  if (assetConfig.distribution && assetConfig.distribution !== distribution.publicKey()) {
    throw new Error('ASSET_DISTRIBUTION_PUBLIC_KEY does not match ASSET_DISTRIBUTION_SECRET');
  }

  if (network.name !== 'testnet') {
    throw new Error('setup-testnet-asset is intentionally limited to STELLAR_NETWORK=testnet');
  }

  console.log('Funding issuer and distribution accounts on testnet...');
  await fundWithFriendbot(issuer.publicKey());
  await fundWithFriendbot(distribution.publicKey());

  const distributionAccount = await server.loadAccount(distribution.publicKey());
  const trustTx = new StellarSdk.TransactionBuilder(distributionAccount, {
    fee: network.baseFee,
    networkPassphrase: network.passphrase,
  })
    .addOperation(StellarSdk.Operation.changeTrust({
      asset,
      limit: assetConfig.trustlineLimit,
    }))
    .setTimeout(60)
    .build();
  trustTx.sign(distribution);
  await submit('Distribution trustline', trustTx);

  const issuerAccount = await server.loadAccount(issuer.publicKey());
  const issueBuilder = new StellarSdk.TransactionBuilder(issuerAccount, {
    fee: network.baseFee,
    networkPassphrase: network.passphrase,
  })
    .addOperation(StellarSdk.Operation.payment({
      destination: distribution.publicKey(),
      asset,
      amount: assetConfig.initialSupply,
    }));

  if (assetConfig.homeDomain) {
    issueBuilder.addOperation(StellarSdk.Operation.setOptions({
      homeDomain: assetConfig.homeDomain,
    }));
  }

  if (assetConfig.lockIssuer) {
    issueBuilder.addOperation(StellarSdk.Operation.setOptions({
      masterWeight: 0,
      lowThreshold: 1,
      medThreshold: 1,
      highThreshold: 1,
    }));
  }

  const issueTx = issueBuilder.setTimeout(60).build();
  issueTx.sign(issuer);
  await submit('Initial asset distribution', issueTx);

  console.log('');
  console.log('Asset setup complete.');
  console.log(`ASSET_CODE=${assetConfig.code}`);
  console.log(`ASSET_ISSUER_PUBLIC_KEY=${issuer.publicKey()}`);
  console.log(`ASSET_DISTRIBUTION_PUBLIC_KEY=${distribution.publicKey()}`);
  console.log('');
  console.log('Next: move issuer secret to cold storage and keep only operational secrets online.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
