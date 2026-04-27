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
import { sendLoginEmailOTP, verifyLoginEmailOTP, getRemainingAttempts } from '../services/auth';
import { hasWallet } from '../services/wallet';
import { supabase } from '../services/supabase';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { AlertManager } from '../utils/alert';
import {
  PILOT_ACCESS_REQUIRED,
  PILOT_NOTICE_TEXT,
  PILOT_NOTICE_TITLE,
  isPilotAccessCodeValid,
} from '../utils/pilot';

const FONT_SIZES = TYPOGRAPHY.sizes;
const { width, height } = Dimensions.get('window');
const isSmallDevice = height < 700;
const EMAIL_OTP_LENGTH = 8;
const OTP_DIGITS = Array.from({ length: EMAIL_OTP_LENGTH }, (_, index) => index);
const OTP_BOX_GAP = isSmallDevice ? 4 : 6;
const OTP_CARD_HORIZONTAL_PADDING = isSmallDevice ? SPACING.sm : SPACING.md;
const OTP_BOX_SIZE = Math.min(
  isSmallDevice ? 38 : 42,
  Math.floor((width - SPACING.lg * 2 - OTP_CARD_HORIZONTAL_PADDING * 2 - OTP_BOX_GAP * (EMAIL_OTP_LENGTH - 1)) / EMAIL_OTP_LENGTH)
);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_VERIFIED_KEY = 'email_verified';
const USER_EMAIL_KEY = 'user_email';

type ExistingUserProfile = {
  wallet_address: string;
  display_name?: string | null;
  cpay_id?: string | null;
  profile_photo_url?: string | null;
  phone_number?: string | null;
};

interface PhoneVerificationScreenProps {
  navigation: any;
}

export const PhoneVerificationScreen: React.FC<PhoneVerificationScreenProps> = ({
  navigation,
}) => {
  const [emailAddress, setEmailAddress] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [pilotAccessCode, setPilotAccessCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [otpFocused, setOtpFocused] = useState(false);
  const otpInputRef = useRef<TextInput>(null);
  const verifyingRef = useRef(false);
  const lastSubmittedOtpRef = useRef<string | null>(null);

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
    if (step === 'otp' && otp.length === EMAIL_OTP_LENGTH && !verifyingRef.current) {
      handleVerifyOTP();
    }
  }, [otp, step]);

  const handleOtpChange = (value: string) => {
    const nextOtp = value.replace(/\D/g, '').slice(0, EMAIL_OTP_LENGTH);
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

  const loadExistingUserProfile = async (): Promise<ExistingUserProfile | null> => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      return null;
    }

    const { data, error } = await supabase
      .from('users')
      .select('wallet_address, display_name, cpay_id, profile_photo_url, phone_number')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Existing profile lookup failed:', error);
      return null;
    }

    return data as ExistingUserProfile | null;
  };

  const handleSendOTP = async () => {
    const normalizedEmail = emailAddress.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      AlertManager.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (PILOT_ACCESS_REQUIRED && !isPilotAccessCodeValid(pilotAccessCode)) {
      AlertManager.alert(
        'Pilot Access Required',
        'Enter the invite code shared for this closed pilot.'
      );
      return;
    }

    setLoading(true);
    setEmailAddress(normalizedEmail);

    const result = await sendLoginEmailOTP(normalizedEmail);

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
        AlertManager.alert(
          'Device Limit Reached',
          result.error || "This device reached today's verification-code request limit across all email addresses."
        );
      } else {
        const isRateLimitError = /rate|limit|too many|security purposes|wait|requested/i.test(result.error || '');
        AlertManager.alert(
          isRateLimitError ? 'Email Limit Reached' : 'Error',
          result.error || 'Failed to send verification code'
        );
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

    if (!otpToVerify || otpToVerify.length !== EMAIL_OTP_LENGTH) {
      AlertManager.alert('Error', `Please enter a valid ${EMAIL_OTP_LENGTH}-digit code`);
      return;
    }

    verifyingRef.current = true;
    lastSubmittedOtpRef.current = submissionKey;
    setLoading(true);

    const result = await verifyLoginEmailOTP(verificationId, otpToVerify);

    if (result.success) {
      const verifiedEmail = result.email || emailAddress.trim().toLowerCase();
      await AsyncStorage.multiSet([
        [EMAIL_VERIFIED_KEY, 'true'],
        [USER_EMAIL_KEY, verifiedEmail],
      ]);

      // Check if user already has a wallet (returning user after sign out)
      const walletExists = await hasWallet();

      if (walletExists) {
        navigation.replace('Login');
      } else {
        const existingProfile = await loadExistingUserProfile();

        if (existingProfile?.wallet_address) {
          navigation.replace('RestoreWallet', {
            verifiedEmail,
            walletAddress: existingProfile.wallet_address,
            displayName: existingProfile.display_name || null,
            cpayId: existingProfile.cpay_id || null,
            profilePhotoUrl: existingProfile.profile_photo_url || null,
            phoneNumber: existingProfile.phone_number || null,
          });
          setLoading(false);
          verifyingRef.current = false;
          return;
        }

        navigation.replace('CreatePIN', {
          phoneNumber: '',
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
    setStep('email');
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
                <Ionicons name="mail-outline" size={isSmallDevice ? 30 : 38} color={COLORS.primary} />
              </View>
              <Text style={styles.title}>
                {step === 'email' ? 'Verify with Email' : 'Verify Email Code'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 'email'
                  ? 'Enter your email address'
                  : `Code sent to ${emailAddress}`}
              </Text>
            </View>

            {/* Rate Limit Indicator */}
            {remainingAttempts <= 3 && step === 'email' && (
              <View style={styles.rateLimitBanner}>
                <Ionicons
                  name={remainingAttempts === 0 ? 'alert-circle-outline' : 'speedometer-outline'}
                  size={18}
                  color={COLORS.warning}
                />
                <Text style={styles.rateLimitText}>
                  {remainingAttempts === 0
                    ? 'Daily verification limit reached on this device'
                    : `${remainingAttempts} verification request${remainingAttempts > 1 ? 's' : ''} remaining today on this device`}
                </Text>
              </View>
            )}

        {/* Input Section */}
        {step === 'email' ? (
          <View style={styles.inputSection}>
            <View style={styles.pilotNotice}>
              <Ionicons name="flask-outline" size={18} color={COLORS.info} />
              <View style={styles.pilotNoticeContent}>
                <Text style={styles.pilotNoticeTitle}>{PILOT_NOTICE_TITLE}</Text>
                <Text style={styles.pilotNoticeText}>{PILOT_NOTICE_TEXT}</Text>
              </View>
            </View>

            {PILOT_ACCESS_REQUIRED && (
              <TextInput
                style={styles.pilotCodeInput}
                value={pilotAccessCode}
                onChangeText={setPilotAccessCode}
                placeholder="Pilot invite code"
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            )}

            <View style={styles.emailInputContainer}>
              <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} style={styles.emailInputIcon} />
              <TextInput
                style={styles.emailInput}
                value={emailAddress}
                onChangeText={setEmailAddress}
                placeholder="Enter email address"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                maxLength={254}
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
                <Text style={styles.buttonText}>Send Email Code</Text>
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
                    const isActive = !loading && otpFocused && (otp.length === index || (otp.length === EMAIL_OTP_LENGTH && index === EMAIL_OTP_LENGTH - 1));
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
                        ? `Waiting for ${EMAIL_OTP_LENGTH}-digit code`
                        : otp.length < EMAIL_OTP_LENGTH
                          ? `${EMAIL_OTP_LENGTH - otp.length} digit${EMAIL_OTP_LENGTH - otp.length === 1 ? '' : 's'} remaining`
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
                maxLength={EMAIL_OTP_LENGTH}
                autoFocus
                editable={!loading}
                caretHidden
                showSoftInputOnFocus
                selectionColor="transparent"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                importantForAutofill="yes"
                accessibilityLabel="Verification code"
              />
            </View>

            {/* Timer and Resend */}
            <View style={styles.timerContainer}>
              {timer > 0 ? (
                <Text style={styles.timerText}>Resend code in {timer}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResendOTP}>
                  <Text style={styles.resendText}>Resend code</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.button, (loading || otp.length !== EMAIL_OTP_LENGTH) && styles.buttonDisabled]}
              onPress={handleVerifyOTP}
              disabled={loading || otp.length !== EMAIL_OTP_LENGTH}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.card} />
              ) : (
                <Text style={styles.buttonText}>Verify Code</Text>
              )}
            </TouchableOpacity>

            {/* Back button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setStep('email');
                resetOtpEntry();
              }}
            >
              <Text style={styles.backButtonText}>Change Email</Text>
            </TouchableOpacity>
          </View>
        )}

            {/* Security Notice */}
            <View style={styles.securityNotice}>
              <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.textSecondary} style={styles.securityIcon} />
              <Text style={styles.securityText}>
                Your email code confirms secure account access
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
  inputSection: {
    marginBottom: SPACING.xl,
  },
  pilotNotice: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: COLORS.infoBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.info,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  pilotNoticeContent: {
    flex: 1,
  },
  pilotNoticeTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.info,
    marginBottom: 2,
  },
  pilotNoticeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  pilotCodeInput: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  emailInputContainer: {
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
  emailInputIcon: {
    marginRight: SPACING.sm,
  },
  emailInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
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
