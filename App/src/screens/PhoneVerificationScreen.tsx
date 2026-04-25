import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { sendOTP, verifyOTP, getDevPhoneNumber, getDevOTP, getRemainingAttempts } from '../services/auth';
import { hasWallet } from '../services/wallet';
import { supabase } from '../services/supabase';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { AlertManager } from '../utils/alert';

const FONT_SIZES = TYPOGRAPHY.sizes;
const { width, height } = Dimensions.get('window');
const isSmallDevice = height < 700;
const OTP_DIGITS = [0, 1, 2, 3, 4, 5];
const OTP_BOX_GAP = isSmallDevice ? 7 : 9;
const OTP_CARD_HORIZONTAL_PADDING = isSmallDevice ? SPACING.sm : SPACING.md;
const OTP_BOX_SIZE = Math.min(
  isSmallDevice ? 44 : 50,
  Math.floor((width - SPACING.lg * 2 - OTP_CARD_HORIZONTAL_PADDING * 2 - OTP_BOX_GAP * 5) / 6)
);

interface PhoneVerificationScreenProps {
  navigation: any;
}

export const PhoneVerificationScreen: React.FC<PhoneVerificationScreenProps> = ({
  navigation,
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [otpFocused, setOtpFocused] = useState(false);
  const otpInputRef = useRef<TextInput>(null);
  const verifyingRef = useRef(false);
  const lastSubmittedOtpRef = useRef<string | null>(null);
  const isDevMode = process.env.EXPO_PUBLIC_DEV_MODE === 'true';

  useEffect(() => {
    loadRemainingAttempts();
  }, []);

  // Auto-focus OTP input when switching to OTP verification stage
  useEffect(() => {
    if (step === 'otp' && otpInputRef.current) {
      // Small delay to ensure the input is rendered
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 100);
    }
  }, [step]);

  useEffect(() => {
    if (step === 'otp' && timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, timer]);

  useEffect(() => {
    if (step === 'otp' && otp.length === 6 && !verifyingRef.current) {
      handleVerifyOTP();
    }
  }, [otp, step]);

  const handleOtpChange = (value: string) => {
    const nextOtp = value.replace(/\D/g, '').slice(0, 6);
    lastSubmittedOtpRef.current = null;
    setOtp(nextOtp);
  };

  const resetOtpEntry = () => {
    setOtp('');
    setOtpFocused(false);
    lastSubmittedOtpRef.current = null;
  };

  const loadRemainingAttempts = async () => {
    const { remaining } = await getRemainingAttempts();
    setRemainingAttempts(remaining);
  };

  const handleSendOTP = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      AlertManager.alert('Error', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);

    // Format phone number (add +91 if not present)
    let formattedPhone = phoneNumber.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + formattedPhone;
    }

    // In dev mode, bypass OTP sending but move to OTP stage
    if (isDevMode) {
      setVerificationId('dev-bypass');
      resetOtpEntry();
      setStep('otp');
      setTimer(30);
      setCanResend(false);
      setLoading(false);
      return;
    }

    const result = await sendOTP(formattedPhone);

    if (result.success && result.verificationId) {
      setVerificationId(result.verificationId);
      resetOtpEntry();
      setStep('otp');
      setTimer(30);
      setCanResend(false);
      if (result.remainingAttempts !== undefined) {
        setRemainingAttempts(result.remainingAttempts);
      }
      // Don't show alert to avoid dismissing keyboard
      // The UI transition to OTP input stage is sufficient feedback
    } else {
      if (result.resetTime) {
        const hours = Math.ceil((result.resetTime.getTime() - Date.now()) / (1000 * 60 * 60));
        AlertManager.alert(
          'Rate Limit Exceeded',
          `You've reached the maximum OTP requests for today. Try again in ${hours} hour${hours > 1 ? 's' : ''}.`
        );
      } else {
        AlertManager.alert('Error', result.error || 'Failed to send OTP');
      }
      if (result.remainingAttempts !== undefined) {
        setRemainingAttempts(result.remainingAttempts);
      }
    }

    setLoading(false);
  };

  const handleVerifyOTP = async () => {
    if (verifyingRef.current) {
      return;
    }

    const otpToVerify = otp.trim();
    const submissionKey = `${verificationId}:${otpToVerify}`;

    if (lastSubmittedOtpRef.current === submissionKey) {
      return;
    }

    if (!otpToVerify || otpToVerify.length !== 6) {
      AlertManager.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    verifyingRef.current = true;
    lastSubmittedOtpRef.current = submissionKey;
    setLoading(true);

    // In dev mode, bypass OTP verification
    const devOTP = process.env.EXPO_PUBLIC_DEV_OTP || '123456';
    const isDevVerification = isDevMode || verificationId === 'dev-verification-id';
    
    let result;
    if (isDevVerification && otpToVerify === devOTP) {
      // Dev mode bypass - accept dev OTP with any phone number
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+91' + formattedPhone;
      }
      result = { success: true, phoneNumber: formattedPhone };
    } else {
      // Normal verification
      result = await verifyOTP(verificationId, otpToVerify);
    }

    if (result.success) {
      const verifiedPhone = result.phoneNumber || phoneNumber;
      
      // Save phone number
      await AsyncStorage.setItem('phone_number', verifiedPhone);
      
      // Check if user already has a wallet (returning user after sign out)
      const walletExists = await hasWallet();
      
      if (walletExists) {
        // Returning user - verify phone matches stored wallet
        const storedPhone = await AsyncStorage.getItem('phone_number');
        const walletAddress = await AsyncStorage.getItem('wallet_address');
        
        if (!isDevVerification) {
          if (storedPhone !== verifiedPhone) {
            // Phone number doesn't match - this might be a different account
            AlertManager.alert(
              'Account Mismatch',
              'This phone number is not associated with the wallet on this device. Please use the correct phone number or create a new wallet.',
          [
                {
                  text: 'Try Again',
                  onPress: () => {
                    setStep('phone');
                    resetOtpEntry();
                    setPhoneNumber('');
                  },
                },
              ]
            );
            lastSubmittedOtpRef.current = null;
            setLoading(false);
            verifyingRef.current = false;
            return;
          }
          
          // Verify with database that phone and wallet match
          const { data: userData, error: dbError } = await supabase
            .from('users')
            .select('wallet_address, phone_number')
            .eq('phone_number', verifiedPhone)
            .single();
          
          if (dbError || !userData) {
            console.log('No database record found, using local data');
          } else if (userData.wallet_address !== walletAddress) {
            AlertManager.alert(
              'Account Mismatch',
              'This phone number is associated with a different wallet. Please use the correct phone number.',
              [
                {
                  text: 'Try Again',
                  onPress: () => {
                    setStep('phone');
                    resetOtpEntry();
                    setPhoneNumber('');
                  },
                },
              ]
            );
            lastSubmittedOtpRef.current = null;
            setLoading(false);
            verifyingRef.current = false;
            return;
          }
        } else {
          // Dev mode - skip strict verification
          console.log('Dev verification - skipping remote phone/wallet check');
        }
        
        navigation.replace('Login');
      } else {
        navigation.replace('CreatePIN', {
          phoneNumber: verifiedPhone,
        });
      }
    } else {
      AlertManager.alert('Error', result.error || 'Invalid OTP');
      resetOtpEntry();
    }

    setLoading(false);
    verifyingRef.current = false;
  };

  const handleResendOTP = () => {
    resetOtpEntry();
    setStep('phone');
    setCanResend(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logo}>
                <Ionicons name="phone-portrait-outline" size={isSmallDevice ? 30 : 38} color={COLORS.primary} />
              </View>
              <Text style={styles.title}>
                {step === 'phone' ? 'Enter Phone Number' : 'Verify OTP'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 'phone'
                  ? "We'll send you a verification code"
                  : `Code sent to ${phoneNumber}`}
              </Text>
            </View>

            {/* Rate Limit Indicator */}
            {remainingAttempts <= 3 && step === 'phone' && (
              <View style={styles.rateLimitBanner}>
                <Ionicons
                  name={remainingAttempts === 0 ? 'alert-circle-outline' : 'speedometer-outline'}
                  size={18}
                  color={COLORS.warning}
                />
                <Text style={styles.rateLimitText}>
                  {remainingAttempts === 0
                    ? 'Daily OTP limit reached'
                    : `${remainingAttempts} OTP request${remainingAttempts > 1 ? 's' : ''} remaining today`}
                </Text>
              </View>
            )}

            {/* Development Hint */}
            {isDevMode && (
            <View style={styles.devHint}>
              <Ionicons name="bulb-outline" size={16} color={COLORS.info} />
              <Text style={styles.devHintText}>
                Use {getDevPhoneNumber()} with OTP {getDevOTP()} for testing
              </Text>
            </View>
            )}

        {/* Input Section */}
        {step === 'phone' ? (
          <View style={styles.inputSection}>
            <View style={styles.phoneInputContainer}>
              <Text style={styles.countryCode}>+91</Text>
              <TextInput
                style={styles.phoneInput}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Enter 10-digit mobile number"
                keyboardType="phone-pad"
                maxLength={10}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.button, (loading || remainingAttempts === 0) && styles.buttonDisabled]}
              onPress={handleSendOTP}
              disabled={loading || remainingAttempts === 0}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.card} />
              ) : (
                <Text style={styles.buttonText}>Send OTP</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputSection}>
            <View
              style={styles.otpInputCard}
              accessibilityLabel="Enter verification code"
            >
              <View style={styles.otpVisualLayer} pointerEvents="none">
                <View style={styles.otpContainer}>
                  {OTP_DIGITS.map((index) => {
                    const isActive = !loading && otpFocused && (otp.length === index || (otp.length === 6 && index === 5));
                    const isFilled = Boolean(otp[index]);

                    return (
                      <View
                        key={index}
                        style={[
                          styles.otpBox,
                          isActive && styles.otpBoxFocused,
                          isFilled && styles.otpBoxFilled,
                          loading && styles.otpBoxDisabled,
                        ]}
                      >
                        <Text style={[
                          styles.otpDigit,
                          isFilled && styles.otpDigitFilled,
                        ]}>
                          {otp[index] || ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.otpStatusRow}>
                  <Text style={styles.otpHint}>
                    {loading
                      ? 'Verifying code...'
                      : otp.length === 0
                        ? 'Waiting for 6-digit code'
                        : otp.length < 6
                          ? `${6 - otp.length} digit${6 - otp.length === 1 ? '' : 's'} remaining`
                          : 'Code ready'}
                  </Text>
                  {loading && (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  )}
                </View>
              </View>

              <TextInput
                ref={otpInputRef}
                style={styles.otpNativeInput}
                value={otp}
                onChangeText={handleOtpChange}
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                editable={!loading}
                caretHidden
                showSoftInputOnFocus
                selectionColor="transparent"
                textContentType="oneTimeCode"
                autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                importantForAutofill="yes"
                accessibilityLabel="Verification code"
              />
            </View>

            {/* Dev Mode Hint */}
            {isDevMode && (
              <View style={styles.devHint}>
                <Ionicons name="construct-outline" size={16} color={COLORS.info} />
                <Text style={styles.devHintText}>
                  Dev mode OTP: {process.env.EXPO_PUBLIC_DEV_OTP || '123456'}
                </Text>
              </View>
            )}

            {/* Timer and Resend */}
            <View style={styles.timerContainer}>
              {timer > 0 ? (
                <Text style={styles.timerText}>Resend OTP in {timer}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResendOTP}>
                  <Text style={styles.resendText}>Resend OTP</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.button, (loading || otp.length !== 6) && styles.buttonDisabled]}
              onPress={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.card} />
              ) : (
                <Text style={styles.buttonText}>Verify OTP</Text>
              )}
            </TouchableOpacity>

            {/* Back button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setStep('phone');
                resetOtpEntry();
              }}
            >
              <Text style={styles.backButtonText}>Change Phone Number</Text>
            </TouchableOpacity>
          </View>
        )}

            {/* Security Notice */}
            <View style={styles.securityNotice}>
              <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.textSecondary} style={styles.securityIcon} />
              <Text style={styles.securityText}>
                Your phone number is verified to ensure account security
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
    paddingTop: isSmallDevice ? SPACING.lg : SPACING.xl * 2,
  },
  header: {
    alignItems: 'center',
    marginBottom: isSmallDevice ? SPACING.md : SPACING.xl,
  },
  logo: {
    width: isSmallDevice ? 60 : 80,
    height: isSmallDevice ? 60 : 80,
    borderRadius: isSmallDevice ? 30 : 40,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: isSmallDevice ? FONT_SIZES.xl : FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: isSmallDevice ? FONT_SIZES.sm : FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  rateLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.warningBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
  },
  rateLimitText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.warning,
    textAlign: 'center',
  },
  devHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.infoBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.info,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
  },
  devHintText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.info,
    textAlign: 'center',
  },
  devBanner: {
    backgroundColor: '#FFC107',
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  devText: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: '#000',
  },
  devSubtext: {
    fontSize: FONT_SIZES.sm,
    color: '#000',
    marginTop: SPACING.xs,
  },
  inputSection: {
    marginBottom: SPACING.xl,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  countryCode: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    paddingRight: SPACING.sm,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    marginRight: SPACING.sm,
  },
  phoneInput: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },
  otpInputCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: OTP_CARD_HORIZONTAL_PADDING,
    paddingVertical: isSmallDevice ? SPACING.md : SPACING.lg,
    marginBottom: SPACING.sm,
    minHeight: isSmallDevice ? 110 : 122,
    position: 'relative',
    ...SHADOWS.sm,
  },
  otpVisualLayer: {
    flex: 1,
    justifyContent: 'center',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: OTP_BOX_GAP,
    marginBottom: SPACING.md,
  },
  otpBox: {
    width: OTP_BOX_SIZE,
    height: OTP_BOX_SIZE + 8,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFocused: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: COLORS.primaryLight + '18',
  },
  otpBoxFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '0F',
  },
  otpBoxDisabled: {
    opacity: 0.72,
  },
  otpDigit: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  otpDigitFilled: {
    color: COLORS.primary,
  },
  otpNativeInput: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 1,
    lineHeight: 1,
    padding: 0,
  },
  otpStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  otpHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  timerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  resendText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.card,
  },
  backButton: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '500',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  securityIcon: {
    marginRight: SPACING.sm,
  },
  securityText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    flex: 1,
  },
});
