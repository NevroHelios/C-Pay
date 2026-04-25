export interface Transaction {
  id?: string;
  user_id?: string;
  tx_hash: string;
  to_address: string;
  amount: string;
  status: 'pending' | 'success' | 'failed';
  merchant_name?: string;
  created_at?: string;
}

export interface Merchant {
  id?: string;
  name: string;
  wallet_address: string;
  qr_code_url?: string;
  created_at?: string;
}

export interface QRPaymentData {
  type: 'cryptopay';
  merchant: string;
  amount?: string;
  name?: string;
}
