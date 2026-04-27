import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { PINInput } from '../components/PINInput';
import {
  cachePinForSession,
  getWalletFromBiometricBackup,
  hasBiometricBackup,
  verifyPin,
} from '../services/wallet';
import { isBiometricAvailable, getBiometricType } from '../utils/biometric';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { AlertManager } from '../utils/alert';

const FONT_SIZES = TYPOGRAPHY.sizes;

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');

  const biometricIconName = biometricType.includes('Face') ? 'scan-outline' : 'finger-print-outline';

  const navigateAfterWalletUnlock = async () => {
    const cloudBackupRequired = await AsyncStorage.getItem('cloud_backup_required');
    navigation.replace(cloudBackupRequired === 'true' ? 'CloudBackupSetup' : 'MainTabs');
  };

  useEffect(() => {
    checkAndTriggerBiometric();
  }, []);

  const checkAndTriggerBiometric = async () => {
    const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');
    const available = await isBiometricAvailable();
    const backupAvailable = await hasBiometricBackup();
    
    if (biometricEnabled === 'true' && available && backupAvailable) {
      setShowBiometric(true);
      const type = await getBiometricType();
      setBiometricType(type);
      // Auto-trigger biometric on screen load
      setTimeout(() => handleBiometricAuth(), 500);
    }
  };

  const handleBiometricAuth = async () => {
    try {
      const available = await isBiometricAvailable();

      if (!available) {
        AlertManager.alert('Biometric Not Available', 'Please use your PIN to login');
        return;
      }

      const wallet = await getWalletFromBiometricBackup('Unlock C-Pay wallet');
      const expectedWallet = await AsyncStorage.getItem('wallet_address');

      if (wallet && (!expectedWallet || wallet.address === expectedWallet)) {
        await navigateAfterWalletUnlock();
      } else {
        AlertManager.alert('Authentication Failed', 'Please use your PIN to unlock this wallet.');
      }
    } catch (error) {
      console.error('Biometric auth error:', error);
      AlertManager.alert('Authentication Failed', 'Please use your PIN to unlock this wallet.');
    }
  };

  const handlePINChange = (newPin: string) => {
    if (loading) {
      return;
    }

    setPin(newPin);
    setError('');

    // Only verify when PIN is complete (6 digits)
    if (newPin.length === 6) {
      void verifyPinAndLogin(newPin);
    }
  };

  const verifyPinAndLogin = async (pinToVerify: string) => {
    if (loading) {
      return;
    }

    setLoading(true);
    
    try {
      const isValid = await verifyPin(pinToVerify, { blockMigration: false });
      
      if (isValid) {
        cachePinForSession(pinToVerify);
        await navigateAfterWalletUnlock();
      } else {
        setError('Incorrect PIN');
        setPin('');
      }
    } catch (err) {
      setError('Failed to verify PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/cpay_logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Enter your PIN to continue</Text>
        </View>

        <View style={styles.pinSection}>
          <PINInput
            value={pin}
            onChange={handlePINChange}
            error={error}
            autoFocus={!showBiometric}
            disabled={loading}
          />
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Verifying PIN...</Text>
            </View>
          )}
        </View>

        {showBiometric && (
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={handleBiometricAuth}
          >
            <Ionicons name={biometricIconName as any} size={20} color={COLORS.primary} style={styles.biometricIcon} />
            <Text style={styles.biometricText}>Use {biometricType}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.forgotPinButton}
          onPress={() => navigation.navigate('ForgotPIN')}
        >
          <Text style={styles.forgotPinText}>Forgot PIN?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? SPACING.xxxl : SPACING.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl * 2,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  pinSection: {
    marginBottom: SPACING.xl,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: COLORS.primaryLight,
  },
  biometricIcon: {
    marginRight: SPACING.sm,
  },
  biometricText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  forgotPinButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
  },
  forgotPinText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '500',
  },
});
