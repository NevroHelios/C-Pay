import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

/**
 * C-Pay ID System - User-friendly identifier instead of wallet addresses
 * Format: phone-or-handle@cpay+walletHash (no country code)
 * Example: 9876543210@cpayk8f3qz
 * 
 * This is ONLY for UI display. Payment operations still use actual Stellar accounts.
 */

const CPAY_SUFFIX_LENGTH = 6;

/**
 * Create a short deterministic wallet fingerprint for display IDs.
 * This is a UI identifier, not a security primitive.
 */
export function getWalletFingerprint(walletAddress: string, length: number = CPAY_SUFFIX_LENGTH): string {
  const normalized = walletAddress.trim().toLowerCase();
  let hash = 0x811c9dc5;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(length, '0').slice(-length);
}

export function formatWalletFingerprint(walletAddress: string): string {
  return `C-Pay wallet #${getWalletFingerprint(walletAddress).toUpperCase()}`;
}

function isLegacyAddressSuffixId(cpayId: string | null | undefined, walletAddress: string): boolean {
  if (!cpayId) {
    return false;
  }

  const suffix = cpayId.split('@cpay')[1]?.toLowerCase();
  return suffix === walletAddress.trim().toLowerCase().slice(-4);
}

async function getStoredPhoneNumber(): Promise<string | null> {
  return (
    await AsyncStorage.getItem('phone_number') ||
    await AsyncStorage.getItem('user_phone')
  );
}

/**
 * Generate C-Pay ID from phone number and wallet address
 * @param phoneNumber - User's phone number (e.g., "+919876543210")
 * @param walletAddress - Stellar account address
 * @returns C-Pay ID (e.g., "9876543210@cpayk8f3qz") - Only 10 digits, no country code
 */
export function generateCPayId(phoneNumber: string, walletAddress: string): string {
  // Extract only last 10 digits from phone number (removes country code like +91)
  const phone10Digit = phoneNumber.replace(/\D/g, '').slice(-10);
  const handle = phone10Digit || 'user';
  const suffix = getWalletFingerprint(walletAddress);
  
  // Format: phone-or-handle@cpay+walletHash
  return `${handle}@cpay${suffix}`;
}

/**
 * Get C-Pay ID for current user from database or generate a local fallback.
 * Missing or legacy address-suffix IDs are repaired in Supabase when possible.
 */
export async function getCurrentUserCPayId(): Promise<string | null> {
  try {
    const walletAddress = await AsyncStorage.getItem('wallet_address');
    
    if (!walletAddress) {
      return null;
    }

    const localPhone = await getStoredPhoneNumber();
    const localId = generateCPayId(localPhone || '', walletAddress);
    
    // Fetch from database first, then self-heal missing/legacy IDs.
    const { data, error } = await supabase
      .from('users')
      .select('cpay_id, phone_number')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (!error && data?.cpay_id && !isLegacyAddressSuffixId(data.cpay_id, walletAddress)) {
      await AsyncStorage.setItem('cpay_id', data.cpay_id);
      return data.cpay_id;
    }

    const phone = data?.phone_number || localPhone || '';
    const generatedId = generateCPayId(phone, walletAddress);

    await AsyncStorage.setItem('cpay_id', generatedId);

    if (!error && data) {
      await supabase
        .from('users')
        .update({ cpay_id: generatedId })
        .eq('wallet_address', walletAddress);
    }

    return generatedId || localId;
  } catch (error) {
    console.error('Error getting current user C-Pay ID:', error);
    const walletAddress = await AsyncStorage.getItem('wallet_address');
    if (!walletAddress) {
      return null;
    }
    const phone = await getStoredPhoneNumber();
    return generateCPayId(phone || '', walletAddress);
  }
}

/**
 * Get C-Pay ID for current merchant from database or generate a local fallback.
 */
export async function getCurrentMerchantCPayId(): Promise<string | null> {
  try {
    const walletAddress = await AsyncStorage.getItem('wallet_address');
    
    if (!walletAddress) {
      return null;
    }
    
    // Fetch from merchants table
    const { data, error } = await supabase
      .from('merchants')
      .select('cpay_id, phone_number')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (!error && data?.cpay_id && !isLegacyAddressSuffixId(data.cpay_id, walletAddress)) {
      return data.cpay_id;
    }

    const phone = data?.phone_number || await getStoredPhoneNumber() || '';
    const generatedId = generateCPayId(phone, walletAddress);

    if (!error && data) {
      await supabase
        .from('merchants')
        .update({ cpay_id: generatedId })
        .eq('wallet_address', walletAddress);
    }

    return generatedId;
  } catch (error) {
    console.error('Error getting merchant C-Pay ID:', error);
    const walletAddress = await AsyncStorage.getItem('wallet_address');
    if (!walletAddress) {
      return null;
    }
    const phone = await getStoredPhoneNumber();
    return generateCPayId(phone || '', walletAddress);
  }
}

/**
 * Get C-Pay ID for any wallet address by fetching from database.
 * @param walletAddress - Wallet address to look up
 * @returns C-Pay ID or null if not found in database
 */
export async function getCPayIdByWallet(walletAddress: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('cpay_id, phone_number')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (!error && data?.cpay_id && !isLegacyAddressSuffixId(data.cpay_id, walletAddress)) {
      return data.cpay_id;
    }

    if (!error && data?.phone_number) {
      const generatedId = generateCPayId(data.phone_number, walletAddress);
      await supabase
        .from('users')
        .update({ cpay_id: generatedId })
        .eq('wallet_address', walletAddress);
      return generatedId;
    }

    const { data: merchantData, error: merchantError } = await supabase
      .from('merchants')
      .select('cpay_id, phone_number')
      .eq('wallet_address', walletAddress)
      .single();

    if (!merchantError && merchantData?.cpay_id && !isLegacyAddressSuffixId(merchantData.cpay_id, walletAddress)) {
      return merchantData.cpay_id;
    }

    if (!merchantError && merchantData?.phone_number) {
      const generatedId = generateCPayId(merchantData.phone_number, walletAddress);
      await supabase
        .from('merchants')
        .update({ cpay_id: generatedId })
        .eq('wallet_address', walletAddress);
      return generatedId;
    }

    const currentWallet = await AsyncStorage.getItem('wallet_address');
    if (currentWallet?.toLowerCase() === walletAddress.toLowerCase()) {
      return getCurrentUserCPayId();
    }

    return null;
  } catch (error) {
    console.error('Error fetching C-Pay ID:', error);
    return null;
  }
}

/**
 * Get display identifier for wallet address
 * Priority: C-Pay ID > Display Name > Wallet fingerprint
 * @param walletAddress - Wallet address
 * @param displayName - Optional display name
 * @returns User-friendly identifier
 */
export async function getDisplayIdentifier(
  walletAddress: string,
  displayName?: string | null
): Promise<string> {
  // Try to get C-Pay ID first
  const cpayId = await getCPayIdByWallet(walletAddress);
  if (cpayId) {
    return cpayId;
  }
  
  // Fallback to display name if available
  if (displayName) {
    return displayName;
  }
  
  // Final fallback: hashed wallet fingerprint
  return formatWalletFingerprint(walletAddress);
}

/**
 * Format C-Pay ID for display (optional - adds styling/formatting)
 * @param cpayId - C-Pay ID to format
 * @returns Formatted string
 */
export function formatCPayIdForDisplay(cpayId: string): string {
  return cpayId; // Currently returns as-is, but can be enhanced with formatting
}

/**
 * Validate if a string is a valid C-Pay ID format
 * @param id - String to validate
 * @returns true if valid C-Pay ID format
 */
export function isValidCPayId(id: string): boolean {
  const pattern = /^[a-z0-9._-]{3,20}@cpay[a-z0-9]{4,8}$/i;
  return pattern.test(id);
}

/**
 * Extract wallet hash suffix from C-Pay ID
 * @param cpayId - C-Pay ID
 * @returns Wallet hash suffix or null
 */
export function extractLast4FromCPayId(cpayId: string): string | null {
  const match = cpayId.match(/@cpay([a-z0-9]{4,8})$/i);
  return match ? match[1] : null;
}

/**
 * Extract phone number from C-Pay ID
 * @param cpayId - C-Pay ID
 * @returns Phone number (10 digits) or null
 */
export function extractPhoneFromCPayId(cpayId: string): string | null {
  const match = cpayId.match(/^(\d{10})@cpay/);
  return match ? match[1] : null;
}

/**
 * Get wallet address from C-Pay ID by searching in both users and merchants tables
 * @param cpayId - C-Pay ID to look up
 * @returns Wallet address or null if not found
 */
export async function getWalletAddressFromCPayId(cpayId: string): Promise<string | null> {
  try {
    const normalizedId = cpayId.trim().toLowerCase();
    // First try users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('wallet_address')
      .eq('cpay_id', normalizedId)
      .single();
    
    if (!userError && userData?.wallet_address) {
      return userData.wallet_address;
    }
    
    // If not found in users, try merchants table
    const { data: merchantData, error: merchantError } = await supabase
      .from('merchants')
      .select('wallet_address')
      .eq('cpay_id', normalizedId)
      .single();
    
    if (!merchantError && merchantData?.wallet_address) {
      return merchantData.wallet_address;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting wallet address from C-Pay ID:', error);
    return null;
  }
}
