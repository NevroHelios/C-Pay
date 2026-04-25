import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Animated,
  Modal,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { requestAddMoney, canAddMoney, getBalance, getTimeUntilNextAddMoney, formatTimeRemaining } from '../services/blockchain';
import { startTransactionPolling, stopTransactionPolling } from '../services/transactionMonitor';
import { getAuthenticatedWallet } from '../utils/biometric';
import { getTransactions, saveTransaction, Transaction, storageEvents } from '../services/storage';
import { supabase } from '../services/supabase';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { formatINR } from '../utils/currency';
import { LoadingSpinner, TransactionItem, TransactionDetailModal } from '../components';
import type { TransactionDetail } from '../components/TransactionDetailModal';

interface HomeScreenProps {
  navigation: any;
}

type AddMoneyPhase = 'idle' | 'confirm' | 'checking' | 'authenticating' | 'processing' | 'success' | 'error';

const ADD_MONEY_DISPLAY_AMOUNT = '100';

const waitForUiPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [balance, setBalance] = useState<string>('0');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [addMoneyPhase, setAddMoneyPhase] = useState<AddMoneyPhase>('idle');
  const [addMoneyMessage, setAddMoneyMessage] = useState('');
  const [addMoneyTxHash, setAddMoneyTxHash] = useState('');
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];
  const isAddMoneyBusy = ['checking', 'authenticating', 'processing'].includes(addMoneyPhase);

  useEffect(() => {
    loadWalletData();
    
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Start background polling for pending transactions
    startTransactionPolling(15000); // Poll every 15 seconds
    
    // Listen for new transactions (real-time updates within same app)
    const transactionListener = (transaction: Transaction) => {
      console.log('📡 Received new transaction event, refreshing list...');
      loadTransactions();
      // Also refresh balance
      if (walletAddress) {
        loadBalance(walletAddress);
      }
    };
    
    storageEvents.on('transactionSaved', transactionListener);
    console.log('🎯 Subscribed to transactionSaved events');
    
    // Setup Supabase real-time subscription for incoming transactions (for receivers)
    let supabaseSubscription: any = null;
    
    const setupRealtimeSubscription = async () => {
      if (!walletAddress) return;
      
      console.log('🔔 Setting up Supabase real-time subscription for:', walletAddress);
      
      supabaseSubscription = supabase
        .channel('transactions')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'transactions',
            filter: `to_address=eq.${walletAddress}`,
          },
          (payload) => {
            console.log('💰 New incoming transaction detected!', payload);
            loadTransactions();
            loadBalance(walletAddress);
          }
        )
        .subscribe();
    };
    
    if (walletAddress) {
      setupRealtimeSubscription();
    }
    
    // Cleanup on unmount
    return () => {
      stopTransactionPolling();
      storageEvents.off('transactionSaved', transactionListener);
      console.log('🚫 Unsubscribed from transactionSaved events');
      
      if (supabaseSubscription) {
        supabase.removeChannel(supabaseSubscription);
        console.log('🚫 Unsubscribed from Supabase real-time');
      }
    };
  }, [walletAddress]);

  // Refresh transactions when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('🔄 HomeScreen focused - refreshing transactions');
      loadTransactions();
      if (walletAddress) {
        loadBalance(walletAddress);
      }
    }, [walletAddress])
  );

  const loadWalletData = async () => {
    try {
      const address = await AsyncStorage.getItem('wallet_address');
      if (address) {
        setWalletAddress(address);
        await loadBalance(address);
      }
    } catch (error) {
      console.error('Error loading wallet:', error);
    } finally {
      setLoading(false);
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

  const loadTransactions = async () => {
    try {
      const txs = await getTransactions();
      // Get last 5 transactions
      setTransactions(txs.slice(0, 10));
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadBalance(walletAddress),
      loadTransactions(),
    ]);
    setRefreshing(false);
  };

  const handleSendMoney = () => {
    navigation.navigate('SendMoney');
  };

  const handleAddMoney = () => {
    if (!walletAddress) return;
    setAddMoneyTxHash('');
    setAddMoneyMessage(`Add ${formatINR(Number(ADD_MONEY_DISPLAY_AMOUNT))} test balance to your wallet. One claim is available every 24 hours.`);
    setAddMoneyPhase('confirm');
  };

  const closeAddMoneyStatus = () => {
    if (!isAddMoneyBusy) {
      setAddMoneyPhase('idle');
      setAddMoneyMessage('');
      setAddMoneyTxHash('');
    }
  };

  const startAddMoney = async () => {
    if (!walletAddress || isAddMoneyBusy) return;

    try {
      setAddMoneyTxHash('');
      setAddMoneyMessage('Checking wallet readiness...');
      setAddMoneyPhase('checking');
      await waitForUiPaint();

      const canClaim = await canAddMoney(walletAddress);
      
      if (!canClaim) {
        const timeRemaining = await getTimeUntilNextAddMoney(walletAddress);
        const timeFormatted = formatTimeRemaining(timeRemaining);
        setAddMoneyMessage(`Your wallet is being prepared. Please try again in ${timeFormatted}.`);
        setAddMoneyPhase('error');
        return;
      }

      setAddMoneyMessage('Confirm with PIN or biometrics to continue...');
      setAddMoneyPhase('authenticating');
      await waitForUiPaint();

      const wallet = await getAuthenticatedWallet(
        'Add Money',
        'Enter your 6-digit PIN to add test money',
        'Unlock wallet to add money'
      );

      if (!wallet) {
        setAddMoneyMessage('Authentication was not completed. Please try again.');
        setAddMoneyPhase('error');
        return;
      }

      setAddMoneyMessage('Preparing your wallet and adding test balance...');
      setAddMoneyPhase('processing');
      await waitForUiPaint();

      const txHash = await requestAddMoney(wallet);
      setAddMoneyTxHash(txHash);

      await saveTransaction({
        tx_hash: txHash,
        to_address: wallet.publicKey,
        amount: ADD_MONEY_DISPLAY_AMOUNT,
        status: 'success',
        internal_status: 'confirmed',
        user_visible_status: 'success',
        sender_name: 'C-Pay Add Money',
        recipient_name: 'Your wallet',
        note: 'Test balance added',
      });

      void loadTransactions();
      void loadBalance(walletAddress);
      setTimeout(() => loadBalance(walletAddress), 5000);

      setAddMoneyMessage(`${formatINR(Number(ADD_MONEY_DISPLAY_AMOUNT))} has been added. Your balance will refresh automatically.`);
      setAddMoneyPhase('success');
    } catch (error: any) {
      console.error('Add Money error:', error);

      let errorMessage = error.message || 'Failed to add money';

      if (error.message?.includes('wait') && (error.message?.includes('h ') || error.message?.includes('m'))) {
        errorMessage = error.message;
      } else if (error.message?.includes('wait 24 hours') || error.message?.includes('cooling down')) {
        try {
          const timeRemaining = await getTimeUntilNextAddMoney(walletAddress);
          const timeFormatted = formatTimeRemaining(timeRemaining);
          errorMessage = `Please wait ${timeFormatted} before adding money again.`;
        } catch {
          errorMessage = 'Please wait 24 hours between Add Money claims.';
        }
      } else if (error.message?.includes('insufficient') && error.message?.includes('CPINR')) {
        errorMessage = 'Add Money is not available yet because the relayer distribution account has no CPINR balance.';
      } else if (error.message?.includes('not reachable')) {
        errorMessage = 'Payment service is not reachable. Check your internet connection or relayer service.';
      } else if (error.message?.includes('network') || error.message?.includes('connection') || error.message?.includes('fetch')) {
        errorMessage = 'Please check your internet connection and try again.';
      }

      setAddMoneyMessage(errorMessage);
      setAddMoneyPhase('error');
    }
  };

  if (loading && !walletAddress) {
    return (
      <LoadingSpinner fullScreen text="Loading your wallet..." />
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
      {/* Balance Card with Gradient */}
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceHeader}>
            <View style={styles.balanceLabelContainer}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.textInverse} style={styles.balanceIcon} />
              <Text style={styles.balanceLabel}>Total Balance</Text>
            </View>
          </View>
          
          <View style={styles.balanceAmountContainer}>
            <Text style={styles.balanceCurrency}>₹</Text>
            <Text style={styles.balanceAmount}>{parseFloat(balance).toFixed(2)}</Text>
          </View>
          
          <Text style={styles.balanceUsd}>Your digital money balance</Text>
        </LinearGradient>
      </Animated.View>

      {/* Quick Actions - Updated */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={handleSendMoney}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconContainer, { backgroundColor: COLORS.primary + '20' }]}>
            <Ionicons name="send-outline" size={23} color={COLORS.primary} />
          </View>
          <Text style={styles.actionTitle}>Send Money</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, addMoneyPhase !== 'idle' && styles.actionCardDisabled]}
          onPress={handleAddMoney}
          activeOpacity={0.8}
          disabled={addMoneyPhase !== 'idle'}
        >
          <View style={[styles.actionIconContainer, { backgroundColor: COLORS.success + '20' }]}>
            <Ionicons name="add-circle-outline" size={24} color={COLORS.success} />
          </View>
          <Text style={styles.actionTitle}>Add Money</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('TransactionHistory')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconContainer, { backgroundColor: COLORS.info + '20' }]}>
            <Ionicons name="receipt-outline" size={23} color={COLORS.info} />
          </View>
          <Text style={styles.actionTitle}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Transactions Section */}
      <View style={styles.transactionsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {transactions.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('TransactionHistory')}>
              <Text style={styles.seeAllText}>See All →</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {transactions.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <Ionicons name="card-outline" size={44} color={COLORS.textTertiary} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No Transactions Yet</Text>
            <Text style={styles.emptyDescription}>
              Your transaction history will appear here
            </Text>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {transactions.map((transaction, index) => (
              <TransactionItem
                key={transaction.tx_hash || index}
                transaction={{
                  ...transaction,
                  id: transaction.id || transaction.tx_hash,
                  created_at: transaction.created_at || new Date().toISOString(),
                }}
                currentWallet={walletAddress}
                onPress={() => {
                  setSelectedTransaction({
                    ...transaction,
                    id: transaction.id || transaction.tx_hash,
                    created_at: transaction.created_at || new Date().toISOString(),
                  });
                  setShowTransactionModal(true);
                }}
              />
            ))}
          </View>
        )}
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={20} color={COLORS.infoDark} style={styles.infoBannerIcon} />
        <View style={styles.infoBannerContent}>
          <Text style={styles.infoBannerTitle}>Development Mode</Text>
          <Text style={styles.infoBannerText}>
            Test environment • Free to use • No real money
          </Text>
        </View>
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
      />
      </ScrollView>

      <Modal
        visible={addMoneyPhase !== 'idle'}
        transparent
        animationType="fade"
        onRequestClose={closeAddMoneyStatus}
      >
        <View style={styles.addMoneyOverlay}>
          <View style={styles.addMoneyModal}>
            <View
              style={[
                styles.addMoneyIcon,
                addMoneyPhase === 'success' && styles.addMoneyIconSuccess,
                addMoneyPhase === 'error' && styles.addMoneyIconError,
              ]}
            >
              {isAddMoneyBusy ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Ionicons
                  name={
                    addMoneyPhase === 'success'
                      ? 'checkmark-circle'
                      : addMoneyPhase === 'error'
                        ? 'alert-circle'
                        : 'add-circle'
                  }
                  size={30}
                  color={
                    addMoneyPhase === 'success'
                      ? COLORS.success
                      : addMoneyPhase === 'error'
                        ? COLORS.error
                        : COLORS.primary
                  }
                />
              )}
            </View>

            <Text style={styles.addMoneyTitle}>
              {addMoneyPhase === 'confirm'
                ? 'Add Money'
                : addMoneyPhase === 'checking'
                  ? 'Checking Wallet'
                  : addMoneyPhase === 'authenticating'
                    ? 'Authentication Required'
                    : addMoneyPhase === 'processing'
                      ? 'Adding Money'
                      : addMoneyPhase === 'success'
                        ? 'Money Added'
                        : 'Add Money Failed'}
            </Text>

            <Text style={styles.addMoneyMessage}>{addMoneyMessage}</Text>

            {!!addMoneyTxHash && (
              <Text style={styles.addMoneyHash} numberOfLines={1}>
                Tx {addMoneyTxHash.slice(0, 10)}...{addMoneyTxHash.slice(-8)}
              </Text>
            )}

            {addMoneyPhase === 'confirm' && (
              <View style={styles.addMoneyButtonRow}>
                <TouchableOpacity
                  style={[styles.addMoneyButton, styles.addMoneySecondaryButton]}
                  onPress={closeAddMoneyStatus}
                >
                  <Text style={styles.addMoneySecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addMoneyButton, styles.addMoneyPrimaryButton]}
                  onPress={startAddMoney}
                >
                  <Text style={styles.addMoneyPrimaryText}>Add Money</Text>
                </TouchableOpacity>
              </View>
            )}

            {addMoneyPhase === 'success' && (
              <View style={styles.addMoneyButtonRow}>
                <TouchableOpacity
                  style={[styles.addMoneyButton, styles.addMoneySecondaryButton]}
                  onPress={() => {
                    closeAddMoneyStatus();
                    navigation.navigate('TransactionHistory');
                  }}
                >
                  <Text style={styles.addMoneySecondaryText}>View History</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addMoneyButton, styles.addMoneyPrimaryButton]}
                  onPress={closeAddMoneyStatus}
                >
                  <Text style={styles.addMoneyPrimaryText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            {addMoneyPhase === 'error' && (
              <View style={styles.addMoneyButtonRow}>
                <TouchableOpacity
                  style={[styles.addMoneyButton, styles.addMoneySecondaryButton]}
                  onPress={closeAddMoneyStatus}
                >
                  <Text style={styles.addMoneySecondaryText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addMoneyButton, styles.addMoneyPrimaryButton]}
                  onPress={startAddMoney}
                >
                  <Text style={styles.addMoneyPrimaryText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingTop: SPACING.md,
  },
  balanceCard: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.lg,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  balanceLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceIcon: {
    marginRight: SPACING.xs,
  },
  balanceLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textInverse,
    opacity: 0.9,
    fontWeight: '600',
  },
  balanceAmountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  balanceAmount: {
    marginRight: SPACING.sm,
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.textInverse,
    letterSpacing: -1,
  },
  balanceCurrency: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textInverse,
    opacity: 0.85,
    fontWeight: '700',
  },
  balanceUsd: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textInverse,
    opacity: 0.7,
    marginTop: SPACING.xs,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -SPACING.xs,
    marginBottom: SPACING.xl,
  },
  actionCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.md,
    alignItems: 'center',
    marginHorizontal: SPACING.xs,
    ...SHADOWS.sm,
  },
  actionCardDisabled: {
    opacity: 0.65,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  actionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  transactionsSection: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  seeAllText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  transactionsList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  emptyTransactions: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  emptyIcon: {
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptyDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  infoBanner: {
    backgroundColor: COLORS.infoBg,
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoBannerIcon: {
    marginRight: SPACING.sm,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.infoDark,
    marginBottom: 2,
  },
  infoBannerText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  addMoneyOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  addMoneyModal: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  addMoneyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
    marginBottom: SPACING.lg,
  },
  addMoneyIconSuccess: {
    backgroundColor: COLORS.successBg,
  },
  addMoneyIconError: {
    backgroundColor: COLORS.errorBg,
  },
  addMoneyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  addMoneyMessage: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  addMoneyHash: {
    width: '100%',
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
  },
  addMoneyButtonRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  addMoneyButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  addMoneyPrimaryButton: {
    backgroundColor: COLORS.primary,
  },
  addMoneySecondaryButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addMoneyPrimaryText: {
    color: COLORS.textInverse,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  addMoneySecondaryText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
});
