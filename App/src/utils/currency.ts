/**
 * INR-first currency helpers.
 *
 * The Stellar asset is pegged 1:1 with INR, but users should only see INR
 * and Add Money wording in the interface.
 */

const ASSET_TO_INR_RATE = 1.0;
const INR_TO_ASSET_RATE = 1.0;

export function convertAssetToINR(assetAmount: string | number): number {
  const amount = typeof assetAmount === 'string' ? parseFloat(assetAmount) : assetAmount;
  return amount * ASSET_TO_INR_RATE;
}

export function convertINRtoAsset(inrAmount: string | number): number {
  const amount = typeof inrAmount === 'string' ? parseFloat(inrAmount) : inrAmount;
  return amount * INR_TO_ASSET_RATE;
}

export function formatINR(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatMoneyBalance(amount: number): string {
  return formatINR(amount);
}

export function formatAssetWithINR(assetAmount: string | number): string {
  const amount = typeof assetAmount === 'string' ? parseFloat(assetAmount) : assetAmount;
  return formatINR(convertAssetToINR(amount));
}

export const convertTokenToINR = convertAssetToINR;
export const convertINRtoToken = convertINRtoAsset;
