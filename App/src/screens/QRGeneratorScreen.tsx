import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { generatePaymentQR } from '../utils/qrCode';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { MONEY_UNIT_LABEL } from '../utils/currency';

const FONT_SIZES = TYPOGRAPHY.sizes;

interface QRGeneratorScreenProps {
  navigation: any;
}

export const QRGeneratorScreen: React.FC<QRGeneratorScreenProps> = ({ navigation }) => {
  const [merchantName, setMerchantName] = useState('Tea Stall');
  const [amount, setAmount] = useState('10.00');
  const [merchantAddress, setMerchantAddress] = useState('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
  const [note, setNote] = useState('');
  const [qrData, setQrData] = useState('');

  const handleGenerateQR = () => {
    const data = generatePaymentQR(merchantAddress, amount, merchantName, note || undefined);
    setQrData(data);
  };

  // Generate QR on mount with default values
  React.useEffect(() => {
    handleGenerateQR();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>QR Code Generator</Text>
        <Text style={styles.subtitle}>Create a Stellar testnet payment request</Text>
      </View>

      {/* Input Fields */}
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Merchant Name</Text>
          <TextInput
            style={styles.input}
            value={merchantName}
            onChangeText={setMerchantName}
            placeholder="Enter merchant name"
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Amount ({MONEY_UNIT_LABEL})</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="Enter amount"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Merchant Address</Text>
          <TextInput
            style={[styles.input, styles.addressInput]}
            value={merchantAddress}
            onChangeText={setMerchantAddress}
            placeholder="Enter Stellar account"
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Note (Optional)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="Enter note"
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        <TouchableOpacity style={styles.generateButton} onPress={handleGenerateQR}>
          <Text style={styles.generateButtonText}>Generate QR Code</Text>
        </TouchableOpacity>
      </View>

      {/* QR Code Display */}
      {qrData && (
        <View style={styles.qrContainer}>
          <View style={styles.qrCard}>
            <QRCode value={qrData} size={250} />
          </View>
          <View style={styles.instructionRow}>
            <Ionicons name="scan-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.instruction}>Use Scan to Pay on Home screen to test</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    marginTop: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  form: {
    marginBottom: SPACING.xl,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  addressInput: {
    fontFamily: 'monospace',
    fontSize: FONT_SIZES.sm,
  },
  generateButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  generateButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.card,
  },
  qrContainer: {
    alignItems: 'center',
  },
  qrCard: {
    backgroundColor: COLORS.card,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.md,
    marginBottom: SPACING.lg,
  },
  instruction: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
});
