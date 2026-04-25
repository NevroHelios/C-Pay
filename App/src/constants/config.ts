import Constants from 'expo-constants';

// Get environment variables with fallback to Constants.expoConfig.extra
const getEnvVar = (key: string, fallback: string = ''): string => {
  // Try process.env first (works in development)
  const processEnv = process.env[key];
  if (processEnv) return processEnv;
  
  // Try Constants.expoConfig.extra (works in production builds)
  const extraConfig = Constants.expoConfig?.extra?.[key];
  if (extraConfig) return extraConfig;
  
  return fallback;
};

export const STELLAR_CONFIG = {
  NETWORK: getEnvVar('EXPO_PUBLIC_STELLAR_NETWORK', 'testnet'),
  HORIZON_URL: getEnvVar('EXPO_PUBLIC_STELLAR_HORIZON_URL', 'https://horizon-testnet.stellar.org'),
  NETWORK_PASSPHRASE: getEnvVar('EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015'),
  RELAYER_URL: getEnvVar('EXPO_PUBLIC_STELLAR_RELAYER_URL', 'http://localhost:3000'),
  CPINR_ASSET_CODE: getEnvVar('EXPO_PUBLIC_CPINR_ASSET_CODE', 'CPINR'),
  CPINR_ASSET_ISSUER: getEnvVar('EXPO_PUBLIC_CPINR_ASSET_ISSUER', ''),
  EXPLORER_URL: getEnvVar('EXPO_PUBLIC_STELLAR_EXPLORER_URL', 'https://stellar.expert/explorer/testnet'),
  BASE_FEE: getEnvVar('EXPO_PUBLIC_STELLAR_BASE_FEE', '100'),
};

export const BLOCKCHAIN_CONFIG = STELLAR_CONFIG;
export const CONFIG = STELLAR_CONFIG;

// Theme
export const COLORS = {
  primary: '#667eea',
  success: '#00C853',
  error: '#FF1744',
  warning: '#FFB300',
  background: '#F5F5F5',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#757575',
  border: '#E0E0E0',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};
