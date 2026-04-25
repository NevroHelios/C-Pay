import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { convertAssetToINR, formatINR } from '../utils/currency';
import { formatDateLong } from '../utils/date';
import { formatWalletFingerprint, getCPayIdByWallet } from '../utils/cpayId';
import { getExplorerUrl } from '../services/blockchain';

const FONT_SIZES = TYPOGRAPHY.sizes;

export interface TransactionDetail {
  id?: string;
  transaction_id?: string;
  tx_hash?: string;
  from_address?: string;
  to_address?: string;
  amount: string;
  status: 'pending' | 'success' | 'failed';
  created_at?: string;
  merchant_name?: string;
  transaction_type?: 'personal' | 'merchant';
}

interface TransactionDetailModalProps {
  visible: boolean;
  transaction: TransactionDetail | null;
  onClose: () => void;
  currentWallet?: string;
  isMerchantView?: boolean;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  visible,
  transaction,
  onClose,
  currentWallet,
  isMerchantView = false,
}) => {
  const [fromCPayId, setFromCPayId] = useState<string>('');
  const [toCPayId, setToCPayId] = useState<string>('');

  // Load C-Pay IDs when transaction changes
  useEffect(() => {
    const loadCPayIds = async () => {
      if (transaction?.from_address) {
        const fromId = await getCPayIdByWallet(transaction.from_address);
        setFromCPayId(fromId || '');
      }
      if (transaction?.to_address) {
        const toId = await getCPayIdByWallet(transaction.to_address);
        setToCPayId(toId || '');
      }
    };
    
    if (transaction) {
      loadCPayIds();
    }
  }, [transaction]);

  if (!transaction) return null;

  const isReceived = transaction.to_address?.toLowerCase() === currentWallet?.toLowerCase();
  const amount = parseFloat(transaction.amount);
  const inrAmount = convertAssetToINR(amount);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'success':
        return { label: 'Completed', icon: 'checkmark-circle', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
      case 'pending':
        return { label: 'Processing', icon: 'time', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
      case 'failed':
        return { label: 'Failed', icon: 'close-circle', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
      default:
        return { label: 'Unknown', icon: 'help-circle', color: COLORS.textSecondary, bg: COLORS.border };
    }
  };

  const statusConfig = getStatusConfig(transaction.status);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return formatDateLong(dateString);
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    // Silent copy - no alert
  };

  const openExplorer = () => {
    if (transaction.tx_hash) {
      const url = getExplorerUrl('tx', transaction.tx_hash);
      Linking.openURL(url);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Transaction Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Amount Section */}
            <View style={styles.amountSection}>
              <Text style={[styles.amountValue, { color: isMerchantView || isReceived ? '#10b981' : COLORS.text }]}>
                {isMerchantView || isReceived ? '+' : '-'}{formatINR(inrAmount)}
              </Text>
            </View>

            {/* Status Badge */}
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Ionicons name={statusConfig.icon as any} size={20} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>

            {/* Transaction Details */}
            <View style={styles.detailsCard}>
              {/* Transaction ID */}
              {transaction.transaction_id && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => copyToClipboard(transaction.transaction_id!, 'Transaction ID')}
                >
                  <Text style={styles.detailLabel}>Transaction ID</Text>
                  <View style={styles.detailValueRow}>
                    <Text style={styles.detailValueHighlight}>{transaction.transaction_id}</Text>
                    <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Type */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Type</Text>
                <Text style={styles.detailValue}>
                  {isMerchantView ? 'Payment Received' : 
                   isReceived ? 'Received' : 'Sent'}
                </Text>
              </View>

              {/* Transaction Type - hide for merchant view and received transactions */}
              {transaction.transaction_type && !isMerchantView && !isReceived && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Payment Method</Text>
                  <View style={[
                    styles.typeBadge,
                    { backgroundColor: transaction.transaction_type === 'merchant' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)' }
                  ]}>
                    <Text style={[
                      styles.typeText,
                      { color: transaction.transaction_type === 'merchant' ? '#3b82f6' : '#8b5cf6' }
                    ]}>
                      {transaction.transaction_type === 'merchant' ? 'Merchant QR' : 'Personal'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Date */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date & Time</Text>
                <Text style={styles.detailValue}>{formatDate(transaction.created_at)}</Text>
              </View>

              {/* From C-Pay ID */}
              {transaction.from_address && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => copyToClipboard(fromCPayId || formatWalletFingerprint(transaction.from_address!), 'From ID')}
                >
                  <Text style={styles.detailLabel}>From</Text>
                  <View style={styles.detailValueRow}>
                    <Text style={styles.addressText} numberOfLines={1}>
                      {fromCPayId || formatWalletFingerprint(transaction.from_address)}
                    </Text>
                    <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              )}

              {/* To C-Pay ID */}
              {transaction.to_address && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => copyToClipboard(toCPayId || formatWalletFingerprint(transaction.to_address!), 'To ID')}
                >
                  <Text style={styles.detailLabel}>To</Text>
                  <View style={styles.detailValueRow}>
                    <Text style={styles.addressText} numberOfLines={1}>
                      {toCPayId || formatWalletFingerprint(transaction.to_address)}
                    </Text>
                    <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Merchant Name - hide for merchant view and received transactions */}
              {transaction.merchant_name && !isMerchantView && !isReceived && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Note/Merchant</Text>
                  <Text style={styles.detailValue}>{transaction.merchant_name}</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Close Button */}
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  content: {
    padding: SPACING.md,
  },
  amountSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  amountLabel: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  amountINR: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    gap: 8,
    marginBottom: SPACING.lg,
  },
  statusText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  detailsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  detailValueHighlight: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '700',
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 2,
    justifyContent: 'flex-end',
  },
  addressText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    fontFamily: 'monospace',
  },
  hashText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    fontFamily: 'monospace',
  },
  typeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    padding: SPACING.md,
    gap: 8,
  },
  explorerButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
});
