import { Alert } from 'react-native';
import { authenticateWithBiometric } from '../utils/biometric';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Confirm payment with biometric or PIN
 * This function shows how to authenticate for payments without exposing seed phrase
 */
export async function confirmPayment(amount: string, recipient: string): Promise<boolean> {
  try {
    // Check if biometric is enabled
    const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');

    if (biometricEnabled === 'true') {
      // Try biometric first
      const success = await authenticateWithBiometric();
      
      if (!success) {
        // User cancelled or biometric failed
        return false;
      }
      
      return true; // Payment authorized via biometric
    } else {
      // Fallback to PIN prompt (would be implemented in payment screen)
      // For now, just show alert
      Alert.alert(
        'Confirm Payment',
        `Send INR ${amount} to ${recipient}?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => false },
          { text: 'Confirm', onPress: () => true },
        ]
      );
      
      return true; // Would actually verify PIN in production
    }
  } catch (error) {
    console.error('Payment confirmation error:', error);
    return false;
  }
}

/**
 * Example usage in a payment screen:
 * 
 * const handleSendPayment = async () => {
 *   const authorized = await confirmPayment('100', 'GABC...WXYZ');
 *   
 *   if (authorized) {
 *     // Proceed with transaction
 *     // Note: Wallet is loaded with PIN internally, never exposed
 *   } else {
 *     Alert.alert('Payment Cancelled');
 *   }
 * };
 */
