import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';

export type InfoBannerVariant = 'info' | 'success' | 'warning' | 'error';

export interface InfoBannerProps {
  variant?: InfoBannerVariant;
  title?: string;
  message: string;
  /** Override the default icon for the variant. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional inline action (e.g. "Retry", "Learn more"). */
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const VARIANT_STYLES: Record<
  InfoBannerVariant,
  { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  info: { bg: COLORS.infoBg, fg: COLORS.info, icon: 'information-circle' },
  success: { bg: COLORS.successBg, fg: COLORS.success, icon: 'checkmark-circle' },
  warning: { bg: COLORS.warningBg, fg: COLORS.warning, icon: 'warning' },
  error: { bg: COLORS.errorBg, fg: COLORS.error, icon: 'alert-circle' },
};

/**
 * Inline contextual banner for info / success / warning / error messaging with
 * a consistent tinted surface, icon and optional inline action. Replaces the
 * many bespoke "info card" blocks across screens.
 */
export const InfoBanner: React.FC<InfoBannerProps> = ({
  variant = 'info',
  title,
  message,
  icon,
  actionLabel,
  onActionPress,
  style,
}) => {
  const v = VARIANT_STYLES[variant];

  return (
    <View style={[styles.container, { backgroundColor: v.bg }, style]}>
      <Ionicons name={icon || v.icon} size={20} color={v.fg} style={styles.icon} />
      <View style={styles.textWrap}>
        {!!title && <Text style={[styles.title, { color: v.fg }]}>{title}</Text>}
        <Text style={styles.message}>{message}</Text>
        {!!actionLabel && !!onActionPress && (
          <TouchableOpacity onPress={onActionPress} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={[styles.action, { color: v.fg }]}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  icon: {
    marginRight: SPACING.sm,
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  action: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
});
