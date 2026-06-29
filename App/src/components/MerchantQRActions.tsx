import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

export interface MerchantQRActionsProps {
  onShare: () => void;
  onDownload: () => void;
  /** Optional third action (e.g. "New QR"). */
  onNew?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Consistent Share / Download (/ New) action row shown beneath the shared
 * MerchantQRCard on every merchant QR screen.
 */
export const MerchantQRActions: React.FC<MerchantQRActionsProps> = ({
  onShare,
  onDownload,
  onNew,
  style,
}) => (
  <View style={[styles.row, style]}>
    <ActionButton icon="share-social-outline" label="Share" onPress={onShare} />
    <ActionButton icon="download-outline" label="Download" onPress={onDownload} />
    {onNew && <ActionButton icon="add-outline" label="New QR" onPress={onNew} />}
  </View>
);

const ActionButton: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}> = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.8}>
    <Ionicons name={icon} size={20} color={COLORS.primary} />
    <Text style={styles.label}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
