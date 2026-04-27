import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerAsMerchant, uploadMerchantLogo } from '../services/merchant';
import { sendEmailOTP, verifyEmailOTP } from '../services/auth';
import { PINInput } from '../components/PINInput';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AlertManager } from '../utils/alert';

const FONT_SIZES = TYPOGRAPHY.sizes;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MERCHANT_EMAIL_OTP_LENGTH = 8;
const MERCHANT_PHONE_MIN_DIGITS = 10;
const MERCHANT_PHONE_MAX_DIGITS = 15;

const normalizeMerchantPhoneInput = (value: string): string => {
  const hasLeadingPlus = value.trimStart().startsWith('+');
  const digits = value.replace(/\D/g, '').slice(0, MERCHANT_PHONE_MAX_DIGITS);

  return `${hasLeadingPlus ? '+' : ''}${digits}`;
};

interface MerchantRegistrationScreenProps {
  navigation: any;
}

const CATEGORIES = [
  { value: 'food', label: 'Food & Beverage' },
  { value: 'retail', label: 'Retail' },
  { value: 'services', label: 'Services' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'education', label: 'Education' },
  { value: 'health', label: 'Health & Wellness' },
  { value: 'technology', label: 'Technology' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'beauty', label: 'Beauty & Salon' },
  { value: 'other', label: 'Other' },
];

export const MerchantRegistrationScreen: React.FC<
  MerchantRegistrationScreenProps
> = ({ navigation }) => {
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  
  // Email verification states
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailVerificationId, setEmailVerificationId] = useState('');
  const [emailOTP, setEmailOTP] = useState('');
  const [emailOTPError, setEmailOTPError] = useState('');
  const [showEmailOTPModal, setShowEmailOTPModal] = useState(false);
  const [emailOTPLoading, setEmailOTPLoading] = useState(false);
  
  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (emailVerified) {
      setEmailVerified(false);
    }
    setEmailVerificationId('');
    setEmailOTP('');
    setEmailOTPError('');
  };

  const handleEmailOTPChange = (value: string) => {
    setEmailOTP(value);
    if (emailOTPError) {
      setEmailOTPError('');
    }
  };

  const handlePhoneNumberChange = (value: string) => {
    setPhoneNumber(normalizeMerchantPhoneInput(value));
  };

  const handlePickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        AlertManager.alert('Permission Required', 'Please allow access to your photos to select a logo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0]) {
        setLogoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking logo:', error);
      AlertManager.alert('Error', 'Failed to select logo');
    }
  };

  const handleSendEmailOTP = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      AlertManager.alert('Error', 'Please enter your email address first');
      return;
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      AlertManager.alert('Error', 'Please enter a valid email address');
      return;
    }

    setEmailOTPLoading(true);
    setEmail(normalizedEmail);
    setEmailOTP('');
    setEmailOTPError('');
    const result = await sendEmailOTP(normalizedEmail);
    setEmailOTPLoading(false);

    if (result.success && result.verificationId) {
      setEmailVerificationId(result.verificationId);
      setShowEmailOTPModal(true);
    } else {
      AlertManager.alert('Error', result.error || 'Failed to send OTP');
    }
  };

  const handleVerifyEmailOTP = async (code: string = emailOTP) => {
    if (emailOTPLoading) {
      return;
    }

    const otpToVerify = code.replace(/\D/g, '').slice(0, MERCHANT_EMAIL_OTP_LENGTH);
    setEmailOTP(otpToVerify);

    if (otpToVerify.length !== MERCHANT_EMAIL_OTP_LENGTH) {
      setEmailOTPError(`Enter the ${MERCHANT_EMAIL_OTP_LENGTH}-digit code from your email`);
      return;
    }

    setEmailOTPError('');
    setEmailOTPLoading(true);
    const result = await verifyEmailOTP(emailVerificationId, otpToVerify);
    setEmailOTPLoading(false);

    if (result.success) {
      setEmailVerified(true);
      setShowEmailOTPModal(false);
      setEmailOTP('');
      setEmailOTPError('');
    } else {
      setEmailOTPError(result.error || 'Invalid verification code. Check your email and try again.');
    }
  };

  const handleRegister = async () => {
    // Validation
    if (!businessName.trim()) {
      AlertManager.alert('Error', 'Please enter your business name');
      return;
    }

    if (!ownerName.trim()) {
      AlertManager.alert('Error', 'Please enter the owner/contact person name');
      return;
    }

    if (!email.trim()) {
      AlertManager.alert('Error', 'Please enter a business email');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      AlertManager.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!emailVerified) {
      AlertManager.alert('Error', 'Please verify your email address');
      return;
    }

    if (!phoneNumber.trim()) {
      AlertManager.alert('Error', 'Please enter a contact phone number');
      return;
    }

    const normalizedPhone = normalizeMerchantPhoneInput(phoneNumber);
    const phoneDigits = normalizedPhone.replace(/\D/g, '');

    if (phoneDigits.length < MERCHANT_PHONE_MIN_DIGITS || phoneDigits.length > MERCHANT_PHONE_MAX_DIGITS) {
      AlertManager.alert('Error', `Please enter a valid contact phone number (${MERCHANT_PHONE_MIN_DIGITS}-${MERCHANT_PHONE_MAX_DIGITS} digits)`);
      return;
    }

    if (!businessAddress.trim()) {
      AlertManager.alert('Error', 'Please enter your business address');
      return;
    }

    if (!category) {
      AlertManager.alert('Error', 'Please select a business category');
      return;
    }

    if (category === 'other' && !customCategory.trim()) {
      AlertManager.alert('Error', 'Please specify your business category');
      return;
    }

    try {
      setLoading(true);

      // Get wallet address
      const walletAddress = await AsyncStorage.getItem('wallet_address');
      if (!walletAddress) {
        AlertManager.alert('Error', 'Wallet address not found');
        return;
      }

      // Determine final category
      const finalCategory = category === 'other' ? customCategory : category;

      // Upload logo or use default
      let logoUrl: string | undefined;
      if (logoUri) {
        AlertManager.alert('Uploading', 'Uploading your business logo...');
        const uploadedLogoUrl = await uploadMerchantLogo(logoUri, businessName);
        if (!uploadedLogoUrl) {
          AlertManager.alert('Logo Upload Failed', 'Your logo could not be uploaded. Please check the storage policy and try again.');
          return;
        }
        logoUrl = uploadedLogoUrl;
      } else {
        // Use default merchant logo - construct the URL from assets
        // When building the app, this will be bundled with the app
        logoUrl = 'default-merchant-logo';
      }

      // Register as merchant
      const result = await registerAsMerchant({
        business_name: businessName,
        wallet_address: walletAddress,
        description: description || undefined,
        category: finalCategory,
        owner_name: ownerName,
        email: normalizedEmail,
        phone_number: normalizedPhone,
        business_address: businessAddress,
        business_registration_number: businessRegistrationNumber || undefined,
        logo_url: logoUrl,
        is_active: true,
      });

      if (result.success) {
        if (result.contractSynced === false) {
          AlertManager.alert(
            'Merchant Saved',
            'Your merchant profile was saved, but contract sync did not complete. Merchant QR payments may fail until the relayer is configured and synced.'
          );
        }
        // Replace registration screen with dashboard
        // So back button from dashboard goes to Profile, not registration form
        navigation.replace('MerchantDashboard');
      } else {
        AlertManager.alert('Error', result.error || 'Failed to register as merchant');
      }
    } catch (error: any) {
      AlertManager.alert('Error', error.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  const emailOTPComplete = emailOTP.length === MERCHANT_EMAIL_OTP_LENGTH;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header with Back Button */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backButtonTop}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Merchant Registration</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="storefront-outline" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Become a Merchant</Text>
          <Text style={styles.subtitle}>
            Fill in your business details to start accepting payments
          </Text>
        </View>

        <View style={styles.form}>
          {/* Business Logo */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Business Logo (Optional)</Text>
            <View style={styles.logoContainer}>
              <TouchableOpacity style={styles.logoButton} onPress={handlePickLogo}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoPreview} />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons name="image-outline" size={40} color={COLORS.textSecondary} />
                    <Text style={styles.logoPlaceholderText}>Add Logo</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.logoHint}>
                {logoUri ? 'Tap to change logo' : 'Recommended: Square image, 512x512px or larger'}
              </Text>
            </View>
          </View>

          {/* Business Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Business Name *</Text>
            <TextInput
              style={styles.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g., Joe's Coffee Shop"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          {/* Owner/Contact Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Owner/Contact Person *</Text>
            <TextInput
              style={styles.input}
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="Full name of owner or manager"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Business Email *</Text>
            <View style={styles.inputWithButton}>
              <TextInput
                style={[styles.input, styles.inputWithVerify]}
                value={email}
                onChangeText={handleEmailChange}
                placeholder="contact@yourbusiness.com"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!emailVerified}
              />
              {emailVerified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.verifyButton, emailOTPLoading && styles.buttonDisabled]}
                  onPress={handleSendEmailOTP}
                  disabled={emailOTPLoading}
                >
                  {emailOTPLoading ? (
                    <ActivityIndicator size="small" color={COLORS.card} />
                  ) : (
                    <Text style={styles.verifyButtonText}>Send code</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Phone Number */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Phone Number *</Text>
            <View style={styles.inputWithButton}>
              <TextInput
                style={[styles.input, styles.inputWithVerify]}
                value={phoneNumber}
                onChangeText={handlePhoneNumberChange}
                placeholder="+1234567890"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="phone-pad"
                maxLength={MERCHANT_PHONE_MAX_DIGITS + 1}
              />
            </View>
          </View>

          {/* Business Address */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Business Address *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={businessAddress}
              onChangeText={setBusinessAddress}
              placeholder="Street address, City, State, ZIP"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Business Registration Number (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Business Registration Number (Optional)</Text>
            <TextInput
              style={styles.input}
              value={businessRegistrationNumber}
              onChangeText={setBusinessRegistrationNumber}
              placeholder="Tax ID or Business License Number"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          {/* Category Dropdown */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Business Category *</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setShowCategoryDropdown(true)}
            >
              <Text style={[styles.dropdownText, !category && styles.dropdownPlaceholder]}>
                {category
                  ? CATEGORIES.find(c => c.value === category)?.label || customCategory
                  : 'Select a category'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Custom Category Input (if "Other" selected) */}
          {category === 'other' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Specify Your Category *</Text>
              <TextInput
                style={styles.input}
                value={customCategory}
                onChangeText={setCustomCategory}
                placeholder="e.g., Pet Services, Agriculture, etc."
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          )}

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Business Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell customers about your business and services..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={3}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.card} />
            ) : (
              <Text style={styles.buttonText}>Register as Merchant</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Category Dropdown Modal */}
      <Modal
        visible={showCategoryDropdown}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCategoryDropdown(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCategoryDropdown(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryDropdown(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.categoryList}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.categoryOption,
                    category === cat.value && styles.categoryOptionSelected,
                  ]}
                  onPress={() => {
                    setCategory(cat.value);
                    if (cat.value !== 'other') {
                      setCustomCategory('');
                    }
                    setShowCategoryDropdown(false);
                  }}
                >
                  <Text style={styles.categoryOptionText}>{cat.label}</Text>
                  {category === cat.value && (
                    <Ionicons name="checkmark" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Email OTP Modal */}
      <Modal
        visible={showEmailOTPModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEmailOTPModal(false)}
      >
        <View style={styles.otpModalOverlay}>
          <View style={styles.otpModalContent}>
            <View style={styles.otpModalHeader}>
              <Text style={styles.otpModalTitle}>Verify Email</Text>
              <TouchableOpacity onPress={() => {
                setShowEmailOTPModal(false);
                setEmailOTP('');
                setEmailOTPError('');
              }}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.otpModalSubtitle}>
              Enter the {MERCHANT_EMAIL_OTP_LENGTH}-digit code sent to {email}
            </Text>
            <PINInput
              value={emailOTP}
              onChange={handleEmailOTPChange}
              onComplete={handleVerifyEmailOTP}
              length={MERCHANT_EMAIL_OTP_LENGTH}
              autoFocus
              disabled={emailOTPLoading}
              secure={false}
              accessibilityLabel="Email verification code"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
            />
            {emailOTPError ? (
              <View style={styles.otpErrorRow}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.otpErrorText}>{emailOTPError}</Text>
              </View>
            ) : (
              <Text style={styles.otpHelperText}>
                The code verifies automatically when all {MERCHANT_EMAIL_OTP_LENGTH} digits are entered.
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.otpVerifyButton,
                (emailOTPLoading || !emailOTPComplete) && styles.buttonDisabled,
              ]}
              onPress={() => handleVerifyEmailOTP()}
              disabled={emailOTPLoading || !emailOTPComplete}
            >
              {emailOTPLoading ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator color={COLORS.card} size="small" />
                  <Text style={styles.buttonText}>Checking code...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>
                  {emailOTPComplete ? 'Verify Email' : `Enter ${MERCHANT_EMAIL_OTP_LENGTH} digits`}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resendButton, emailOTPLoading && styles.buttonDisabled]}
              onPress={handleSendEmailOTP}
              disabled={emailOTPLoading}
            >
              <Text style={styles.resendButtonText}>Resend Code</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl * 2,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButtonTop: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  headerIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  form: {
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  dropdown: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    flex: 1,
  },
  dropdownPlaceholder: {
    color: COLORS.textSecondary,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.card,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  categoryList: {
    maxHeight: 400,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  categoryOptionSelected: {
    backgroundColor: COLORS.primary + '10',
  },
  categoryOptionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    flex: 1,
  },
  logoContainer: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  logoButton: {
    width: 150,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  logoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  logoPlaceholderText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  logoHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  inputWithButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inputWithVerify: {
    flex: 1,
  },
  verifyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    minWidth: 92,
    alignItems: 'center',
  },
  verifyButtonText: {
    color: COLORS.card,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.successBg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  verifiedText: {
    color: COLORS.success,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  otpModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  otpModalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
  },
  otpModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  otpModalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
  },
  otpModalSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  otpHelperText: {
    minHeight: 22,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  otpErrorRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  otpErrorText: {
    flexShrink: 1,
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  otpVerifyButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  resendButton: {
    padding: SPACING.sm,
    alignItems: 'center',
  },
  resendButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
});
