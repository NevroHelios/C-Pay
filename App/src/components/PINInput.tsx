import React, { useEffect, useRef, useCallback, useState, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS, SHADOWS } from '../constants/theme';

const FONT_SIZES = TYPOGRAPHY.sizes;

const PIN_LENGTH = 6;

interface PINInputProps {
  value: string;
  onChange: (pin: string) => void;
  onComplete?: (pin: string) => void;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export const PINInput: React.FC<PINInputProps> = memo(({
  value,
  onChange,
  onComplete,
  error,
  autoFocus = false,
  disabled = false,
}) => {
  const inputRef = useRef<TextInput | null>(null);
  const lastCompletedPin = useRef('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (autoFocus && !disabled) {
      const timeout = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timeout);
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (value.length === PIN_LENGTH && value !== lastCompletedPin.current) {
      lastCompletedPin.current = value;
      onComplete?.(value);
    }
    if (value.length < PIN_LENGTH) {
      lastCompletedPin.current = '';
    }
  }, [value, onComplete]);

  const handleChange = useCallback((text: string) => {
    onChange(text.replace(/\D/g, '').slice(0, PIN_LENGTH));
  }, [onChange]);

  return (
    <View style={styles.container}>
      <View style={styles.pinContainer}>
        <View style={styles.pinVisualLayer} pointerEvents="none">
          {Array.from({ length: PIN_LENGTH }).map((_, index) => {
            const isActive =
              isFocused &&
              !disabled &&
              !error &&
              (value.length === index || (value.length === PIN_LENGTH && index === PIN_LENGTH - 1));
            const isFilled = Boolean(value[index]);

            return (
              <View
                key={index}
                style={[
                  styles.pinBox,
                  error && styles.pinBoxError,
                  isFilled && styles.pinBoxFilled,
                  isActive && styles.pinBoxFocused,
                  disabled && styles.pinBoxDisabled,
                ]}
              >
                {isFilled && <View style={[styles.pinDot, error && styles.pinDotError]} />}
              </View>
            );
          })}
        </View>

        <TextInput
          ref={inputRef}
          style={styles.nativeInput}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          keyboardType="number-pad"
          textContentType="none"
          autoComplete="off"
          importantForAutofill="no"
          maxLength={PIN_LENGTH}
          secureTextEntry
          caretHidden
          showSoftInputOnFocus
          selectionColor="transparent"
          editable={!disabled}
          accessibilityLabel="PIN input"
        />
      </View>

      {error && (
        <View style={styles.messageContainer}>
          <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  pinContainer: {
    width: '100%',
    maxWidth: 360,
    minHeight: 58,
    position: 'relative',
  },
  pinVisualLayer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  pinBox: {
    flex: 1,
    maxWidth: 52,
    minWidth: 42,
    height: 58,
    marginHorizontal: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    ...SHADOWS.sm,
  },
  pinBoxFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  pinBoxFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  pinBoxError: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorBg,
  },
  pinBoxDisabled: {
    opacity: 0.9,
  },
  nativeInput: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 1,
    lineHeight: 1,
    padding: 0,
    textAlign: 'center',
  },
  pinDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: COLORS.primary,
  },
  pinDotError: {
    backgroundColor: COLORS.error,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    minHeight: 24,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  errorText: {
    flexShrink: 1,
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
});
