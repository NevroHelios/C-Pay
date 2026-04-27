import {
  PILOT_CREDIT_SYMBOL,
  PILOT_CREDIT_UNIT,
  PILOT_MODE,
} from './pilot';

const ASSET_TO_INR_RATE = 1.0;
const INR_TO_ASSET_RATE = 1.0;

export const MONEY_SYMBOL = PILOT_MODE ? PILOT_CREDIT_SYMBOL : '\u20B9';
export const MONEY_UNIT_LABEL = PILOT_MODE ? PILOT_CREDIT_UNIT : 'INR';
export const MONEY_BALANCE_LABEL = PILOT_MODE ? 'Pilot Credit Balance' : 'Total Balance';

function formatAmountNumber(amount: number): string {
  const normalizedAmount = Number.isFinite(amount) ? amount : 0;
  return normalizedAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function convertAssetToINR(assetAmount: string | number): number {
  const amount = typeof assetAmount === 'string' ? parseFloat(assetAmount) : assetAmount;
  return amount * ASSET_TO_INR_RATE;
}

export function convertINRtoAsset(inrAmount: string | number): number {
  const amount = typeof inrAmount === 'string' ? parseFloat(inrAmount) : inrAmount;
  return amount * INR_TO_ASSET_RATE;
}

export function formatMoneyNumber(amount: number): string {
  return formatAmountNumber(amount);
}

export function formatMoneyAmount(amount: number): string {
  const formatted = formatAmountNumber(amount);
  return PILOT_MODE ? `${formatted} ${MONEY_UNIT_LABEL}` : `\u20B9${formatted}`;
}

export function formatINR(amount: number): string {
  return formatMoneyAmount(amount);
}

export function formatMoneyBalance(amount: number): string {
  return formatMoneyAmount(amount);
}

export function formatAssetWithINR(assetAmount: string | number): string {
  const amount = typeof assetAmount === 'string' ? parseFloat(assetAmount) : assetAmount;
  return formatINR(convertAssetToINR(amount));
}

export const convertTokenToINR = convertAssetToINR;
export const convertINRtoToken = convertINRtoAsset;
