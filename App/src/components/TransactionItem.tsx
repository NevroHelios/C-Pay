import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS, TYPOGRAPHY } from '../constants/theme';
import { formatDateShort } from '../utils/date';
import { convertAssetToINR, formatINR } from '../utils/currency';
import { formatWalletFingerprint, getCPayIdByWallet } from '../utils/cpayId';
import { formatTransactionHash, isValidTransactionHash } from '../services/blockchain';

interface Transaction {
  id?: string;
  tx_hash?: string;
  transaction_id?: string;
  merchant_name?: string;
  sender_name?: string;
  recipient_name?: string;
  to_address?: string;
  from_address?: string;
  amount: string;
  status: 'pending' | 'success' | 'failed';
  // Phase 2: Invisible Rail - simplified status for UI
  user_visible_status?: 'success' | 'failed';
  internal_status?: 'processing' | 'submitted' | 'confirmed' | 'failed';
  failure_reason?: string;
  created_at?: string;
}

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: () => void;
  currentWallet?: string;
}

// Helper function to get status configuration
const getStatusConfig = (status: string, internalStatus?: string) => {
  // Phase 2: Invisible Rail - Simplified status labels (no blockchain jargon)
  switch (status) {
    case 'success':
      // Show different text based on internal status
      if (internalStatus === 'confirmed') {
        return {
          label: 'Completed',
          icon: 'checkmark-circle',
          color: COLORS.successDark,
          bg: COLORS.successBg,
        };
      } else if (internalStatus === 'submitted' || internalStatus === 'processing') {
        return {
          label: 'Processing',
          icon: 'time-outline',
          color: COLORS.warningDark,
          bg: COLORS.warningBg,
        };
      }
      return {
        label: 'Completed',
        icon: 'checkmark-circle',
        color: COLORS.successDark,
        bg: COLORS.successBg,
      };
    case 'pending':
      return {
        label: 'Processing', // Changed from "Pending" to "Processing"
        icon: 'time-outline',
        color: COLORS.warningDark,
        bg: COLORS.warningBg,
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: 'close-circle',
        color: COLORS.errorDark,
        bg: COLORS.errorBg,
      };
    default:
      return {
        label: 'Unknown',
        icon: 'help-circle',
        color: COLORS.textSecondary,
        bg: COLORS.background,
      };
  }
};

export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  onPress,
  currentWallet,
}) => {
  const [displayName, setDisplayName] = useState<string>('Loading...');
  const isReceived = transaction.to_address?.toLowerCase() === currentWallet?.toLowerCase();
  
  // Phase 2: Use user_visible_status if available, fallback to status
  const displayStatus = transaction.user_visible_status || transaction.status;
  const statusConfig = getStatusConfig(displayStatus, transaction.internal_status);
  const hasChainHash = isValidTransactionHash(transaction.tx_hash);
  
  const formatDate = (dateString: string) => formatDateShort(dateString);

  // Load display name (with C-Pay ID support)
  useEffect(() => {
    const loadDisplayName = async () => {
      if (isReceived) {
        // For received: show sender name or C-Pay ID
        if (transaction.sender_name) {
          setDisplayName(transaction.sender_name);
          return;
        }
        if (transaction.from_address) {
          const cpayId = await getCPayIdByWallet(transaction.from_address);
          setDisplayName(cpayId || formatWalletFingerprint(transaction.from_address));
          return;
        }
        setDisplayName('Unknown');
      } else {
        // For sent: show recipient name or C-Pay ID
        if (transaction.recipient_name || transaction.merchant_name) {
          setDisplayName(transaction.recipient_name || transaction.merchant_name || 'Unknown');
          return;
        }
        if (transaction.to_address) {
          const cpayId = await getCPayIdByWallet(transaction.to_address);
          setDisplayName(cpayId || formatWalletFingerprint(transaction.to_address));
          return;
        }
        setDisplayName('Unknown');
      }
    };
    
    loadDisplayName();
  }, [transaction, isReceived]);

  const amount = parseFloat(transaction.amount);
  const inrAmount = convertAssetToINR(amount);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.transactionHeader}>
        <View style={styles.transactionInfo}>
          <View style={styles.transactionHashRow}>
            <Text style={styles.transactionId}>
              {formatTransactionHash(transaction.tx_hash)}
            </Text>
            {hasChainHash && (
              <Ionicons name="open-outline" size={13} color={COLORS.primary} />
            )}
          </View>
          <Text style={styles.transactionName} numberOfLines={1}>
            {isReceived ? 'From: ' : 'To: '}{displayName}
          </Text>
          <Text style={styles.transactionDate}>
            {formatDate(transaction.created_at || new Date().toISOString())}
          </Text>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text style={[
            styles.transactionAmount,
            { color: isReceived ? '#10b981' : COLORS.text }
          ]}>
            {isReceived ? '+' : '-'}{formatINR(inrAmount)}
          </Text>
        </View>
      </View>
      <View style={styles.transactionFooter}>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
          <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionHashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  transactionId: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  transactionName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  transactionAmountINR: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  transactionFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
});
