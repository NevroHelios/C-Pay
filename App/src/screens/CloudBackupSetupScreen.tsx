import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components';
import {
  createCloudWalletBackup,
  getRecoveryPasswordRules,
  validateRecoveryPassword,
} from '../services/cloudWalletBackup';
import { getWalletFromSession } from '../services/wallet';
import { getAuthenticatedWallet } from '../utils/biometric';
import { AlertManager } from '../utils/alert';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';

type CloudBackupSetupRouteParams = {
  fromSettings?: boolean;
};

interface CloudBackupSetupScreenProps {
  navigation: any;
  route?: {
    params?: CloudBackupSetupRouteParams;
  };
}

export const CloudBackupSetupScreen: React.FC<CloudBackupSetupScreenProps> = ({
  navigation,
  route,
}) => {
  const fromSettings = route?.params?.fromSettings === true;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const passwordRules = getRecoveryPasswordRules(password);
  const passwordValidationError = password.length > 0 ? validateRecoveryPassword(password) : null;
  const passwordsDoNotMatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSaveBackup = async () => {
    if (submittingRef.current) {
      return;
    }

    const validationError = validateRecoveryPassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (password !== confirmPassword) {
      setError('Recovery passwords do not match.');
      return;
    }

    try {
      submittingRef.current = true;
      setLoading(true);
      setError('');

      const wallet = await getWalletFromSession() || await getAuthenticatedWallet(
        'Create Cloud Backup',
        'Enter your C-Pay PIN to encrypt your wallet backup',
        'Encrypt cloud wallet backup'
      );

      if (!wallet) {
        submittingRef.current = false;
        AlertManager.alert(
          'Wallet Locked',
          'Unlock your wallet with PIN or biometric to create the cloud backup.',
          undefined,
          { type: 'warning' }
        );
        return;
      }

      await createCloudWalletBackup(wallet, password);
      await AsyncStorage.multiSet([
        ['cloud_backup_complete', 'true'],
        ['cloud_backup_required', 'false'],
      ]);

      AlertManager.alert(
        'Cloud Backup Saved',
        fromSettings
          ? 'Your encrypted wallet backup has been updated.'
          : 'Your wallet can now be restored after email verification using this recovery password.',
        [
          {
            text: 'Continue',
            onPress: () => {
              if (fromSettings) {
                navigation.goBack();
              } else {
                navigation.replace('BiometricSetup');
              }
            },
          },
        ],
        { type: 'success' }
      );
    } catch (backupError: any) {
      console.error('Cloud backup setup error:', backupError);
      submittingRef.current = false;
      setError(backupError?.message || 'Cloud backup could not be saved. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-done-outline" size={40} color={COLORS.primary} />
          </View>

          <Text style={styles.title}>
            {fromSettings ? 'Update Cloud Backup' : 'Secure Cloud Backup'}
          </Text>
          <Text style={styles.subtitle}>
            Create a recovery password to encrypt your wallet before it is stored in Supabase.
          </Text>

          <View style={styles.infoBox}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.infoDark} />
            <Text style={styles.infoText}>
              Only encrypted wallet data is uploaded. C-Pay cannot read your secret key or reset this recovery password.
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Recovery Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setError('');
                }}
                placeholder="At least 12 characters"
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPassword}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((current) => !current)}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.ruleList}>
              {passwordRules.map((rule) => (
                <View key={rule.id} style={styles.ruleRow}>
                  <Ionicons
                    name={rule.passed ? 'checkbox-outline' : 'square-outline'}
                    size={18}
                    color={rule.passed ? COLORS.success : COLORS.textSecondary}
                    style={styles.ruleIcon}
                  />
                  <Text style={[styles.ruleText, rule.passed && styles.ruleTextPassed]}>
                    {rule.label}
                  </Text>
                </View>
              ))}
            </View>
            {!!passwordValidationError && (
              <Text style={styles.inlineErrorText}>{passwordValidationError}</Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Confirm Recovery Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={(value) => {
                setConfirmPassword(value);
                setError('');
              }}
              placeholder="Re-enter password"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            {passwordsDoNotMatch && (
              <Text style={styles.inlineErrorText}>Recovery passwords do not match.</Text>
            )}
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            title={loading ? 'Saving Backup...' : 'Save Encrypted Backup'}
            onPress={handleSaveBackup}
            loading={loading}
            disabled={loading}
            fullWidth
            size="lg"
          />

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Encrypting wallet on this device...</Text>
            </View>
          )}

          <Text style={styles.footer}>
            Save this password somewhere safe. You will need it after clearing app data or moving to a new phone.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
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
  infoBox: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: COLORS.infoBg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
    ...SHADOWS.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.infoDark,
    lineHeight: 19,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  input: {
    minHeight: 52,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  passwordRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  eyeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleList: {
    marginTop: SPACING.sm,
    gap: 6,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleIcon: {
    marginRight: SPACING.xs,
  },
  ruleText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  ruleTextPassed: {
    color: COLORS.success,
    fontWeight: '600',
  },
  inlineErrorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    marginBottom: SPACING.md,
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
  footer: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.lg,
  },
});
