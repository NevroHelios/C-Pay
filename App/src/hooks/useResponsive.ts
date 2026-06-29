import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { SPACING } from '../constants/theme';

/**
 * Breakpoints tuned for phones. Most Android/iOS phones fall between 320 and 430
 * points wide. Anything >= 600 is treated as a tablet / large surface.
 */
export const BREAKPOINTS = {
  small: 360, // iPhone SE, compact Androids
  large: 414, // Pro Max / large Androids
  tablet: 600,
};

export interface Responsive {
  width: number;
  height: number;
  /** Narrow devices where horizontal space is tight (< 360pt). */
  isSmall: boolean;
  /** Large phones (>= 414pt). */
  isLarge: boolean;
  /** Tablets and very wide surfaces (>= 600pt). */
  isTablet: boolean;
  /** Recommended horizontal screen padding for the current width. */
  gutter: number;
  /** The max content width so layouts don't stretch awkwardly on tablets. */
  maxContentWidth: number;
  /**
   * Mildly scales a base size for very small or very large screens so that
   * hero numbers/titles don't overflow on small phones. Clamped to keep text
   * readable and prevent layout breakage.
   */
  scale: (size: number) => number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isSmall = width < BREAKPOINTS.small;
    const isLarge = width >= BREAKPOINTS.large;
    const isTablet = width >= BREAKPOINTS.tablet;

    const gutter = isTablet ? SPACING.xl : isSmall ? SPACING.md : SPACING.lg;

    // Scale relative to a 390pt baseline (iPhone 14), clamped to [0.88, 1.12]
    // so large hero text never overflows small screens and stays sensible on
    // big ones.
    const ratio = Math.min(1.12, Math.max(0.88, width / 390));
    const scale = (size: number) => Math.round(size * ratio);

    return {
      width,
      height,
      isSmall,
      isLarge,
      isTablet,
      gutter,
      maxContentWidth: isTablet ? 560 : width,
      scale,
    };
  }, [width, height]);
}
