import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from 'eventemitter3';
import { generateCPayId } from '../utils/cpayId';

// Event emitter for real-time merchant status updates
export const merchantEvents = new EventEmitter();

export interface Merchant {
  id?: string;
  business_name: string;
  wallet_address: string;
  owner_name?: string;
  email?: string;
  phone_number?: string;
  business_address?: string;
  business_registration_number?: string;
  description?: string;
  category?: string;
  logo_url?: string;
  is_active?: boolean;
  total_transactions?: number;
  total_revenue?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MerchantQRCode {
  id?: string;
  merchant_id?: string;
  qr_name: string;
  amount?: string;
  is_active?: boolean;
  scan_count?: number;
  created_at?: string;
}

/**
 * Check if current user is a merchant
 */
export async function isMerchant(walletAddress: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('merchants')
      .select('id')
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking merchant status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking merchant status:', error);
    return false;
  }
}

/**
 * Upload merchant logo to Supabase Storage
 */
export async function uploadMerchantLogo(
  logoUri: string,
  businessName: string
): Promise<string | null> {
  try {
    console.log('Starting merchant logo upload for:', logoUri);

    // Read file as base64 for React Native compatibility
    const base64 = await fetch(logoUri)
      .then(res => res.blob())
      .then(blob => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            // Remove data:image/xxx;base64, prefix
            resolve(base64data.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      });

    // Create unique filename
    const fileExt = logoUri.split('.').pop()?.split('?')[0] || 'jpg';
    const sanitizedName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fileName = `${sanitizedName}_${Date.now()}.${fileExt}`;
    const filePath = `merchant-logos/${fileName}`;

    console.log('Uploading merchant logo to path:', filePath);

    // Convert base64 to array buffer for upload
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('merchant-logos')
      .upload(filePath, bytes.buffer, {
        contentType: `image/${fileExt}`,
        upsert: true,
      });

    if (uploadError) {
      console.error('Merchant logo upload error:', uploadError);
      return null;
    }

    console.log('Merchant logo upload successful:', uploadData);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('merchant-logos')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;
    console.log('Merchant logo public URL:', publicUrl);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading merchant logo:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    return null;
  }
}

/**
 * Register as a merchant
 */
export async function registerAsMerchant(merchant: Merchant): Promise<{
  success: boolean;
  merchantId?: string;
  error?: string;
}> {
  try {
    // Generate C-Pay ID if phone number is provided
    const cpayId = merchant.wallet_address 
      ? generateCPayId(merchant.phone_number || '', merchant.wallet_address)
      : undefined;
    
    const { data, error } = await supabase
      .from('merchants')
      .insert({
        ...merchant,
        cpay_id: cpayId, // Save C-Pay ID to database
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Cache merchant status locally
    await AsyncStorage.setItem('is_merchant', 'true');
    await AsyncStorage.setItem('merchant_id', data.id);

    // Emit event for real-time UI updates
    merchantEvents.emit('merchantRegistered', data);
    console.log('📡 Emitted merchantRegistered event');

    return { success: true, merchantId: data.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get merchant profile
 */
export async function getMerchantProfile(
  walletAddress: string
): Promise<Merchant | null> {
  try {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error) {
      console.error('Error getting merchant profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error getting merchant profile:', error);
    return null;
  }
}

/**
 * Get merchant by ID (Invisible Rail)
 * Used when QR code contains merchant_id instead of wallet address
 */
export async function getMerchantById(
  merchantId: string
): Promise<Merchant | null> {
  try {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('id', merchantId)
      .single();

    if (error) {
      console.error('Error getting merchant by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error getting merchant by ID:', error);
    return null;
  }
}

/**
 * Get merchant by wallet address (Invisible Rail)
 * Used for backward compatibility with old QR codes
 */
export async function getMerchantByAddress(
  walletAddress: string
): Promise<Merchant | null> {
  try {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error) {
      // Not finding a merchant is normal (customer-to-customer transfer)
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error getting merchant by address:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error getting merchant by address:', error);
    return null;
  }
}

/**
 * Update merchant profile
 */
export async function updateMerchantProfile(
  walletAddress: string,
  updates: Partial<Merchant>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('merchants')
      .update(updates)
      .eq('wallet_address', walletAddress);

    if (error) {
      console.error('Error updating merchant profile:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating merchant profile:', error);
    return false;
  }
}

/**
 * @deprecated QR codes are now generated on-the-fly and not stored in database.
 * This function is kept for backward compatibility but should not be used.
 * Create a merchant QR code
 */
export async function createMerchantQRCode(
  qrCode: MerchantQRCode
): Promise<{ success: boolean; qrCodeId?: string; error?: string }> {
  // DEPRECATED: QR codes are generated on-the-fly now
  console.warn('createMerchantQRCode is deprecated. QR codes are generated on-the-fly.');
  return { success: false, error: 'QR code storage is deprecated' };
}

/**
 * @deprecated QR codes are now generated on-the-fly and not stored in database.
 * Get all QR codes for a merchant
 */
export async function getMerchantQRCodes(
  merchantId: string
): Promise<MerchantQRCode[]> {
  // DEPRECATED: QR codes are generated on-the-fly now
  console.warn('getMerchantQRCodes is deprecated. QR codes are generated on-the-fly.');
  return [];
}

/**
 * @deprecated QR codes are now generated on-the-fly and not stored in database.
 * Update QR code status
 */
export async function updateQRCodeStatus(
  qrCodeId: string,
  isActive: boolean
): Promise<void> {
  // DEPRECATED: QR codes are generated on-the-fly now
  console.warn('updateQRCodeStatus is deprecated. QR codes are generated on-the-fly.');
}

/**
 * @deprecated QR codes are now generated on-the-fly and not stored in database.
 * Increment QR code scan count
 */
export async function incrementQRScanCount(qrCodeId: string): Promise<void> {
  // DEPRECATED: QR codes are generated on-the-fly now
  console.warn('incrementQRScanCount is deprecated. QR codes are generated on-the-fly.');
}

/**
 * Get merchant analytics
 */
export async function getMerchantAnalytics(merchantId: string): Promise<{
  totalTransactions: number;
  totalRevenue: string;
  successTransactions: number;
  pendingTransactions: number;
}> {
  try {
    const merchant = await supabase
      .from('merchants')
      .select('wallet_address')
      .eq('id', merchantId)
      .single();

    if (!merchant.data) {
      return { 
        totalTransactions: 0, 
        totalRevenue: '0', 
        successTransactions: 0,
        pendingTransactions: 0 
      };
    }

    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount, status, transaction_type')
      .eq('to_address', merchant.data.wallet_address)
      .eq('transaction_type', 'merchant');  // Only count merchant QR payments

    if (!transactions) {
      return { 
        totalTransactions: 0, 
        totalRevenue: '0',
        successTransactions: 0, 
        pendingTransactions: 0 
      };
    }

    const totalTransactions = transactions.length;
    const successTransactions = transactions.filter(
      (tx) => tx.status === 'success'
    ).length;
    const totalRevenue = transactions
      .filter((tx) => tx.status === 'success')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0)
      .toString();
    const pendingTransactions = transactions.filter(
      (tx) => tx.status === 'pending'
    ).length;

    return { 
      totalTransactions, 
      totalRevenue, 
      successTransactions,
      pendingTransactions 
    };
  } catch (error) {
    console.error('Error getting merchant analytics:', error);
    return { 
      totalTransactions: 0, 
      totalRevenue: '0',
      successTransactions: 0, 
      pendingTransactions: 0 
    };
  }
}

/**
 * Get recent merchant transactions
 */
export interface MerchantTransaction {
  id: string;
  transaction_id: string;
  tx_hash: string;
  from_address: string;
  to_address: string;
  amount: string;
  status: 'pending' | 'success' | 'failed';
  created_at: string;
  merchant_name?: string;
  sender_name?: string;
}

export async function getMerchantTransactions(
  merchantId: string, 
  limit: number = 10
): Promise<MerchantTransaction[]> {
  try {
    const merchant = await supabase
      .from('merchants')
      .select('wallet_address')
      .eq('id', merchantId)
      .single();

    if (!merchant.data) {
      return [];
    }

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, transaction_id, tx_hash, from_address, to_address, amount, status, created_at, merchant_name, sender_name, transaction_type')
      .eq('to_address', merchant.data.wallet_address)
      .eq('transaction_type', 'merchant')  // Only show payments via merchant QR
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching merchant transactions:', error);
      return [];
    }

    return transactions || [];
  } catch (error) {
    console.error('Error getting merchant transactions:', error);
    return [];
  }
}
