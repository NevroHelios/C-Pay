import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { getTransactions, Transaction } from '../services/storage';
import { pollPendingTransactions } from '../services/transactionMonitor';
import { supabase } from '../services/supabase';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { TransactionItem, LoadingSpinner, EmptyState, TransactionDetailModal } from '../components';

interface TransactionHistoryScreenProps {
  navigation: any;
  route?: {
    params?: {
      highlightTransaction?: string;
    };
  };
}

export const TransactionHistoryScreen: React.FC<TransactionHistoryScreenProps> = ({
  navigation,
  route,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [currentWallet, setCurrentWallet] = useState<string>('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  
  useEffect(() => {
    loadWalletAddress();
    loadTransactions();

    // If a specific transaction should be highlighted, show it
    if (route?.params?.highlightTransaction) {
      // Wait for transactions to load, then show the modal
      const timer = setTimeout(() => {
        const highlightedTx = transactions.find(
          tx => tx.tx_hash === route.params?.highlightTransaction
        );
        if (highlightedTx) {
          setSelectedTransaction(highlightedTx);
          setShowTransactionModal(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }

    // Subscribe to real-time updates from Supabase
    console.log('📡 Subscribing to real-time transaction updates...');
    
    const channel = supabase
      .channel('transactions_channel')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'transactions' 
        },
        (payload) => {
          console.log('🆕 New transaction received:', payload.new);
          setTransactions((prev) => [payload.new as Transaction, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'transactions' 
        },
        (payload) => {
          console.log('🔄 Transaction updated:', payload.new);
          setTransactions((prev) =>
            prev.map((tx) =>
              tx.tx_hash === (payload.new as Transaction).tx_hash
                ? (payload.new as Transaction)
                : tx
            )
          );
        }
      )
      .subscribe((status) => {
        console.log('📡 Supabase subscription status:', status);
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
          console.log('✅ Real-time connection established');
        } else if (status === 'CLOSED') {
          setRealtimeConnected(false);
          console.log('❌ Real-time connection closed');
        }
      });

    // Cleanup subscription on unmount
    return () => {
      console.log('📡 Unsubscribing from real-time updates...');
      channel.unsubscribe();
    };
  }, []);

  // Refresh transactions when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('🔄 TransactionHistory focused - refreshing');
      loadTransactions();
    }, [])
  );

  const loadWalletAddress = async () => {
    const address = await AsyncStorage.getItem('wallet_address');
    if (address) {
      setCurrentWallet(address);
    }
  };

  const loadTransactions = async () => {
    try {
      const txs = await getTransactions();
      setTransactions(txs);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    
    // Reload transactions from Supabase
    await loadTransactions();
    
    // Manually poll pending transactions to update their status
    console.log('🔄 Manual refresh: checking pending transactions...');
    await pollPendingTransactions();
    
    setRefreshing(false);
  };

  if (loading) {
    return <LoadingSpinner fullScreen text="Loading transactions..." />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Transactions</Text>
          {realtimeConnected && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Transaction List */}
      {transactions.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No Transactions Yet"
          description="Your transaction history will appear here once you make or receive payments"
          actionText="Make a Payment"
          onAction={() => navigation.navigate('MainTabs', { screen: 'Home' })}
        />
      ) : (
        <FlatList
          data={transactions}
          renderItem={({ item }) => (
            <TransactionItem
              transaction={item}
              currentWallet={currentWallet}
              onPress={() => {
                setSelectedTransaction(item);
                setShowTransactionModal(true);
              }}
            />
          )}
          keyExtractor={(item) => item.tx_hash}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
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
        currentWallet={currentWallet}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 50 : SPACING.xl,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: FONT_SIZES.xxl,
    color: COLORS.textPrimary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginRight: SPACING.xs,
  },
  liveText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    fontWeight: '500',
  },
  listContent: {
    padding: SPACING.lg,
  },
});

