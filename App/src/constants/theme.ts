// Professional design system for C-Pay.
// Quiet fintech palette with strong contrast and restrained surfaces.

export const COLORS = {
  // Primary brand
  primary: '#2563EB',
  primaryDark: '#1E40AF',
  primaryLight: '#DBEAFE',
  primaryGradient: ['#2563EB', '#0F766E'],
  
  // Secondary accents
  secondary: '#0F766E',
  accent: '#F97316',
  
  // Status Colors - Optimized for clarity
  success: '#059669',
  successLight: '#D1FAE5',
  successDark: '#047857',
  successBg: '#ECFDF5',
  
  error: '#DC2626',
  errorLight: '#FEE2E2',
  errorDark: '#991B1B',
  errorBg: '#FEF2F2',
  
  warning: '#D97706',
  warningLight: '#FEF3C7',
  warningDark: '#92400E',
  warningBg: '#FFFBEB',
  
  info: '#0284C7',
  infoLight: '#E0F2FE',
  infoDark: '#075985',
  infoBg: '#F0F9FF',
  
  // Neutral Palette - Sophisticated grays
  background: '#F6F8FB',
  backgroundDark: '#E5E7EB',
  
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  
  card: '#FFFFFF',
  cardHover: '#F5F6F7',
  
  border: '#DDE3EA',
  borderLight: '#EEF2F6',
  borderDark: '#CBD5E1',
  
  // Text Colors - High contrast for readability
  text: '#111827',
  textPrimary: '#111827',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  textDisabled: '#CBD5E1',
  textInverse: '#FFFFFF',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  
  // Shadows (iOS-style)
  shadow: '#000000',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const TYPOGRAPHY = {
  // Font sizes
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 40,
  },
  
  // Font weights
  weights: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
  
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// Alias for backward compatibility
export const FONT_SIZES = TYPOGRAPHY.sizes;

export const BORDER_RADIUS = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 9999,
};

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  xl: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const ANIMATION = {
  duration: {
    fast: 150,
    normal: 250,
    slow: 350,
  },
  easing: {
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
};

export const BLOCKCHAIN_CONFIG = {
  NETWORK: process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'testnet',
  HORIZON_URL: process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  RELAYER_URL: process.env.EXPO_PUBLIC_STELLAR_RELAYER_URL || '',
  CPINR_ASSET_CODE: process.env.EXPO_PUBLIC_CPINR_ASSET_CODE || 'CPINR',
  CPINR_ASSET_ISSUER: process.env.EXPO_PUBLIC_CPINR_ASSET_ISSUER || '',
  EXPLORER_URL: process.env.EXPO_PUBLIC_STELLAR_EXPLORER_URL || 'https://stellar.expert/explorer/testnet',
};

// Helper function for gradient backgrounds
export const getGradient = (colors: string[]) => {
  return {
    colors,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  };
};

// Export the design system
export const theme = {
  colors: COLORS,
  spacing: SPACING,
  typography: TYPOGRAPHY,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS,
  animation: ANIMATION,
};

export default theme;
