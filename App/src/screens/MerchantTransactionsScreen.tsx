import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMerchantProfile,
  getMerchantTransactions,
  type MerchantTransaction,
} from '../services/merchant';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { formatMoneyBalance } from '../utils/currency';
import { formatDateShort } from '../utils/date';
import { TransactionDetailModal, Screen, Header } from '../components';
import type { TransactionDetail } from '../components/TransactionDetailModal';
import { formatWalletFingerprint, getCPayIdByWallet } from '../utils/cpayId';
import { formatTransactionHash } from '../services/blockchain';

const FONT_SIZES = TYPOGRAPHY.sizes;

// Helper component to display sender info with C-Pay ID
const SenderInfo: React.FC<{ fromAddress: string; senderName?: string }> = ({ fromAddress, senderName }) => {
  const [displayName, setDisplayName] = React.useState(senderName || 'Loading...');

  React.useEffect(() => {
    const loadName = async () => {
      if (senderName) {
        setDisplayName(senderName);
      } else {
        const cpayId = await getCPayIdByWallet(fromAddress);
        setDisplayName(cpayId || formatWalletFingerprint(fromAddress));
      }
    };
    loadName();
  }, [fromAddress, senderName]);

  return (
    <Text style={styles.transactionFrom} numberOfLines={1}>
      From: {displayName}
    </Text>
  );
};

interface MerchantTransactionsScreenProps {
  navigation: any;
}

export const MerchantTransactionsScreen: React.FC<MerchantTransactionsScreenProps> = ({
  navigation,
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<MerchantTransaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      let merchantId = await AsyncStorage.getItem('merchant_id');
      const wallet = await AsyncStorage.getItem('wallet_address');
      if (wallet) setWalletAddress(wallet);
      if (!merchantId && wallet) {
        const profile = await getMerchantProfile(wallet);
        merchantId = profile?.id || null;
      }
      if (merchantId) {
        // Fetch more transactions (up to 100)
        const txs = await getMerchantTransactions(merchantId, 100);
        setTransactions(txs);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadTransactions();
  };

  const renderTransaction = ({ item: tx }: { item: MerchantTransaction }) => (
    <TouchableOpacity 
      style={styles.transactionCard}
      activeOpacity={0.7}
      onPress={() => {
        setSelectedTransaction({
          ...tx,
          transaction_type: 'merchant',
        });
        setShowTransactionModal(true);
      }}
    >
      <View style={styles.transactionHeader}>
        <View style={styles.transactionInfo}>
          <View style={styles.transactionHashRow}>
            <Text style={styles.transactionId}>{formatTransactionHash(tx.tx_hash)}</Text>
            <Ionicons name="open-outline" size={13} color={COLORS.primary} />
          </View>
          <Text style={styles.transactionDate}>
            {formatDateShort(tx.created_at)}
          </Text>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text style={styles.transactionAmount}>+{formatMoneyBalance(parseFloat(tx.amount))}</Text>
          <Text style={styles.transactionAmountINR}>Stellar settlement</Text>
        </View>
      </View>
      <View style={styles.transactionFooter}>
        <SenderInfo fromAddress={tx.from_address} senderName={tx.sender_name} />
        <View style={[
          styles.statusBadge,
          tx.status === 'success' ? styles.statusSuccess : 
          tx.status === 'pending' ? styles.statusPending : styles.statusFailed
        ]}>
          <Text style={[
            styles.statusText,
            tx.status === 'success' ? styles.statusTextSuccess : 
            tx.status === 'pending' ? styles.statusTextPending : styles.statusTextFailed
          ]}>
            {tx.status === 'success' ? 'Success' : 
             tx.status === 'pending' ? 'Pending' : 'Failed'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <Screen
      scroll={false}
      padded={false}
      loading={loading}
      header={<Header title="All Transactions" onBack={() => navigation.goBack()} />}
    >
      {/* Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{transactions.length}</Text>
          <Text style={styles.summaryLabel}>Total Payments</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {transactions.filter(tx => tx.status === 'success').length}
          </Text>
          <Text style={styles.summaryLabel}>Successful</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {transactions.filter(tx => tx.status === 'pending').length}
          </Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
      </View>

      {/* Info note */}
      <View style={styles.infoNote}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.textSecondary} />
        <Text style={styles.infoNoteText}>Showing payments received to your merchant wallet</Text>
      </View>

      {/* Transactions List */}
      {transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={48} color={COLORS.textTertiary} style={styles.emptyEmoji} />
          <Text style={styles.emptyText}>No transactions yet</Text>
          <Text style={styles.emptySubtext}>Payments will appear here when customers pay you</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        visible={showTransactionModal}
        transaction={selectedTransaction}
        onClose={() => {
          setShowTransactionModal(false);
          setSelectedTransaction(null);
        }}
        currentWallet={walletAddress}
        isMerchantView={true}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.sm,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    gap: 6,
  },
  infoNoteText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  transactionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: SPACING.md,
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
    marginBottom: 4,
  },
  transactionId: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
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
    color: '#10b981',
  },
  transactionAmountINR: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  transactionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionFrom: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  statusFailed: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  statusTextSuccess: {
    color: '#10b981',
  },
  statusTextPending: {
    color: '#f59e0b',
  },
  statusTextFailed: {
    color: '#ef4444',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyEmoji: {
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
