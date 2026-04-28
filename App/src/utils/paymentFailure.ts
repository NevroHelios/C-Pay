type PaymentFailureCopy = {
  errorMessage: string;
  errorReason: string;
  errorCode?: string;
};

const safeNoDeductionText = 'Your pilot credits are safe - no amount was deducted.';

const getErrorText = (error: any): string => {
  const candidates = [
    error?.details?.error,
    error?.details?.message,
    error?.message,
    typeof error === 'string' ? error : '',
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
};

const getErrorCode = (error: any): string | undefined => {
  const code = error?.code || error?.details?.code;
  return typeof code === 'string' && code.trim() ? code.trim() : undefined;
};

export const getPaymentFailureCopy = (error: any): PaymentFailureCopy => {
  const rawMessage = getErrorText(error);
  const lowerMessage = rawMessage.toLowerCase();
  const errorCode = getErrorCode(error);

  if (errorCode === 'AUTH_REQUIRED' || lowerMessage.includes('jwt') || lowerMessage.includes('authentication')) {
    return {
      errorMessage: 'Session Expired',
      errorReason: 'Your email session expired before the payment could be submitted. Sign in again, then retry the payment.',
      errorCode,
    };
  }

  if (errorCode === 'CONTRACT_MERCHANT_MISSING') {
    return {
      errorMessage: 'Merchant Not Ready',
      errorReason: 'This merchant has not finished C-Pay contract setup yet. Ask the merchant to open their app and sync their merchant account before accepting QR payments.',
      errorCode,
    };
  }

  if (errorCode === 'CONTRACT_MERCHANT_INACTIVE') {
    return {
      errorMessage: 'Merchant Inactive',
      errorReason: 'This merchant is currently inactive on C-Pay. Ask the merchant to reactivate their merchant account.',
      errorCode,
    };
  }

  if (errorCode === 'CONTRACT_MERCHANT_MISMATCH') {
    return {
      errorMessage: 'QR Code Mismatch',
      errorReason: 'This merchant QR code does not match the merchant account registered with C-Pay. Ask the merchant to generate a fresh QR code.',
      errorCode,
    };
  }

  if (errorCode === 'CONTRACT_INTENT_SOURCE_MISMATCH') {
    return {
      errorMessage: 'Wallet Mismatch',
      errorReason: 'The payment was signed by a different wallet than the one used to create the payment request. Unlock the correct wallet and try again.',
      errorCode,
    };
  }

  if (errorCode === 'CONTRACT_INTENT_AMOUNT_MISMATCH' || lowerMessage.includes('does not match the contract intent amount')) {
    return {
      errorMessage: 'Payment Amount Changed',
      errorReason: `The QR payment request was created for a different amount than the payment being sent. ${safeNoDeductionText} Ask the merchant to generate a fresh QR code, then try again.`,
      errorCode,
    };
  }

  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('taking too long') ||
    lowerMessage.includes('slow') ||
    errorCode === 'RELAYER_TIMEOUT'
  ) {
    return {
      errorMessage: 'Network Timeout',
      errorReason: `The payment service took too long to respond. ${safeNoDeductionText} Please try again in a few moments.`,
      errorCode,
    };
  }

  if (
    lowerMessage.includes('insufficient') ||
    errorCode === 'STELLAR_OP_UNDERFUNDED' ||
    errorCode === 'STELLAR_TX_INSUFFICIENT_BALANCE'
  ) {
    return {
      errorMessage: 'Insufficient Balance',
      errorReason: 'You do not have enough pilot credits or network balance to complete this payment.',
      errorCode,
    };
  }

  if (
    lowerMessage.includes('not reachable') ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('network') ||
    errorCode === 'RELAYER_UNREACHABLE'
  ) {
    return {
      errorMessage: 'Network Connection Failed',
      errorReason: 'The app could not reach the payment service. Check your internet connection and try again.',
      errorCode,
    };
  }

  if (lowerMessage.includes('temporarily unavailable') || lowerMessage.includes('service unavailable')) {
    return {
      errorMessage: 'Service Unavailable',
      errorReason: `Payment service is temporarily unavailable. ${safeNoDeductionText} Please try again in a few moments.`,
      errorCode,
    };
  }

  if (lowerMessage.includes('fee')) {
    return {
      errorMessage: 'Network Issue',
      errorReason: 'The payment network could not accept the transaction fee. Please try again later.',
      errorCode,
    };
  }

  if (rawMessage) {
    return {
      errorMessage: 'Transaction Failed',
      errorReason: `${rawMessage}. ${safeNoDeductionText}`,
      errorCode,
    };
  }

  return {
    errorMessage: 'Transaction Failed',
    errorReason: `The payment could not be completed. ${safeNoDeductionText} Please try again in a few moments.`,
    errorCode,
  };
};
