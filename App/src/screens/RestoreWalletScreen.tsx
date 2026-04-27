import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StellarSdk from '@stellar/stellar-base';
import { Buffer } from 'buffer';
import { Ionicons } from '@expo/vector-icons';
import { PINInput } from '../components/PINInput';
import {
  hasCloudWalletBackup,
  restoreCloudWalletBackup,
} from '../services/cloudWalletBackup';
import { cachePinForSession, recreateWalletFromSecret } from '../services/wallet';
import { supabase } from '../services/supabase';
import { getMerchantProfile } from '../services/merchant';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../constants/theme';
import { AlertManager } from '../utils/alert';

const FONT_SIZES = TYPOGRAPHY.sizes;

type RestoreStep = 'cloud' | 'key' | 'pin' | 'confirm';

type RestoreWalletRouteParams = {
  verifiedEmail?: string;
  walletAddress: string;
  displayName?: string | null;
  cpayId?: string | null;
  profilePhotoUrl?: string | null;
  phoneNumber?: string | null;
};

interface RestoreWalletScreenProps {
  navigation: any;
  route: {
    params: RestoreWalletRouteParams;
  };
}

const normalizeRecoverySecret = (value: string): string | null => {
  const trimmed = value.trim();

  if (StellarSdk.StrKey.isValidEd25519SecretSeed(trimmed)) {
    return trimmed;
  }

  const hex = trimmed.replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '');
  if (hex.length === 64) {
    try {
      return StellarSdk.StrKey.encodeEd25519SecretSeed(Buffer.from(hex, 'hex'));
    } catch {
      return null;
    }
  }

  return null;
};

const getSecretPublicKey = (secret: string): string | null => {
  try {
    return StellarSdk.Keypair.fromSecret(secret).publicKey();
  } catch {
    return null;
  }
};

export const RestoreWalletScreen: React.FC<RestoreWalletScreenProps> = ({ navigation, route }) => {
  const {
    verifiedEmail,
    walletAddress,
    displayName,
    cpayId,
    profilePhotoUrl,
    phoneNumber,
  } = route.params;
  const [step, setStep] = useState<RestoreStep>('key');
  const [checkingBackup, setCheckingBackup] = useState(true);
  const [cloudBackupAvailable, setCloudBackupAvailable] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [normalizedSecret, setNormalizedSecret] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const checkCloudBackup = async () => {
      const available = await hasCloudWalletBackup();
      if (!isMounted) {
        return;
      }

      setCloudBackupAvailable(available);
      setStep(available ? 'cloud' : 'key');
      setCheckingBackup(false);
    };

    void checkCloudBackup();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleContinueWithCloudBackup = async () => {
    if (!recoveryPassword.trim()) {
      setError('Enter your cloud backup recovery password.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const restoredBackup = await restoreCloudWalletBackup(recoveryPassword);
      if (restoredBackup.walletAddress !== walletAddress) {
        setError('This cloud backup does not match your existing C-Pay profile.');
        return;
      }

      setNormalizedSecret(restoredBackup.secret);
      setStep('pin');
    } catch (cloudError: any) {
      setError(cloudError?.message || 'Cloud backup could not be restored.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueWithKey = () => {
    const secret = normalizeRecoverySecret(recoveryKey);
    const recoveredAddress = secret ? getSecretPublicKey(secret) : null;

    if (!secret || !recoveredAddress) {
      setError('Enter a valid Stellar secret key or exported private key.');
      return;
    }

    if (recoveredAddress !== walletAddress) {
      setError('This recovery key does not match your existing C-Pay wallet.');
      return;
    }

    setError('');
    setNormalizedSecret(secret);
    setStep('pin');
  };

  const handlePinChange = (value: string) => {
    setPin(value);
    setError('');

    if (value.length === 6) {
      if (value === '123456' || value === '000000' || value === '111111' || value === '654321') {
        setError('Please choose a stronger PIN.');
        setTimeout(() => setPin(''), 250);
        return;
      }

      setStep('confirm');
    }
  };

  const saveRestoredLocalProfile = async () => {
    const writes: [string, string][] = [
      ['wallet_address', walletAddress],
      ['profile_complete', 'true'],
      ['biometric_enabled', 'false'],
    ];

    if (verifiedEmail) {
      writes.push(['email_verified', 'true'], ['user_email', verifiedEmail]);
    }

    if (displayName) {
      writes.push(['display_name', displayName]);
    }

    if (cpayId) {
      writes.push(['cpay_id', cpayId]);
    }

    if (profilePhotoUrl) {
      writes.push(['profile_photo', profilePhotoUrl]);
    }

    if (phoneNumber) {
      writes.push(['phone_number', phoneNumber]);
    }

    await AsyncStorage.multiSet(writes);
  };

  const handleConfirmPin = async (value: string) => {
    setConfirmPin(value);
    setError('');

    if (value.length !== 6 || submittingRef.current) {
      return;
    }

    if (value !== pin) {
      setError('PINs do not match.');
      setTimeout(() => {
        setConfirmPin('');
        setPin('');
        setStep('pin');
      }, 300);
      return;
    }

    try {
      submittingRef.current = true;
      setLoading(true);

      const restoredAddress = await recreateWalletFromSecret(normalizedSecret, pin);
      if (restoredAddress !== walletAddress) {
        throw new Error('Restored wallet does not match profile wallet.');
      }

      await saveRestoredLocalProfile();
      await AsyncStorage.multiSet([
        ['cloud_backup_complete', cloudBackupAvailable ? 'true' : 'false'],
        ['cloud_backup_required', cloudBackupAvailable ? 'false' : 'true'],
      ]);
      await getMerchantProfile(walletAddress);
      cachePinForSession(pin);

      await supabase
        .from('users')
        .update({ biometric_enabled: false })
        .eq('wallet_address', walletAddress);

      AlertManager.alert(
        'Wallet Restored',
        cloudBackupAvailable
          ? 'Your profile and wallet have been restored on this device.'
          : 'Your wallet is restored. Next, create an encrypted cloud backup for future recovery.',
        [{
          text: 'Continue',
          onPress: () => navigation.replace(cloudBackupAvailable ? 'BiometricSetup' : 'CloudBackupSetup'),
        }],
        { type: 'success' }
      );
    } catch (restoreError) {
      console.error('Wallet restore error:', restoreError);
      submittingRef.current = false;
      AlertManager.alert('Restore Failed', 'Could not restore this wallet. Check the recovery key and try again.', undefined, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    if (checkingBackup) {
      return (
        <>
          <Text style={styles.title}>Checking Backup</Text>
          <Text style={styles.subtitle}>Looking for your encrypted wallet backup after email verification.</Text>
          <ActivityIndicator color={COLORS.primary} />
        </>
      );
    }

    if (step === 'pin') {
      return (
        <>
          <Text style={styles.title}>Create New PIN</Text>
          <Text style={styles.subtitle}>This PIN will encrypt your restored wallet on this device.</Text>
          <PINInput value={pin} onChange={handlePinChange} error={error} autoFocus disabled={loading} />
        </>
      );
    }

    if (step === 'confirm') {
      return (
        <>
          <Text style={styles.title}>Confirm PIN</Text>
          <Text style={styles.subtitle}>Re-enter your new PIN.</Text>
          <PINInput value={confirmPin} onChange={handleConfirmPin} error={error} autoFocus disabled={loading} />
        </>
      );
    }

    if (step === 'cloud') {
      return (
        <>
          <Text style={styles.title}>Restore Cloud Backup</Text>
          <Text style={styles.subtitle}>
            We found your encrypted wallet backup. Enter your recovery password to restore this device.
          </Text>

          <View style={styles.profileBox}>
            <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
            <View style={styles.profileText}>
              <Text style={styles.profileName}>{displayName || 'Existing C-Pay Profile'}</Text>
              <Text style={styles.profileWallet} numberOfLines={1}>{walletAddress}</Text>
            </View>
          </View>

          <TextInput
            style={styles.singleLineInput}
            value={recoveryPassword}
            onChangeText={(value) => {
              setRecoveryPassword(value);
              setError('');
            }}
            placeholder="Recovery password"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={!loading}
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.warningBox}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.warningDark} />
            <Text style={styles.warningText}>
              This password was created when cloud backup was set up. It is never stored by C-Pay.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleContinueWithCloudBackup}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>Restore Backup</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setError('');
              setStep('key');
            }}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Use Exported Key Instead</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        <Text style={styles.title}>Restore Existing Wallet</Text>
        <Text style={styles.subtitle}>
          We found an existing C-Pay profile for this email. Paste your exported Stellar secret key to restore it.
        </Text>

        <View style={styles.profileBox}>
          <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{displayName || 'Existing C-Pay Profile'}</Text>
            <Text style={styles.profileWallet} numberOfLines={1}>{walletAddress}</Text>
          </View>
        </View>

        <TextInput
          style={styles.singleLineInput}
          value={recoveryKey}
          onChangeText={(value) => {
            setRecoveryKey(value);
            setError('');
          }}
          placeholder="Stellar secret key starting with S"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          secureTextEntry
          editable={!loading}
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.warningBox}>
          <Ionicons name="alert-circle-outline" size={18} color={COLORS.warningDark} />
          <Text style={styles.warningText}>
            If you did not set up cloud backup or export this key before clearing app data, this wallet cannot be recovered.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleContinueWithKey}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>

        {cloudBackupAvailable && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setError('');
              setStep('cloud');
            }}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Use Cloud Backup</Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconCircle}>
          <Ionicons name="key-outline" size={36} color={COLORS.primary} />
        </View>

        {renderStep()}

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Restoring wallet...</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  profileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  profileWallet: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  singleLineInput: {
    minHeight: 52,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  warningBox: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  warningText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.warningDark,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: COLORS.textInverse,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
});
