import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { getBalance, isValidAccountId, transferTokens } from '../services/blockchain';
import { saveTransaction, getUserDisplayName, generateTransactionId } from '../services/storage';
import { getAuthenticatedWallet } from '../utils/biometric';
import { formatWalletFingerprint, getCPayIdByWallet, isValidCPayId, getWalletAddressFromCPayId } from '../utils/cpayId';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { Button, LoadingSpinner } from '../components';
import { AlertManager } from '../utils/alert';
import { MONEY_SYMBOL, MONEY_UNIT_LABEL, formatMoneyAmount } from '../utils/currency';
import { PILOT_TESTNET_TEXT } from '../utils/pilot';

interface SendMoneyScreenProps {
  navigation: any;
  route?: any;
}

export const SendMoneyScreen: React.FC<SendMoneyScreenProps> = ({ navigation, route }) => {
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [recipientInput, setRecipientInput] = useState<string>(''); // Store original input (C-Pay ID or wallet)
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientCPayId, setRecipientCPayId] = useState<string>('');
  const [amount, setAmount] = useState<string>(''); // User enters pilot credit amount.
  const [note, setNote] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<string>('0');
  const [hideBalance, setHideBalance] = useState<boolean>(false);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [isMerchantPayment, setIsMerchantPayment] = useState<boolean>(false);
  const [isFromQR, setIsFromQR] = useState<boolean>(false);
  const [hasPresetAmount, setHasPresetAmount] = useState<boolean>(false);
  const [fetchingRecipient, setFetchingRecipient] = useState<boolean>(false);
  const [recipientFetched, setRecipientFetched] = useState<boolean>(false);
  const paymentInProgress = useRef<boolean>(false);
  const networkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadWalletData();
    
    // If coming from QR scan or deep link
    if (route?.params?.recipientAddress) {
      setRecipientAddress(route.params.recipientAddress);
    }
    if (route?.params?.recipientName) {
      setRecipientName(route.params.recipientName);
    }
    if (route?.params?.amount && parseFloat(route.params.amount) > 0) {
      // Amount is already in the user-visible credit unit.
      setAmount(parseFloat(route.params.amount).toFixed(2));
      setHasPresetAmount(true);
    }
    if (route?.params?.note) {
      setNote(route.params.note);
    }
    if (route?.params?.hideBalance === true) {
      setHideBalance(true);
    }
    // Check if this is a merchant payment
    if (route?.params?.merchantId) {
      setMerchantId(route.params.merchantId);
    }
    // Check payment type flags
    if (route?.params?.isMerchantPayment) {
      setIsMerchantPayment(true);
    }
    if (route?.params?.isFromQR) {
      setIsFromQR(true);
    }
  }, [route?.params]);

  // Handle back button during payment
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paymentInProgress.current) {
        AlertManager.alert(
          'Transaction Cancelled',
          'Payment was interrupted. If the transaction was submitted, it may still complete.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return true; // Prevent default back behavior
      }
      return false; // Allow default back behavior
    });

    return () => {
      backHandler.remove();
      if (networkTimeoutRef.current) {
        clearTimeout(networkTimeoutRef.current);
      }
    };
  }, []);

  const loadWalletData = async () => {
    try {
      const address = await AsyncStorage.getItem('wallet_address');
      if (address) {
        setWalletAddress(address);
        await loadBalance(address);
      }
    } catch (error) {
      console.error('Error loading wallet:', error);
    }
  };

  const loadBalance = async (address: string) => {
    try {
      const formatted = await getBalance(address);
      setBalance(parseFloat(formatted).toFixed(2));
    } catch (error) {
      console.error('Error loading balance:', error);
      setBalance('0.00');
    }
  };

  // Fetch recipient name when address is entered
  const fetchRecipientName = async (address: string) => {
    if (!address || !isValidAccountId(address)) {
      setRecipientName('');
      setRecipientCPayId('');
      setRecipientFetched(false);
      return;
    }

    // Don't fetch if same as user's wallet
    if (address === walletAddress) {
      setRecipientName('');
      setRecipientCPayId('');
      setRecipientFetched(false);
      return;
    }

    setFetchingRecipient(true);
    try {
      // Fetch both name and C-Pay ID
      const [name, cpayId] = await Promise.all([
        getUserDisplayName(address),
        getCPayIdByWallet(address)
      ]);
      
      if (name) {
        setRecipientName(name);
        setRecipientCPayId(cpayId || formatWalletFingerprint(address));
        setRecipientFetched(true);
      } else {
        setRecipientName('');
        setRecipientCPayId(formatWalletFingerprint(address));
        setRecipientFetched(false);
      }
    } catch (error) {
      console.log('Error fetching recipient name:', error);
      setRecipientName('');
      setRecipientCPayId('');
      setRecipientFetched(false);
    } finally {
      setFetchingRecipient(false);
    }
  };

  // Handle address input change - auto-fetch when valid address or C-Pay ID is entered
  const handleAddressChange = async (input: string) => {
    setRecipientInput(input);
    
    // Clear previous recipient info when address changes
    if (!isFromQR) {
      setRecipientAddress('');
      setRecipientName('');
      setRecipientCPayId('');
      setRecipientFetched(false);
    }
    
    // Check if input is a valid C-Pay ID
    if (!isFromQR && isValidCPayId(input.trim())) {
      setFetchingRecipient(true);
      try {
        // Look up wallet address from C-Pay ID
        const walletAddr = await getWalletAddressFromCPayId(input.trim());
        if (walletAddr) {
          setRecipientAddress(walletAddr);
          // Fetch name and C-Pay ID
          await fetchRecipientName(walletAddr);
        } else {
          setRecipientAddress('');
          setRecipientName('');
          setRecipientCPayId('');
          setRecipientFetched(false);
        }
      } catch (error) {
        console.error('Error looking up C-Pay ID:', error);
      } finally {
        setFetchingRecipient(false);
      }
      return;
    }
    
    // Otherwise treat as wallet address
    setRecipientAddress(input);
    
    if (!isFromQR && isValidAccountId(input)) {
      fetchRecipientName(input);
    }
  };

  const validateInputs = (): boolean => {
    if (!recipientInput.trim() && !recipientAddress.trim()) {
      AlertManager.alert('Invalid C-Pay ID', 'Please enter a recipient C-Pay ID');
      return false;
    }

    // If recipient address is not set yet (C-Pay ID lookup failed or in progress)
    if (!recipientAddress.trim()) {
      AlertManager.alert('Invalid C-Pay ID', 'Could not find an account for the entered C-Pay ID');
      return false;
    }

    if (!isValidAccountId(recipientAddress.trim())) {
      AlertManager.alert('Invalid C-Pay ID', 'Please enter a valid C-Pay ID');
      return false;
    }

    if (recipientAddress.trim() === walletAddress) {
      AlertManager.alert('Invalid Recipient', 'You cannot send pilot credits to yourself');
      return false;
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      AlertManager.alert('Invalid Amount', 'Please enter a valid amount');
      return false;
    }

    const balanceNum = parseFloat(balance);
    if (amountNum > balanceNum) {
      AlertManager.alert('Insufficient Balance', `You only have ${formatMoneyAmount(parseFloat(balance))}`);
      return false;
    }

    return true;
  };

  const handleSendMoney = async () => {
    if (!validateInputs()) return;

    const displayId = recipientCPayId || formatWalletFingerprint(recipientAddress);

    AlertManager.alert(
      'Confirm Payment',
      `Send ${formatMoneyAmount(parseFloat(amount))} to\n${displayId}${note ? `\n\nNote: ${note}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              paymentInProgress.current = true;

              // Set timeout for slow network detection (5 seconds)
              networkTimeoutRef.current = setTimeout(() => {
                if (paymentInProgress.current) {
                  AlertManager.alert(
                    'Slow Network Detected',
                    'Your network connection is slow. The payment is still processing...',
                    [{ text: 'OK' }]
                  );
                }
              }, 10000);

              const wallet = await getAuthenticatedWallet(
                'Confirm Payment',
                'Enter your 6-digit PIN to send pilot credits',
                'Unlock wallet to send pilot credits'
              );
              if (!wallet) {
                paymentInProgress.current = false;
                if (networkTimeoutRef.current) clearTimeout(networkTimeoutRef.current);
                AlertManager.alert('Authentication Failed', 'Transaction cancelled');
                return;
              }

              // Navigate to Processing screen immediately
              const startTime = Date.now();
              
              // Generate transaction ID upfront
              const transactionId = generateTransactionId();
              
              navigation.replace('PaymentProcessing', {
                transactionId: transactionId,
                amount: amount,
                recipientName: recipientName || displayId,
                recipientAddress: recipientAddress.trim(),
              });

              const txHash = await transferTokens(
                wallet,
                recipientAddress.trim(),
                amount
              );

              // Clear timeout on success
              if (networkTimeoutRef.current) clearTimeout(networkTimeoutRef.current);
              paymentInProgress.current = false;

              // Calculate processing time
              const processingTime = Math.round((Date.now() - startTime) / 1000);

              // Save transaction locally and sync to Supabase
              // Get sender's name from AsyncStorage
              const senderName = await AsyncStorage.getItem('user_name');
              
              const transactionData = {
                transaction_id: transactionId,
                tx_hash: txHash,
                to_address: recipientAddress.trim(),
                from_address: walletAddress,
                amount: amount,
                status: 'pending' as const,
                // For merchant payments: merchant_name is business name, recipient_name is same
                // For personal payments: recipient_name is the person's name (if available)
                merchant_name: merchantId ? recipientName : undefined,
                recipient_name: recipientName || undefined,
                sender_name: senderName || undefined,
                note: note || undefined, // Separate note field
                created_at: new Date().toISOString(),
                transaction_type: merchantId ? 'merchant' as const : 'personal' as const,
                merchant_id: merchantId || undefined,
              };
              
              saveTransaction(transactionData)
                .then(() => console.log('✅ Transaction saved and synced'))
                .catch(err => console.error('❌ Transaction save/sync error:', err));

              // Navigate to Success screen
              navigation.replace('PaymentSuccess', {
                transactionId: transactionId,
                transactionHash: txHash,
                fromAddress: walletAddress,
                amount: amount,
                recipientName: recipientName || displayId,
                recipientAddress: recipientAddress.trim(),
                processingTime: processingTime || 2,
                timestamp: new Date().toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                }),
                note: note || undefined,
                isMerchantPayment: !!merchantId,
              });
            } catch (error: any) {
              paymentInProgress.current = false;
              if (networkTimeoutRef.current) clearTimeout(networkTimeoutRef.current);
              console.error('Send pilot credits error:', error);
              
              // Map error to user-friendly message
              let failureReason = 'Payment failed. Please try again.';
              let errorMessage = 'Transaction Failed';
              
              if (error.message?.includes('timeout') || error.message?.includes('slow')) {
                failureReason = 'Transaction timed out after 1 minute. Your pilot credits are safe - no amount was deducted. The network is experiencing delays. Please try again.';
                errorMessage = 'Network Timeout';
              } else if (error.message?.includes('insufficient funds') || error.message?.includes('Insufficient')) {
                failureReason = 'You don\'t have enough balance to complete this transaction.';
                errorMessage = 'Insufficient Balance';
              } else if (error.message?.includes('fee')) {
                failureReason = 'The payment network is temporarily unavailable. Please try again later.';
                errorMessage = 'Network Issue';
              } else if (error.message?.includes('network') || error.message?.includes('Failed to fetch')) {
                failureReason = 'Unable to connect to the Stellar network. Check your internet connection.';
                errorMessage = 'Network Connection Failed';
              } else if (error.message?.includes('temporarily unavailable')) {
                failureReason = 'Payment service is temporarily unavailable. Your pilot credits are safe. Please try again in a few moments.';
                errorMessage = 'Service Unavailable';
              } else {
                failureReason = error.message + ' Your pilot credits are safe - no amount was deducted.';
              }
              
              // Navigate to Failure screen
              navigation.replace('PaymentFailure', {
                amount: amount,
                recipientName: recipientName || displayId,
                recipientAddress: recipientAddress.trim(),
                errorMessage,
                errorReason: failureReason,
                timestamp: new Date().toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                }),
              });
            }
          },
        },
      ]
    );
  };

  const handlePasteAddress = async () => {
    try {
      const { default: Clipboard } = await import('expo-clipboard');
      const text = await Clipboard.getStringAsync();
      if (text && isValidAccountId(text.trim())) {
        const address = text.trim();
        setRecipientAddress(address);
        setRecipientInput(address);
        fetchRecipientName(address);
      } else {
        AlertManager.alert('Invalid Address', 'Clipboard does not contain a valid address');
      }
    } catch (error) {
      AlertManager.alert('Error', 'Failed to paste from clipboard');
    }
  };

  const handleBackPress = () => {
    if (paymentInProgress.current) {
      AlertManager.alert(
        'Transaction Cancelled',
        'Payment was interrupted. If the transaction was submitted, it may still complete.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } else {
      navigation.goBack();
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen text="Processing payment..." />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Pilot Credits</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Balance Card - Hidden when scanned from other places */}
        {!hideBalance && (
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available Credits</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceCurrency}>{MONEY_SYMBOL}</Text>
              <Text style={styles.balanceAmount}>{parseFloat(balance).toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Recipient Info Card - Show when from QR scan OR when name is fetched */}
        {((isFromQR && recipientName) || recipientFetched) && (
          <View style={styles.recipientCard}>
            <View style={styles.recipientCardHeader}>
              <Ionicons
                name={isMerchantPayment ? 'storefront-outline' : 'person-outline'}
                size={23}
                color={COLORS.primary}
                style={styles.recipientCardIcon}
              />
              <Text style={styles.recipientCardTitle}>
                {isMerchantPayment ? 'Paying Merchant' : 'Sending To'}
              </Text>
            </View>
            <View style={styles.recipientCardContent}>
              <Text style={styles.recipientCardName}>{recipientName}</Text>
              <Text style={styles.recipientCardAddress} numberOfLines={1}>
                {recipientCPayId || formatWalletFingerprint(recipientAddress)}
              </Text>
            </View>
          </View>
        )}

        {/* Recipient Address Input - Hide when recipient is fetched or from QR */}
        {!isFromQR && !recipientFetched && (
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Recipient C-Pay ID</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="9876543210@cpayk8f3qz"
                placeholderTextColor={COLORS.textTertiary}
                value={recipientInput}
                onChangeText={handleAddressChange}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.inputButton} onPress={handlePasteAddress}>
                <Ionicons name="clipboard-outline" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            {fetchingRecipient && (
              <Text style={styles.fetchingText}>Looking up recipient...</Text>
            )}
          </View>
        )}

        {/* Change Recipient Button - Show when recipient is fetched (not from QR) */}
        {!isFromQR && recipientFetched && (
          <TouchableOpacity 
            style={styles.changeRecipientButton}
            onPress={() => {
              setRecipientInput('');
              setRecipientAddress('');
              setRecipientName('');
              setRecipientCPayId('');
              setRecipientFetched(false);
            }}
          >
            <Text style={styles.changeRecipientText}>Change Recipient</Text>
          </TouchableOpacity>
        )}

        {/* Amount Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Amount</Text>
          <View style={styles.amountInputContainer}>
            <Text style={styles.currencySymbol}>{MONEY_SYMBOL}</Text>
            <TextInput
              style={[styles.amountInput, hasPresetAmount && styles.inputDisabled]}
              placeholder="0.00"
              placeholderTextColor={COLORS.textTertiary}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!hasPresetAmount}
            />
            <Text style={styles.currencyLabel}>{MONEY_UNIT_LABEL}</Text>
          </View>
          {/* Quick Amount Buttons - Hide when amount is preset from QR */}
          {!hasPresetAmount && (
            <View style={styles.quickAmountContainer}>
              {['10', '50', '100', '500'].map((quickAmount) => (
                <TouchableOpacity
                  key={quickAmount}
                  style={styles.quickAmountButton}
                  onPress={() => setAmount(quickAmount)}
                >
                  <Text style={styles.quickAmountText}>{MONEY_SYMBOL} {quickAmount}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Note Input (Optional) */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Add Note (Optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g., Lunch payment, Rent, etc."
            placeholderTextColor={COLORS.textTertiary}
            value={note}
            onChangeText={setNote}
            maxLength={50}
          />
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!recipientAddress || !amount || parseFloat(amount) <= 0) && styles.sendButtonDisabled,
          ]}
          onPress={handleSendMoney}
          disabled={!recipientAddress || !amount || parseFloat(amount) <= 0}
          activeOpacity={0.8}
        >
          <View style={styles.sendButtonContent}>
            <Ionicons name="send-outline" size={22} color={COLORS.textInverse} style={styles.sendButtonEmoji} />
            <Text style={styles.sendButtonText}>
              {amount && parseFloat(amount) > 0
                ? `Send ${formatMoneyAmount(parseFloat(amount))}`
                : 'Enter Amount to Send'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.info} style={styles.infoIcon} />
          <Text style={styles.infoText}>
            {PILOT_TESTNET_TEXT} Payments typically confirm in 5-10 seconds.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 50 : SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.text,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
  },
  placeholder: {
    width: 40,
  },
  balanceCard: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    ...SHADOWS.md,
  },
  balanceLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textInverse,
    opacity: 0.8,
    marginBottom: SPACING.xs,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.textInverse,
    marginRight: SPACING.sm,
  },
  balanceCurrency: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textInverse,
    opacity: 0.9,
    fontWeight: '600',
  },
  balanceUsd: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textInverse,
    opacity: 0.7,
    marginTop: SPACING.xs,
  },
  recipientCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.md,
  },
  recipientCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  recipientCardIcon: {
    marginRight: SPACING.sm,
  },
  recipientCardTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recipientCardContent: {
    marginLeft: 36,
  },
  recipientCardName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  recipientCardAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  fetchingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },
  changeRecipientButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.lg,
  },
  changeRecipientText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  inputSection: {
    marginBottom: SPACING.xl,
  },
  inputLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  inputDisabled: {
    backgroundColor: COLORS.background,
    color: COLORS.textSecondary,
  },
  recipientNameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
  },
  recipientNameIcon: {
    fontSize: 14,
    marginRight: SPACING.xs,
  },
  recipientNameText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    padding: SPACING.md,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  inputButton: {
    padding: SPACING.md,
  },
  inputButtonText: {
    fontSize: 20,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight + '20',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  scanButtonIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  scanButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  currencySymbol: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginRight: SPACING.xs,
  },
  amountInput: {
    flex: 1,
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },
  currencyLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  conversionInfo: {
    backgroundColor: COLORS.successBg,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.sm,
    alignSelf: 'flex-start',
  },
  conversionText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  quickAmountContainer: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    marginHorizontal: -SPACING.xs,
  },
  quickAmountButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginHorizontal: SPACING.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickAmountText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  noteInput: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
    ...SHADOWS.sm,
    elevation: 2,
  },
  sendButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonEmoji: {
    marginRight: SPACING.sm,
  },
  sendButtonText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.textInverse,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.infoBg,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  infoIcon: {
    marginRight: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});
