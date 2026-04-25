import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSessionPin } from '../services/wallet';

/**
 * Reset entire app to test onboarding flow
 * Use this to clear all stored data and test phone verification
 */
export async function resetApp(): Promise<void> {
  try {
    // Clear wallet
    await SecureStore.deleteItemAsync('cpay_stellar_wallet');
    await SecureStore.deleteItemAsync('cpay_pin_hash');
    await SecureStore.deleteItemAsync('cpay_pin_salt');
    await SecureStore.deleteItemAsync('cpay_stellar_biometric_backup');
    await SecureStore.deleteItemAsync('cpay_stellar_biometric_backup_available');
    clearSessionPin();
    
    // Clear phone verification
    await AsyncStorage.removeItem('phone_number');
    
    // Clear any other stored data
    await AsyncStorage.clear();
    
    console.log('✅ App reset successful! Restart the app to see onboarding.');
  } catch (error) {
    console.error('Reset error:', error);
  }
}
