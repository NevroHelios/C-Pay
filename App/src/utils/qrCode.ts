import { getNetworkConfig, isValidAccountId } from '../services/blockchain';

export interface PaymentQRData {
  type: 'cryptopay';
  version: 2;
  network: string;
  merchant: string;
  merchantId?: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  name: string; // Merchant/recipient name
  note?: string; // Optional payment note
}

/**
 * Generate QR code data for payment request.
 * Uses merchant ID plus Stellar account for a smooth user flow.
 */
export function generatePaymentQRWithId(
  merchantId: string,
  amount: string,
  merchantName: string,
  merchantAddress: string,
  note?: string
): string {
  const network = getNetworkConfig();
  const qrData: PaymentQRData = {
    type: 'cryptopay',
    version: 2,
    network: `stellar-${network.network}`,
    merchantId,
    merchant: merchantAddress,
    assetCode: network.assetCode,
    assetIssuer: network.assetIssuer,
    amount: amount,
    name: merchantName,
    note: note,
  };
  return JSON.stringify(qrData);
}

/**
 * Generate QR code data for payment request.
 */
export function generatePaymentQR(
  merchantAddress: string,
  amount: string,
  merchantName: string,
  note?: string
): string {
  const network = getNetworkConfig();
  const qrData: PaymentQRData = {
    type: 'cryptopay',
    version: 2,
    network: `stellar-${network.network}`,
    merchant: merchantAddress,
    assetCode: network.assetCode,
    assetIssuer: network.assetIssuer,
    amount: amount,
    name: merchantName,
    note: note,
  };
  return JSON.stringify(qrData);
}

/**
 * Parse scanned QR code data
 */
export function parsePaymentQR(qrString: string): PaymentQRData | null {
  try {
    const data = JSON.parse(qrString);
    
    // Validate required fields
    if (
      data.type === 'cryptopay' &&
      data.version === 2 &&
      data.merchant &&
      data.amount &&
      data.name &&
      data.assetCode &&
      data.assetIssuer
    ) {
      return data as PaymentQRData;
    }
    
    return null;
  } catch (error) {
    console.error('Invalid QR code format:', error);
    return null;
  }
}

/**
 * Validate payment QR data
 */
export function validatePaymentQR(data: PaymentQRData): {
  valid: boolean;
  error?: string;
} {
  const network = getNetworkConfig();

  if (!data.merchant || !isValidAccountId(data.merchant)) {
    return { valid: false, error: 'Invalid merchant account' };
  }

  if (data.network !== `stellar-${network.network}`) {
    return { valid: false, error: 'Payment QR is for a different Stellar network' };
  }

  if (data.assetCode !== network.assetCode || data.assetIssuer !== network.assetIssuer) {
    return { valid: false, error: 'Unsupported payment asset' };
  }

  // Validate amount - allow '0' for variable amount merchant QR codes
  const amount = parseFloat(data.amount);
  if (isNaN(amount) || amount < 0) {
    return { valid: false, error: 'Invalid amount' };
  }

  // Validate name
  if (!data.name || data.name.trim().length === 0) {
    return { valid: false, error: 'Merchant name required' };
  }

  return { valid: true };
}
