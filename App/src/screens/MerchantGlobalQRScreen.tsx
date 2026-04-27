import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import { getMerchantProfile } from '../services/merchant';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { AlertManager } from '../utils/alert';
import { formatWalletFingerprint, getCurrentMerchantCPayId } from '../utils/cpayId';
import { generatePaymentQRWithId } from '../utils/qrCode';
import { getMediaLibraryDownloadErrorMessage, requestPhotoSavePermission } from '../utils/mediaLibrary';

const FONT_SIZES = TYPOGRAPHY.sizes;
const DEFAULT_MERCHANT_LOGO = require('../../assets/default-merchant-image-cryptopay.png');

interface MerchantGlobalQRScreenProps {
  navigation: any;
}

export const MerchantGlobalQRScreen: React.FC<MerchantGlobalQRScreenProps> = ({
  navigation,
}) => {
  const [loading, setLoading] = useState(true);
  const [qrValue, setQRValue] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [cpayId, setCpayId] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const qrRef = useRef<any>(null);
  const viewShotRef = useRef<ViewShot>(null);

  useEffect(() => {
    loadMerchantQR();
  }, []);

  const loadMerchantQR = async () => {
    try {
      const address = await AsyncStorage.getItem('wallet_address');
      if (!address) {
        AlertManager.alert('Error', 'Wallet address not found');
        return;
      }

      const profile = await getMerchantProfile(address);
      if (profile) {
        setBusinessName(profile.business_name);
        setWalletAddress(address);
        
        // Load Merchant C-Pay ID from merchants table
        const id = await getCurrentMerchantCPayId();
        if (id) {
          setCpayId(id);
        }
        
        if (profile.logo_url && profile.logo_url !== 'default-merchant-logo') {
          setLogoUrl(profile.logo_url);
        }

        const qrData = generatePaymentQRWithId(
          profile.id || address,
          '0',
          profile.business_name,
          address,
          ''
        );

        setQRValue(qrData);
      }
    } catch (error) {
      console.error('Error loading merchant QR:', error);
      AlertManager.alert('Error', 'Failed to load merchant QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(cpayId || formatWalletFingerprint(walletAddress));
    // Silent copy - no alert
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Pay ${businessName}\nC-Pay ID: ${cpayId || formatWalletFingerprint(walletAddress)}\n\nScan my QR code in C-Pay app to send payment instantly!`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleDownloadQR = async () => {
    try {
      if (viewShotRef.current && viewShotRef.current.capture) {
        const uri = await viewShotRef.current.capture();
        const filename = `${businessName.replace(/\s+/g, '_')}_QR.png`;
        
        // Request permission to save to media library
        const hasPermission = await requestPhotoSavePermission();
        if (!hasPermission) {
          AlertManager.alert('Permission Required', 'Please grant permission to save images to your device');
          return;
        }

        // Save to media library
        await MediaLibrary.saveToLibraryAsync(uri);
        AlertManager.alert('Success', 'QR Code saved to your gallery!');
      }
    } catch (error) {
      console.error('Error downloading QR:', error);
      AlertManager.alert('Error', getMediaLibraryDownloadErrorMessage(error));
    }
  };

  const handleShareQRImage = async () => {
    try {
      if (viewShotRef.current && viewShotRef.current.capture) {
        const uri = await viewShotRef.current.capture();
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Share ${businessName} QR Code`,
          });
        }
      }
    } catch (error) {
      console.error('Error sharing QR image:', error);
      AlertManager.alert('Error', 'Failed to share QR code');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Payment QR</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }}>
          <View style={styles.qrCard}>
            <View style={styles.infoCard}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.businessLogo} onError={() => setLogoUrl(null)} />
              ) : (
                <Image source={DEFAULT_MERCHANT_LOGO} style={styles.businessLogo} />
              )}
              <Text style={styles.businessName}>{businessName}</Text>
              <Text style={styles.subtitle}>
                Show this QR code to receive payments
              </Text>
            </View>

            {/* QR Code */}
            <View style={styles.qrContainer}>
              <View style={styles.qrBox}>
                {qrValue && (
                  <QRCode
                    value={qrValue}
                    size={220}
                    logo={require('../../assets/cpay_logo.png')}
                    logoSize={45}
                    logoBackgroundColor="white"
                    logoMargin={2}
                    getRef={(ref) => (qrRef.current = ref)}
                  />
                )}
              </View>
            </View>
          </View>
        </ViewShot>

        {/* Action Buttons */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleShareQRImage}
          >
            <Ionicons name="share-social-outline" size={22} color={COLORS.card} />
            <Text style={styles.actionBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleDownloadQR}
          >
            <Ionicons name="download-outline" size={22} color={COLORS.card} />
            <Text style={styles.actionBtnText}>Download</Text>
          </TouchableOpacity>
        </View>

        {/* C-Pay ID */}
        <View style={styles.walletCard}>
          <Text style={styles.walletLabel}>C-Pay ID</Text>
          <TouchableOpacity
            style={styles.walletAddressContainer}
            onPress={handleCopyAddress}
          >
            <Text style={styles.walletAddress} numberOfLines={1}>
              {cpayId || formatWalletFingerprint(walletAddress)}
            </Text>
            <Ionicons name="copy-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl * 2,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  shareButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
  qrCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  infoCard: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  businessLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  businessIcon: {
    fontSize: 36,
    marginBottom: SPACING.xs,
  },
  businessName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  qrBox: {
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
    gap: SPACING.xs,
  },
  actionBtnText: {
    color: COLORS.card,
    fontWeight: '600',
    fontSize: FONT_SIZES.sm,
  },
  walletCard: {
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  walletLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  walletAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontFamily: 'monospace',
    flex: 1,
    marginRight: SPACING.sm,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: SPACING.xl,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
  },
  shareButtonFull: {
    backgroundColor: COLORS.primary,
  },
  actionButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.card,
    marginLeft: SPACING.sm,
  },
});
