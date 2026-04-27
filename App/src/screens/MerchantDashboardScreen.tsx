import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMerchantProfile,
  getMerchantAnalytics,
  getMerchantTransactions,
  type MerchantTransaction,
} from '../services/merchant';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { formatINR, formatMoneyBalance, convertAssetToINR } from '../utils/currency';
import { formatDateShort } from '../utils/date';
import { TransactionDetailModal } from '../components';
import type { TransactionDetail } from '../components/TransactionDetailModal';
import { formatWalletFingerprint, getCPayIdByWallet } from '../utils/cpayId';
import { formatTransactionHash } from '../services/blockchain';

const FONT_SIZES = TYPOGRAPHY.sizes;
const DEFAULT_MERCHANT_LOGO = require('../../assets/default-merchant-image-cryptopay.png');

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

interface MerchantDashboardScreenProps {
  navigation: any;
}

export const MerchantDashboardScreen: React.FC<
  MerchantDashboardScreenProps
> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [totalRevenue, setTotalRevenue] = useState('0');
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<MerchantTransaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const walletAddress = await AsyncStorage.getItem('wallet_address');
      if (!walletAddress) return;

      setWalletAddress(walletAddress);

      // Load merchant profile
      const profile = await getMerchantProfile(walletAddress);
      if (profile) {
        setBusinessName(profile.business_name);
        setLogoUrl(profile.logo_url && profile.logo_url !== 'default-merchant-logo' ? profile.logo_url : null);
      }

      // Load analytics
      const merchantId = await AsyncStorage.getItem('merchant_id');
      if (merchantId) {
        const analytics = await getMerchantAnalytics(merchantId);
        setTotalRevenue(analytics.totalRevenue);
        setTotalTransactions(analytics.totalTransactions);
        setSuccessCount(analytics.successTransactions || 0);
        setPendingCount(analytics.pendingTransactions);

        // Load recent transactions
        const transactions = await getMerchantTransactions(merchantId, 10);
        setRecentTransactions(transactions);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Header with Back Button */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Merchant Dashboard</Text>
        <View style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color={COLORS.textSecondary} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Welcome Header */}
        <View style={styles.header}>
          <Image
            source={logoUrl ? { uri: logoUrl } : DEFAULT_MERCHANT_LOGO}
            style={styles.businessLogo}
            onError={() => setLogoUrl(null)}
          />
          <View style={styles.headerText}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.businessName} numberOfLines={2}>{businessName}</Text>
          </View>
        </View>

        {/* Top Row - QR Code and Revenue side by side */}
        <View style={styles.topRowContainer}>
          {/* Global Merchant QR Code */}
          <TouchableOpacity
            style={styles.globalQRCard}
            onPress={() => navigation.navigate('MerchantGlobalQR')}
          >
            <Ionicons name="qr-code-outline" size={30} color={COLORS.card} style={styles.globalQRIcon} />
            <Text style={styles.globalQRTitle}>My Payment QR Code</Text>
            <Text style={styles.globalQRSubtitle}>
              Tap to view your merchant QR code
            </Text>
          </TouchableOpacity>

          {/* Total Revenue */}
          <View style={styles.revenueCard}>
            <View style={styles.analyticsLabelRow}>
              <Ionicons name="trending-up-outline" size={14} color="#fff" />
              <Text style={styles.analyticsLabel}>Total Revenue</Text>
            </View>
            <Text style={styles.revenueValue}>{formatINR(convertAssetToINR(parseFloat(totalRevenue)))}</Text>
            <Text style={styles.revenueSubValue}>Pilot credit rail</Text>
          </View>
        </View>

        {/* Bottom Row - 3 Stats in a single row */}
        <View style={styles.statsRowContainer}>
          <View style={[styles.statCard, { backgroundColor: '#3b82f6' }]}>
            <Text style={styles.analyticsLabel}>Transactions</Text>
            <Text style={styles.statValue}>{totalTransactions}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#10b981' }]}>
            <Text style={styles.analyticsLabel}>Successful</Text>
            <Text style={styles.statValue}>{successCount}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#f59e0b' }]}>
            <Text style={styles.analyticsLabel}>Pending</Text>
            <Text style={styles.statValue}>{pendingCount}</Text>
          </View>
        </View>

      {/* Generate QR Button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.generateQRButton}
          onPress={() => navigation.navigate('MerchantQRGenerator')}
        >
          <Ionicons name="qr-code-outline" size={24} color="#fff" />
          <Text style={styles.generateQRButtonText}>Generate Payment QR</Text>
        </TouchableOpacity>
      </View>

      {/* Transaction History */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Payments Received</Text>
            <Text style={styles.sectionSubtitle}>Recent 10 transactions</Text>
          </View>
          {recentTransactions.length > 0 && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() => navigation.navigate('MerchantTransactions')}
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>
        {recentTransactions.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <Ionicons name="receipt-outline" size={40} color={COLORS.textTertiary} style={styles.emptyTxEmoji} />
            <Text style={styles.emptyTxText}>No transactions yet</Text>
            <Text style={styles.emptyTxSubtext}>Transactions will appear here when customers pay you</Text>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {recentTransactions.map((tx) => (
              <TouchableOpacity 
                key={tx.id} 
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
            ))}
          </View>
        )}
      </View>

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
      </ScrollView>
    </View>
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
  backButton: {
    padding: SPACING.xs,
  },
  settingsButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  content: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
  },
  topRowContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  globalQRCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: 12,
  },
  globalQRIcon: {
    marginBottom: SPACING.xs,
  },
  globalQRTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.card,
    textAlign: 'center',
    marginBottom: 2,
  },
  globalQRSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.card,
    opacity: 0.9,
    textAlign: 'center',
  },
  revenueCard: {
    flex: 1,
    backgroundColor: '#10b981',
    padding: SPACING.md,
    borderRadius: 12,
    justifyContent: 'center',
  },
  revenueValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: SPACING.xs,
  },
  revenueSubValue: {
    fontSize: FONT_SIZES.xs,
    color: '#fff',
    opacity: 0.85,
    marginTop: 2,
  },
  statsRowContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  statCard: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: SPACING.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  businessLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  businessName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  analyticsLabel: {
    fontSize: FONT_SIZES.xs,
    color: '#fff',
    opacity: 0.9,
    fontWeight: '600',
  },
  analyticsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
  },
  addButtonText: {
    color: COLORS.card,
    fontWeight: '600',
    fontSize: FONT_SIZES.xs,
  },
  emptyState: {
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: 12,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: SPACING.xs,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.card,
    fontWeight: '600',
  },
  qrList: {
  },
  qrCard: {
    backgroundColor: COLORS.card,
    padding: SPACING.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.xs,
  },
  qrCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  qrInfo: {
    flex: 1,
  },
  qrName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  qrAmount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  toggleButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#10b981',
  },
  toggleButtonInactive: {
    backgroundColor: COLORS.border,
  },
  toggleText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  toggleTextInactive: {
    color: COLORS.textSecondary,
  },
  qrStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrStat: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  viewLink: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  generateQRButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: 12,
    gap: 10,
  },
  generateQRButtonText: {
    fontSize: FONT_SIZES.md,
    color: '#fff',
    fontWeight: '600',
  },
  emptyTransactions: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTxEmoji: {
    marginBottom: SPACING.sm,
  },
  emptyTxText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  emptyTxSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  transactionsList: {
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
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickActionEmoji: {
    fontSize: 28,
    marginRight: SPACING.md,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: SPACING.sm,
    borderRadius: 10,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  actionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '500',
  },
});
