import AsyncStorage from '@react-native-async-storage/async-storage';

// Phase 4: Security - Transaction limits and rate limiting

const TRANSACTION_LIMIT_KEY = 'transaction_limits';
const RATE_LIMIT_KEY = 'rate_limits';

// Configuration
const MAX_TRANSACTIONS_PER_DAY = 20;
const MAX_AMOUNT_PER_TRANSACTION = '1000';
const MAX_DAILY_AMOUNT = '5000';
const MAX_REQUESTS_PER_MINUTE = 10;

interface TransactionLimit {
  date: string;
  count: number;
  totalAmount: number;
}

interface RateLimit {
  action: string;
  timestamps: number[];
}

/**
 * Check if user has exceeded daily transaction limit
 */
export async function checkTransactionLimit(amount: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stored = await AsyncStorage.getItem(TRANSACTION_LIMIT_KEY);
    
    let limit: TransactionLimit = stored
      ? JSON.parse(stored)
      : { date: today, count: 0, totalAmount: 0 };

    // Reset if new day
    if (limit.date !== today) {
      limit = { date: today, count: 0, totalAmount: 0 };
    }

    const amountNum = parseFloat(amount);

    // Check single transaction amount limit
    if (amountNum > parseFloat(MAX_AMOUNT_PER_TRANSACTION)) {
      return {
        allowed: false,
        reason: `Maximum amount per transaction is INR ${MAX_AMOUNT_PER_TRANSACTION}`,
      };
    }

    // Check daily transaction count
    if (limit.count >= MAX_TRANSACTIONS_PER_DAY) {
      return {
        allowed: false,
        reason: `Daily transaction limit reached (${MAX_TRANSACTIONS_PER_DAY} transactions)`,
      };
    }

    // Check daily amount limit
    if (limit.totalAmount + amountNum > parseFloat(MAX_DAILY_AMOUNT)) {
      return {
        allowed: false,
        reason: `Daily amount limit exceeded. Maximum INR ${MAX_DAILY_AMOUNT} per day`,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking transaction limit:', error);
    return { allowed: true }; // Fail open for now
  }
}

/**
 * Record a transaction for limit tracking
 */
export async function recordTransaction(amount: string): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stored = await AsyncStorage.getItem(TRANSACTION_LIMIT_KEY);
    
    let limit: TransactionLimit = stored
      ? JSON.parse(stored)
      : { date: today, count: 0, totalAmount: 0 };

    // Reset if new day
    if (limit.date !== today) {
      limit = { date: today, count: 0, totalAmount: 0 };
    }

    // Increment count and amount
    limit.count++;
    limit.totalAmount += parseFloat(amount);

    await AsyncStorage.setItem(TRANSACTION_LIMIT_KEY, JSON.stringify(limit));
  } catch (error) {
    console.error('Error recording transaction:', error);
  }
}

/**
 * Check rate limit for specific action
 */
export async function checkRateLimit(action: string): Promise<{
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
}> {
  try {
    const key = `${RATE_LIMIT_KEY}_${action}`;
    const stored = await AsyncStorage.getItem(key);
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    let rateLimit: RateLimit = stored
      ? JSON.parse(stored)
      : { action, timestamps: [] };

    // Filter out timestamps older than 1 minute
    rateLimit.timestamps = rateLimit.timestamps.filter(ts => ts > oneMinuteAgo);

    // Check if limit exceeded
    if (rateLimit.timestamps.length >= MAX_REQUESTS_PER_MINUTE) {
      const oldestTimestamp = Math.min(...rateLimit.timestamps);
      const retryAfter = Math.ceil((oldestTimestamp + 60000 - now) / 1000);
      
      return {
        allowed: false,
        reason: `Too many requests. Please wait ${retryAfter} seconds.`,
        retryAfter,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    return { allowed: true }; // Fail open
  }
}

/**
 * Record action for rate limiting
 */
export async function recordAction(action: string): Promise<void> {
  try {
    const key = `${RATE_LIMIT_KEY}_${action}`;
    const stored = await AsyncStorage.getItem(key);
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    let rateLimit: RateLimit = stored
      ? JSON.parse(stored)
      : { action, timestamps: [] };

    // Filter out old timestamps and add new one
    rateLimit.timestamps = rateLimit.timestamps
      .filter(ts => ts > oneMinuteAgo)
      .concat([now]);

    await AsyncStorage.setItem(key, JSON.stringify(rateLimit));
  } catch (error) {
    console.error('Error recording action:', error);
  }
}

/**
 * Get current transaction limits status
 */
export async function getTransactionLimitsStatus(): Promise<{
  transactionsToday: number;
  maxTransactionsPerDay: number;
  amountToday: number;
  maxDailyAmount: number;
  remaining: {
    transactions: number;
    amount: number;
  };
}> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stored = await AsyncStorage.getItem(TRANSACTION_LIMIT_KEY);
    
    let limit: TransactionLimit = stored
      ? JSON.parse(stored)
      : { date: today, count: 0, totalAmount: 0 };

    // Reset if new day
    if (limit.date !== today) {
      limit = { date: today, count: 0, totalAmount: 0 };
    }

    return {
      transactionsToday: limit.count,
      maxTransactionsPerDay: MAX_TRANSACTIONS_PER_DAY,
      amountToday: limit.totalAmount,
      maxDailyAmount: parseFloat(MAX_DAILY_AMOUNT),
      remaining: {
        transactions: MAX_TRANSACTIONS_PER_DAY - limit.count,
        amount: parseFloat(MAX_DAILY_AMOUNT) - limit.totalAmount,
      },
    };
  } catch (error) {
    console.error('Error getting transaction limits status:', error);
    return {
      transactionsToday: 0,
      maxTransactionsPerDay: MAX_TRANSACTIONS_PER_DAY,
      amountToday: 0,
      maxDailyAmount: parseFloat(MAX_DAILY_AMOUNT),
      remaining: {
        transactions: MAX_TRANSACTIONS_PER_DAY,
        amount: parseFloat(MAX_DAILY_AMOUNT),
      },
    };
  }
}

/**
 * Reset all limits (for testing/admin purposes)
 */
export async function resetLimits(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TRANSACTION_LIMIT_KEY);
    
    // Clear all rate limit keys
    const allKeys = await AsyncStorage.getAllKeys();
    const rateLimitKeys = allKeys.filter(key => key.startsWith(RATE_LIMIT_KEY));
    await AsyncStorage.multiRemove(rateLimitKeys);
    
    console.log('All limits reset');
  } catch (error) {
    console.error('Error resetting limits:', error);
  }
}
