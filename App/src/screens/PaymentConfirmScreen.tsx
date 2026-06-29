import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { PaymentQRData } from '../utils/qrCode';
import { getAuthenticatedWallet } from '../utils/biometric';
import { sendPayment } from '../services/blockchain';
import { saveTransaction } from '../services/storage';
import { monitorTransaction } from '../services/transactionMonitor';
import { getMerchantById, getMerchantByAddress } from '../services/merchant';
import { checkTransactionLimit, recordTransaction, checkRateLimit, recordAction } from '../services/securityLimits';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { Button, Card, Screen, Header, BottomActionBar, InfoBanner } from '../components';
import { AlertManager } from '../utils/alert';
import { MONEY_UNIT_LABEL, formatMoneyNumber } from '../utils/currency';
import { PILOT_NOTICE_TEXT } from '../utils/pilot';
import { getPaymentFailureCopy } from '../utils/paymentFailure';

interface PaymentConfirmScreenProps {
  navigation: any;
  route: {
    params: {
      paymentData: PaymentQRData;
      merchantDetails?: {
        business_name: string;
        category?: string;
        description?: string;
      };
    };
  };
}

export const PaymentConfirmScreen: React.FC<PaymentConfirmScreenProps> = ({
  navigation,
  route,
}) => {
  const { paymentData, merchantDetails } = route.params;
  const [loading, setLoading] = useState(false);
  const [merchantInfo, setMerchantInfo] = useState<{
    id?: string;
    business_name: string;
    category?: string;
    description?: string;
  } | null>(merchantDetails || null);

  // Fetch merchant details if not provided
  useEffect(() => {
    const loadMerchantDetails = async () => {
      if (merchantDetails) return; // Already have details

      try {
        // Merchant contract payments must come from an explicit merchant QR.
        let merchant = null;
        
        // First try by merchantId if available
        if (paymentData.merchantId) {
          merchant = await getMerchantById(paymentData.merchantId);
        }
        
        // Fallback to address lookup only for explicit merchant QRs.
        if (!merchant && paymentData.merchantId && paymentData.merchant) {
          merchant = await getMerchantByAddress(paymentData.merchant);
        }

        if (merchant) {
          setMerchantInfo({
            id: merchant.id,
            business_name: merchant.business_name,
            category: merchant.category,
            description: merchant.description,
          });
        }
      } catch (error) {
        console.error('Error loading merchant details:', error);
      }
    };

    loadMerchantDetails();
  }, [paymentData, merchantDetails]);

  const pollTransactionStatus = async (txHash: string, paymentData: PaymentQRData) => {
    try {
      console.log('🔄 Starting background transaction monitoring:', txHash);
      
      // Use the new transaction monitor service
      // It will automatically update Supabase when status changes
      // This triggers real-time updates in TransactionHistoryScreen!
      await monitorTransaction(txHash);
      
      console.log('✅ Transaction monitoring complete');
    } catch (error) {
      console.error('Error monitoring transaction:', error);
    }
  };

  const handleConfirmPayment = async () => {
    try {
      // Phase 4: Check rate limiting
      const rateLimitCheck = await checkRateLimit('payment');
      if (!rateLimitCheck.allowed) {
        AlertManager.alert(
          'Too Many Requests',
          'Please wait a moment before trying again.'
        );
        return;
      }
      await recordAction('payment');

      // Phase 4: Check transaction limits
      const limitCheck = await checkTransactionLimit(paymentData.amount);
      
      if (!limitCheck.allowed) {
        AlertManager.alert(
          'Transaction Limit Exceeded',
          limitCheck.reason || 'This transaction exceeds your daily limits.'
        );
        return;
      }

      // Show loading during authentication
      setLoading(true);
      
      const wallet = await getAuthenticatedWallet(
        'Confirm Payment',
        'Enter your 6-digit PIN to confirm payment',
        'Unlock wallet to confirm payment'
      );

      if (!wallet) {
        AlertManager.alert('Authentication Failed', 'Payment cancelled');
        setLoading(false);
        return;
      }

      let resolvedMerchantInfo = merchantInfo;
      if (!resolvedMerchantInfo && paymentData.merchantId && paymentData.merchant) {
        const merchant = paymentData.merchantId
          ? await getMerchantById(paymentData.merchantId)
          : await getMerchantByAddress(paymentData.merchant);

        if (merchant) {
          resolvedMerchantInfo = {
            id: merchant.id,
            business_name: merchant.business_name,
            category: merchant.category,
            description: merchant.description,
          };
          setMerchantInfo(resolvedMerchantInfo);
        }
      }

      // Get merchant/recipient name
      const merchantOrRecipientName = resolvedMerchantInfo?.business_name || paymentData.name || 'Unknown';
      const isMerchantPayment = !!paymentData.merchantId;
      
      // Navigate to Processing screen immediately after authentication
      setLoading(false);
      navigation.replace('PaymentProcessing', {
        amount: paymentData.amount,
        recipientName: merchantOrRecipientName,
        recipientAddress: paymentData.merchant,
      });

      // Phase 2: Execute Stellar payment with timeout
      const submittedAt = new Date().toISOString();
      const startTime = Date.now();

      const merchantId = paymentData.merchantId || null;

      // Get sender's name from AsyncStorage
      const senderName = await AsyncStorage.getItem('user_name');

      // Step 3: Execute blockchain transaction in the background
      void (async () => {
        try {
          // Send payment transaction with built-in 30s timeout
          const txHash = await sendPayment(
            wallet,
            paymentData.merchant,
            paymentData.amount,
            {
              merchantId,
              note: paymentData.note,
            }
          );

          console.log('✅ Transaction submitted to Stellar:', txHash);

          // Calculate processing time
          const processingTime = Math.round((Date.now() - startTime) / 1000);

          // Phase 4: Record successful transaction for limit tracking
          await recordTransaction(paymentData.amount);

          // Store the Stellar transaction hash as the receipt identifier.
          await saveTransaction({
            tx_hash: txHash,
            to_address: paymentData.merchant,
            from_address: wallet.address,
            amount: paymentData.amount,
            status: 'pending',
            internal_status: 'submitted',
            user_visible_status: 'success',
            merchant_name: isMerchantPayment ? merchantOrRecipientName : undefined,
            recipient_name: merchantOrRecipientName,
            sender_name: senderName || undefined,
            note: paymentData.note || undefined,
            transaction_type: isMerchantPayment ? 'merchant' : 'personal',
            merchant_id: merchantId || undefined,
            submitted_at: submittedAt,
          });

          // Navigate to Success screen
          navigation.replace('PaymentSuccess', {
            transactionHash: txHash,
            fromAddress: wallet.address,
            amount: paymentData.amount,
            recipientName: merchantOrRecipientName,
            recipientAddress: paymentData.merchant,
            processingTime,
            timestamp: new Date().toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }),
            note: paymentData.note,
            isMerchantPayment,
          });

          // Start background monitoring for confirmation
          pollTransactionStatus(txHash, paymentData);

        } catch (backgroundError: any) {
          console.error('❌ Background payment error:', backgroundError);

          const { errorMessage, errorReason, errorCode } = getPaymentFailureCopy(backgroundError);

          // Navigate to Failure screen
          navigation.replace('PaymentFailure', {
            amount: paymentData.amount,
            recipientName: merchantOrRecipientName,
            recipientAddress: paymentData.merchant,
            errorMessage,
            errorReason,
            errorCode,
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
      })();

    } catch (error: any) {
      console.error('Payment error:', error);
      setLoading(false);

      if (error.message?.includes('Authentication Failed')) {
        // User cancelled biometric - no need to show error
        return;
      }

      const { errorMessage, errorReason, errorCode } = getPaymentFailureCopy(error);
      AlertManager.alert(
        errorMessage,
        errorCode ? `${errorReason}\n\nCode: ${errorCode}` : errorReason,
        undefined,
        { type: 'error' }
      );
    }
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  return (
    <Screen
      header={<Header title="Confirm Payment" centerTitle onBack={handleCancel} />}
      footer={
        <BottomActionBar row>
          <Button
            title="Cancel"
            onPress={handleCancel}
            variant="outline"
            disabled={loading}
            size="lg"
            style={styles.flexBtn}
          />
          <Button
            title="Pay Now"
            onPress={handleConfirmPayment}
            variant="primary"
            loading={loading}
            disabled={loading}
            size="lg"
            style={styles.flexBtn}
          />
        </BottomActionBar>
      }
    >
      {/* Payment Details Card */}
      <Card variant="elevated" style={styles.card}>
        <View style={styles.merchantSection}>
          <Text style={styles.merchantLabel}>Pay to</Text>
          <Text style={styles.merchantName}>
            {merchantInfo?.business_name || paymentData.name}
          </Text>
          {merchantInfo?.category && (
            <Text style={styles.merchantCategory}>
              {merchantInfo.category}
            </Text>
          )}
          {merchantInfo?.description && (
            <Text style={styles.merchantDescription}>
              {merchantInfo.description}
            </Text>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>Amount</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.amountValue}>{formatMoneyNumber(parseFloat(paymentData.amount))}</Text>
            <Text style={styles.amountCurrency}>{MONEY_UNIT_LABEL}</Text>
          </View>
        </View>

        {paymentData.note && (
          <>
            <View style={styles.divider} />
            <View style={styles.noteSection}>
              <Text style={styles.noteLabel}>Note</Text>
              <Text style={styles.noteText}>{paymentData.note}</Text>
            </View>
          </>
        )}
      </Card>

      {/* Security Notice */}
      <InfoBanner
        variant="info"
        icon="shield-checkmark-outline"
        message={`PIN or biometric authentication required. ${PILOT_NOTICE_TEXT}`}
        style={styles.securityBanner}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  flexBtn: {
    flex: 1,
  },
  securityBanner: {
    marginTop: SPACING.lg,
  },
  card: {
    padding: SPACING.xl,
  },
  merchantSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  merchantLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    fontWeight: '500',
  },
  merchantName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  merchantAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  merchantCategory: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontWeight: '500',
  },
  merchantDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.lg,
  },
  amountSection: {
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    fontWeight: '500',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amountValue: {
    fontSize: FONT_SIZES.xxxl + 4,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: SPACING.sm,
  },
  amountCurrency: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  noteSection: {
    alignItems: 'center',
  },
  noteLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    fontWeight: '500',
  },
  noteText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
});
