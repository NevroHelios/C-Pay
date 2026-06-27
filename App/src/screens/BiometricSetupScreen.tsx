import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { isBiometricAvailable, getBiometricType, enableBiometric } from '../utils/biometric';
import { supabase } from '../services/supabase';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../constants/theme';
import { AlertManager } from '../utils/alert';
import { OnboardingProgress } from '../components/OnboardingProgress';

const FONT_SIZES = TYPOGRAPHY.sizes;
const { width, height } = Dimensions.get('window');
const isSmallDevice = height < 700;

interface BiometricSetupScreenProps {
  navigation: any;
  route?: any;
}

export const BiometricSetupScreen: React.FC<BiometricSetupScreenProps> = ({
  navigation,
  route,
}) => {
  const flowType = route?.params?.flowType || 'setup';
  const [biometricType, setBiometricType] = useState<string>('');
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  // Get icon and description based on biometric type
  const getBiometricIcon = () => {
    if (biometricType.includes('Face')) return 'scan-outline';
    if (biometricType.includes('Fingerprint') || biometricType.includes('Touch')) return 'finger-print-outline';
    if (biometricType.includes('Iris')) return 'eye-outline';
    return 'lock-closed-outline';
  };

  const getBiometricDescription = () => {
    if (biometricType.includes('Face')) {
      return 'Use facial recognition for quick and secure access to your wallet. Just look at your phone to unlock.';
    }
    if (biometricType.includes('Fingerprint') || biometricType.includes('Touch')) {
      return 'Use your fingerprint for quick and secure access to your wallet. Just touch the sensor to unlock.';
    }
    if (biometricType.includes('Iris')) {
      return 'Use iris scanning for quick and secure access to your wallet.';
    }
    return 'Use biometric authentication for quick and secure access to your wallet.';
  };

  const getBiometricName = () => {
    // Return the exact biometric type detected
    return biometricType || 'Biometrics';
  };

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    const [available, type] = await Promise.all([
      isBiometricAvailable(),
      getBiometricType(),
    ]);
    setIsAvailable(available);

    if (available) {
      setBiometricType(type);
    }
  };

  const navigateToMainTabs = () => {
    navigation.replace('MainTabs');
  };

  const syncBiometricPreference = (enabled: boolean) => {
    void (async () => {
      try {
        const walletAddress = await AsyncStorage.getItem('wallet_address');
        if (walletAddress) {
          const { error } = await supabase
            .from('users')
            .update({ biometric_enabled: enabled })
            .eq('wallet_address', walletAddress);

          if (error) {
            console.log('Failed to update Supabase, continuing...', error);
          }
        }
      } catch (dbError) {
        console.log('Failed to update Supabase, continuing...', dbError);
      }
    })();
  };

  const handleEnableBiometric = async () => {
    setLoading(true);
    try {
      const success = await enableBiometric({ skipAvailabilityCheck: isAvailable });

      if (success) {
        // Save biometric preference locally
        await AsyncStorage.setItem('biometric_enabled', 'true');

        // Cloud preference sync is optional and should not block onboarding.
        syncBiometricPreference(true);

        // Navigate directly - biometric is enabled
        navigateToMainTabs();
      } else {
        AlertManager.alert(
          'Biometric Not Enabled',
          'You can continue with your PIN and turn this on later from Profile.',
          undefined,
          { type: 'info' }
        );
        setLoading(false);
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      setLoading(false);
    }
  };

  const handleSkip = () => {
    syncBiometricPreference(false);
    navigateToMainTabs();
  };

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingProgress
        currentStep={flowType === 'restore' ? 3 : 5}
        flowType={flowType as 'setup' | 'restore'}
      />
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.content}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons
              name={(isAvailable ? getBiometricIcon() : 'checkmark') as any}
              size={isSmallDevice ? 40 : 48}
              color={isAvailable ? COLORS.primary : COLORS.success}
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {isAvailable ? `Enable ${getBiometricName()}` : 'All Set!'}
          </Text>

          {/* Description */}
          <Text style={styles.subtitle}>
            {isAvailable
              ? getBiometricDescription()
              : 'Your wallet is ready. You can use your PIN to securely access it anytime.'}
          </Text>

          {/* Feature List */}
          {isAvailable && (
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Ionicons name="flash-outline" size={20} color={COLORS.primary} style={styles.featureIcon} />
                <Text style={styles.featureText}>Quick unlock in seconds</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} style={styles.featureIcon} />
                <Text style={styles.featureText}>Secure & private authentication</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="card-outline" size={20} color={COLORS.primary} style={styles.featureIcon} />
                <Text style={styles.featureText}>Confirm payments easily</Text>
              </View>
            </View>
          )}
        </View>

        {/* Buttons at bottom */}
        <View style={styles.buttonContainer}>
          {isAvailable && (
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleEnableBiometric}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.card} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Enable {getBiometricName()}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.secondaryButton, !isAvailable && styles.primaryButton]}
            onPress={handleSkip}
            disabled={loading}
          >
            <Text style={[
              styles.secondaryButtonText,
              !isAvailable && styles.primaryButtonText
            ]}>
              {isAvailable ? 'Use PIN Instead' : 'Get Started'}
            </Text>
          </TouchableOpacity>

          {isAvailable && (
            <Text style={styles.skipNote}>
              You can enable this later in Settings
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: isSmallDevice ? SPACING.xl : SPACING.xl * 2,
    paddingBottom: SPACING.xl,
  },
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    width: isSmallDevice ? 80 : 100,
    height: isSmallDevice ? 80 : 100,
    borderRadius: isSmallDevice ? 40 : 50,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isSmallDevice ? SPACING.lg : SPACING.xl,
    ...SHADOWS.md,
  },
  icon: {
    fontSize: isSmallDevice ? 40 : 50,
  },
  title: {
    fontSize: isSmallDevice ? FONT_SIZES.xl : FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: isSmallDevice ? FONT_SIZES.sm : FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: isSmallDevice ? SPACING.lg : SPACING.xl,
    paddingHorizontal: SPACING.sm,
    lineHeight: isSmallDevice ? 20 : 24,
  },
  featureList: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    ...SHADOWS.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isSmallDevice ? SPACING.sm : SPACING.md,
  },
  featureIcon: {
    fontSize: isSmallDevice ? 18 : 22,
    marginRight: SPACING.md,
  },
  featureText: {
    fontSize: isSmallDevice ? FONT_SIZES.sm : FONT_SIZES.md,
    color: COLORS.text,
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
    marginTop: SPACING.xl,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: isSmallDevice ? SPACING.md : SPACING.lg,
    borderRadius: 14,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  primaryButtonText: {
    color: COLORS.card,
    fontSize: isSmallDevice ? FONT_SIZES.md : FONT_SIZES.lg,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: isSmallDevice ? SPACING.md : SPACING.lg,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: isSmallDevice ? FONT_SIZES.md : FONT_SIZES.lg,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  skipNote: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
