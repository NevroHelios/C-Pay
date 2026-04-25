import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { PINInput } from './PINInput';

interface PINDialogProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (pin: string) => void;
  title?: string;
  message?: string;
}

export const PINDialog: React.FC<PINDialogProps> = ({
  visible,
  onCancel,
  onConfirm,
  title = 'Enter PIN',
  message = 'Enter your 6-digit PIN to confirm',
}) => {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPin('');
      setSubmitting(false);
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible]);

  const handleSubmit = (pinToSubmit = pin) => {
    if (pinToSubmit.length === 6 && !submitting) {
      setSubmitting(true);
      onConfirm(pinToSubmit);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.dialog,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <PINInput
            value={pin}
            onChange={setPin}
            onComplete={handleSubmit}
            autoFocus={visible}
            disabled={submitting}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                (pin.length !== 6 || submitting) && styles.buttonDisabled,
              ]}
              onPress={() => handleSubmit()}
              disabled={pin.length !== 6 || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    width: '90%',
    maxWidth: 400,
    ...SHADOWS.lg,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  message: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    marginHorizontal: SPACING.xs,
  },
  cancelButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  confirmButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textInverse,
  },
});
