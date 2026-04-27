import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSessionPin } from './wallet';

// Rate limiting constants
const MAX_OTP_ATTEMPTS_PER_DAY = 10;
const OTP_RATE_LIMIT_KEY = 'otp_rate_limit';

interface OTPRateLimit {
  attempts: number;
  lastAttempt: string; // ISO date string
  resetDate: string; // ISO date string
}

/**
 * Check if user has exceeded OTP rate limit
 */
async function checkRateLimit(): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  resetTime?: Date;
}> {
  try {
    const rateLimitData = await AsyncStorage.getItem(OTP_RATE_LIMIT_KEY);
    const now = new Date();
    
    if (!rateLimitData) {
      return { allowed: true, remainingAttempts: MAX_OTP_ATTEMPTS_PER_DAY };
    }

    const rateLimit: OTPRateLimit = JSON.parse(rateLimitData);
    const resetDate = new Date(rateLimit.resetDate);

    // Check if we need to reset (new day)
    if (now >= resetDate) {
      await AsyncStorage.removeItem(OTP_RATE_LIMIT_KEY);
      return { allowed: true, remainingAttempts: MAX_OTP_ATTEMPTS_PER_DAY };
    }

    // Check if limit exceeded
    if (rateLimit.attempts >= MAX_OTP_ATTEMPTS_PER_DAY) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: resetDate,
      };
    }

    return {
      allowed: true,
      remainingAttempts: MAX_OTP_ATTEMPTS_PER_DAY - rateLimit.attempts,
    };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    return { allowed: true, remainingAttempts: MAX_OTP_ATTEMPTS_PER_DAY };
  }
}

/**
 * Increment OTP attempt counter
 */
async function incrementAttempt(): Promise<void> {
  try {
    const rateLimitData = await AsyncStorage.getItem(OTP_RATE_LIMIT_KEY);
    const now = new Date();
    
    // Calculate reset time (midnight of next day)
    const resetDate = new Date(now);
    resetDate.setHours(24, 0, 0, 0);

    let rateLimit: OTPRateLimit;

    if (!rateLimitData) {
      rateLimit = {
        attempts: 1,
        lastAttempt: now.toISOString(),
        resetDate: resetDate.toISOString(),
      };
    } else {
      const existing: OTPRateLimit = JSON.parse(rateLimitData);
      rateLimit = {
        attempts: existing.attempts + 1,
        lastAttempt: now.toISOString(),
        resetDate: existing.resetDate,
      };
    }

    await AsyncStorage.setItem(OTP_RATE_LIMIT_KEY, JSON.stringify(rateLimit));
  } catch (error) {
    console.error('Error incrementing attempt:', error);
  }
}

/**
 * Send OTP to phone number using Supabase
 */
export async function sendOTP(phoneNumber: string): Promise<{
  success: boolean;
  verificationId?: string;
  error?: string;
  remainingAttempts?: number;
  resetTime?: Date;
}> {
  try {
    // Check rate limit first
    const rateLimitCheck = await checkRateLimit();
    
    if (!rateLimitCheck.allowed) {
      const resetTime = rateLimitCheck.resetTime!;
      const hours = Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60 * 60));
      return {
        success: false,
        error: `Too many OTP requests. Please try again in ${hours} hour${hours > 1 ? 's' : ''}.`,
        remainingAttempts: 0,
        resetTime: resetTime,
      };
    }

    // Production: Use Supabase phone auth
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phoneNumber,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
        remainingAttempts: rateLimitCheck.remainingAttempts,
      };
    }

    // Increment attempt after successful send
    await incrementAttempt();

    return {
      success: true,
      verificationId: phoneNumber, // Supabase uses phone number as identifier
      remainingAttempts: rateLimitCheck.remainingAttempts - 1,
    };
  } catch (error: any) {
    console.error('Send OTP error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send OTP',
    };
  }
}

/**
 * Send an email OTP for the current login/onboarding verification flow.
 * This keeps the existing app-level OTP request limit while phone OTP is paused.
 */
export async function sendLoginEmailOTP(email: string): Promise<{
  success: boolean;
  verificationId?: string;
  error?: string;
  remainingAttempts?: number;
  resetTime?: Date;
}> {
  try {
    const rateLimitCheck = await checkRateLimit();

    if (!rateLimitCheck.allowed) {
      const resetTime = rateLimitCheck.resetTime!;
      const hours = Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60 * 60));
      return {
        success: false,
        error: `Too many verification code requests. Please try again in ${hours} hour${hours > 1 ? 's' : ''}.`,
        remainingAttempts: 0,
        resetTime,
      };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      return {
        success: false,
        error: error.message,
        remainingAttempts: rateLimitCheck.remainingAttempts,
      };
    }

    await incrementAttempt();

    return {
      success: true,
      verificationId: email,
      remainingAttempts: rateLimitCheck.remainingAttempts - 1,
    };
  } catch (error: any) {
    console.error('Send login email OTP error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email OTP',
    };
  }
}

/**
 * Verify the email OTP used for login/onboarding verification.
 */
export async function verifyLoginEmailOTP(
  verificationId: string,
  otpCode: string
): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: verificationId,
      token: otpCode,
      type: 'email',
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      email: data.user?.email || verificationId,
    };
  } catch (error: any) {
    console.error('Verify login email OTP error:', error);
    return {
      success: false,
      error: error.message || 'Invalid email OTP code',
    };
  }
}

/**
 * Verify OTP code using Supabase
 */
export async function verifyOTP(
  verificationId: string,
  otpCode: string
): Promise<{
  success: boolean;
  phoneNumber?: string;
  error?: string;
}> {
  try {
    // Production: Verify with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      phone: verificationId,
      token: otpCode,
      type: 'sms',
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      phoneNumber: data.user?.phone || verificationId,
    };
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    return {
      success: false,
      error: error.message || 'Invalid OTP code',
    };
  }
}

/**
 * Get remaining OTP attempts for the day
 */
export async function getRemainingAttempts(): Promise<{
  remaining: number;
  resetTime?: Date;
}> {
  const rateLimitCheck = await checkRateLimit();
  return {
    remaining: rateLimitCheck.remainingAttempts,
    resetTime: rateLimitCheck.resetTime,
  };
}

/**
 * Sign out from Supabase
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  await AsyncStorage.multiRemove([
    'auth_token',
    'phone_verified',
    'phone_number',
    'email_verified',
    'user_email',
  ]);
  clearSessionPin();
}

/**
 * Send OTP to email address (for merchant registration)
 */
export async function sendEmailOTP(email: string): Promise<{
  success: boolean;
  verificationId?: string;
  error?: string;
}> {
  try {
    // Production: Send email OTP via Supabase
    // Note: This requires setting up email templates in Supabase dashboard
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: true,
      }
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      verificationId: email,
    };
  } catch (error: any) {
    console.error('Send email OTP error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email OTP',
    };
  }
}

/**
 * Verify email OTP (for merchant registration)
 */
export async function verifyEmailOTP(
  verificationId: string,
  otpCode: string
): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  try {
    // Production: Verify with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      email: verificationId,
      token: otpCode,
      type: 'email',
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      email: data.user?.email || verificationId,
    };
  } catch (error: any) {
    console.error('Verify email OTP error:', error);
    return {
      success: false,
      error: error.message || 'Invalid email OTP code',
    };
  }
}

/**
 * Send OTP to phone number when an SMS provider is configured
 */
export async function sendPhoneOTP(phoneNumber: string): Promise<{
  success: boolean;
  verificationId?: string;
  error?: string;
}> {
  try {
    // Production: Use existing sendOTP function
    const result = await sendOTP(phoneNumber);
    return result;
  } catch (error: any) {
    console.error('Send phone OTP error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send phone OTP',
    };
  }
}

/**
 * Verify phone OTP when an SMS provider is configured
 */
export async function verifyPhoneOTP(
  verificationId: string,
  otpCode: string
): Promise<{
  success: boolean;
  phoneNumber?: string;
  error?: string;
}> {
  try {
    // Production: Use existing verifyOTP function
    const result = await verifyOTP(verificationId, otpCode);
    return result;
  } catch (error: any) {
    console.error('Verify phone OTP error:', error);
    return {
      success: false,
      error: error.message || 'Invalid phone OTP code',
    };
  }
}
