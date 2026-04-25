import DeviceInfo from 'react-native-device-info';

/**
 * Check if device has SIM card inserted
 */
export async function hasSIMCard(): Promise<boolean> {
  try {
    // Check if device has telephony features
    const hasSystemFeature = await DeviceInfo.hasSystemFeature('android.hardware.telephony');
    
    if (!hasSystemFeature) {
      return false;
    }

    // Check carrier name (empty if no SIM)
    const carrierName = await DeviceInfo.getCarrier();
    
    // If carrier is not empty/unknown, SIM is present
    return carrierName !== '' && carrierName !== 'unknown';
  } catch (error) {
    console.error('Error checking SIM card:', error);
    return false; // Assume no SIM on error
  }
}

/**
 * Get phone number from device (may not always be available)
 * Note: getPhoneNumber() is not available in react-native-device-info
 * Phone number access is restricted on modern Android/iOS for privacy
 */
export async function getDevicePhoneNumber(): Promise<string | null> {
  // Phone number is not accessible via DeviceInfo on modern devices
  // Users must manually enter their phone number
  return null;
}

/**
 * Get carrier name
 */
export async function getCarrierName(): Promise<string> {
  try {
    return await DeviceInfo.getCarrier();
  } catch (error) {
    console.error('Error getting carrier:', error);
    return 'Unknown';
  }
}
