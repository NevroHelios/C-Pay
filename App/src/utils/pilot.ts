const rawPilotMode = process.env.EXPO_PUBLIC_PILOT_MODE;

export const PILOT_MODE = rawPilotMode === undefined
  ? true
  : rawPilotMode.toLowerCase() !== 'false';

export const PILOT_CREDIT_NAME =
  process.env.EXPO_PUBLIC_PILOT_CREDIT_NAME || 'C-Pay pilot credits';

export const PILOT_CREDIT_UNIT =
  process.env.EXPO_PUBLIC_PILOT_CREDIT_UNIT || 'credits';

export const PILOT_CREDIT_SYMBOL =
  process.env.EXPO_PUBLIC_PILOT_CREDIT_SYMBOL || 'Cr';

export const PILOT_ACCESS_CODE =
  process.env.EXPO_PUBLIC_PILOT_ACCESS_CODE?.trim() || '';

export const PILOT_ACCESS_REQUIRED = PILOT_MODE && PILOT_ACCESS_CODE.length > 0;

export const PILOT_NOTICE_TITLE = 'Closed Pilot';

export const PILOT_NOTICE_TEXT =
  'Pilot credits are for testing only. No real INR is stored or transferred.';

export const PILOT_TESTNET_TEXT =
  'Closed pilot on Stellar testnet. Pilot credits have no cash value.';

export function isPilotAccessCodeValid(input: string): boolean {
  if (!PILOT_ACCESS_REQUIRED) {
    return true;
  }

  return input.trim().toLowerCase() === PILOT_ACCESS_CODE.toLowerCase();
}
