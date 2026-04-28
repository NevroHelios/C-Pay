import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Switch,
  Image,
  Share,
  Linking,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { isMerchant, getMerchantProfile, merchantEvents } from '../services/merchant';
import { supabase } from '../services/supabase';
import { isBiometricAvailable, getBiometricType, enableBiometric, getAuthenticatedWallet } from '../utils/biometric';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { Card, Button } from '../components';
import { AlertManager } from '../utils/alert';
import { formatWalletFingerprint, getCurrentUserCPayId } from '../utils/cpayId';
import { getMediaLibraryDownloadErrorMessage, requestPhotoSavePermission } from '../utils/mediaLibrary';
import { clearBiometricBackup, clearSessionPin, hasBiometricBackup } from '../services/wallet';
import { getExplorerUrl } from '../services/blockchain';
import { generatePaymentQR } from '../utils/qrCode';

interface ProfileScreenProps {
  navigation: any;
}

type ExportedKey = {
  title: string;
  description: string;
  value: string;
  valueLabel: string;
  warning: string;
};

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [cpayId, setCpayId] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [merchantStatus, setMerchantStatus] = useState<boolean>(false);
  const [businessName, setBusinessName] = useState<string>('');
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(false);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean>(false);
  const [biometricSaving, setBiometricSaving] = useState<boolean>(false);
  const [biometricType, setBiometricType] = useState<string>('Biometric');
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState<boolean>(false);
  const [exportedKey, setExportedKey] = useState<ExportedKey | null>(null);
  const [showExportedKey, setShowExportedKey] = useState(false);
  const qrCodeRef = useRef<any>(null);
  const biometricSavingRef = useRef(false);

  useEffect(() => {
    loadWalletAddress();
    loadCPayId();
    loadDisplayName();
    checkMerchantStatus();
    loadSettings();
    loadProfilePhoto();
    
    // Listen for merchant registration events (real-time updates)
    const merchantListener = () => {
      console.log('📡 Received merchantRegistered event, refreshing status...');
      checkMerchantStatus();
    };
    
    merchantEvents.on('merchantRegistered', merchantListener);
    console.log('🎯 Subscribed to merchantRegistered events');
    
    // Cleanup on unmount
    return () => {
      merchantEvents.off('merchantRegistered', merchantListener);
      console.log('🚫 Unsubscribed from merchantRegistered events');
    };
  }, []);

  // Refresh all profile data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('🔄 ProfileScreen focused - refreshing all data');
      loadCPayId();
      loadDisplayName();
      checkMerchantStatus();
      loadProfilePhoto();
      loadSettings();
    }, [])
  );

  const loadWalletAddress = async () => {
    const address = await AsyncStorage.getItem('wallet_address');
    if (address) {
      setWalletAddress(address);
    }
  };

  const loadCPayId = async () => {
    const id = await getCurrentUserCPayId();
    if (id) {
      setCpayId(id);
    }
  };

  const loadDisplayName = async () => {
    try {
      const address = await AsyncStorage.getItem('wallet_address');
      if (!address) return;

      // Fetch display name from database first
      const { data, error } = await supabase
        .from('users')
        .select('display_name')
        .eq('wallet_address', address)
        .single();

      if (!error && data?.display_name) {
        setDisplayName(data.display_name);
        // Save to AsyncStorage for offline access
        await AsyncStorage.setItem('display_name', data.display_name);
      } else {
        // Fallback to local storage
        const localName = await AsyncStorage.getItem('display_name');
        if (localName) {
          setDisplayName(localName);
        }
      }
    } catch (error) {
      console.error('Error loading display name:', error);
      // Fallback to AsyncStorage
      const localName = await AsyncStorage.getItem('display_name');
      if (localName) {
        setDisplayName(localName);
      }
    }
  };

  const syncBiometricPreference = (enabled: boolean) => {
    void (async () => {
      try {
        const address = await AsyncStorage.getItem('wallet_address');
        if (!address) {
          return;
        }

        const { error } = await supabase
          .from('users')
          .update({ biometric_enabled: enabled })
          .eq('wallet_address', address);

        if (error) {
          console.log('Failed to sync biometric preference:', error);
        }
      } catch (error) {
        console.log('Failed to sync biometric preference:', error);
      }
    })();
  };

  const loadSettings = async () => {
    const [biometricSetting, available, type, backupAvailable, notifSetting] = await Promise.all([
      AsyncStorage.getItem('biometric_enabled'),
      isBiometricAvailable(),
      getBiometricType(),
      hasBiometricBackup(),
      AsyncStorage.getItem('notifications_enabled'),
    ]);

    setBiometricType(type);
    setBiometricAvailable(available);

    if (!biometricSavingRef.current) {
      const biometricReady = biometricSetting === 'true' && available && backupAvailable;
      setBiometricEnabled(biometricReady);

      if (biometricSetting === 'true' && !biometricReady) {
        await AsyncStorage.setItem('biometric_enabled', 'false');
        syncBiometricPreference(false);
      }
    }

    setNotificationsEnabled(notifSetting !== 'false');
  };

  const loadProfilePhoto = async () => {
    try {
      const address = await AsyncStorage.getItem('wallet_address');
      if (!address) return;

      // Fetch profile photo URL from database
      const { data, error } = await supabase
        .from('users')
        .select('profile_photo_url')
        .eq('wallet_address', address)
        .single();

      if (!error && data?.profile_photo_url) {
        setProfilePhoto(data.profile_photo_url);
      } else {
        // Fallback to local storage for backwards compatibility
        const localPhoto = await AsyncStorage.getItem('profile_photo');
        if (localPhoto) {
          setProfilePhoto(localPhoto);
        }
      }
    } catch (error) {
      console.error('Error loading profile photo:', error);
    }
  };

  const checkMerchantStatus = async () => {
    const address = await AsyncStorage.getItem('wallet_address');
    if (address) {
      const isMerch = await isMerchant(address);
      setMerchantStatus(isMerch);
      if (isMerch) {
        const profile = await getMerchantProfile(address);
        if (profile) {
          setBusinessName(profile.business_name);
        }
      }
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        AlertManager.alert('Permission Required', 'Please allow access to your photos to change your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0]) {
        const photoUri = result.assets[0].uri;
        
        // Show uploading state
        AlertManager.alert('Uploading', 'Uploading your profile photo...');
        
        // Upload to Supabase Storage
        const uploaded = await uploadProfilePhoto(photoUri);
        
        if (uploaded) {
          setProfilePhoto(uploaded);
          AlertManager.alert('Success', 'Profile photo updated and synced to cloud!');
        } else {
          // Fallback to local storage if upload fails
          setProfilePhoto(photoUri);
          await AsyncStorage.setItem('profile_photo', photoUri);
          AlertManager.alert('Saved Locally', 'Photo saved on device. Cloud sync unavailable.');
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      AlertManager.alert('Error', 'Failed to update profile photo');
    }
  };

  const uploadProfilePhoto = async (photoUri: string): Promise<string | null> => {
    try {
      const address = await AsyncStorage.getItem('wallet_address');
      if (!address) {
        console.error('No wallet address found');
        return null;
      }

      console.log('Starting upload for:', photoUri);

      // Read file as base64 for React Native compatibility
      const base64 = await fetch(photoUri)
        .then(res => res.blob())
        .then(blob => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result as string;
              // Remove data:image/xxx;base64, prefix
              resolve(base64data.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        });

      // Create unique filename
      const fileExt = photoUri.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${address.substring(0, 8)}_${Date.now()}.${fileExt}`;
      const filePath = `profile-photos/${fileName}`;

      console.log('Uploading to path:', filePath);

      // Convert base64 to array buffer for upload
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, bytes.buffer, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error details:', uploadError);
        console.error('Error message:', uploadError.message);
        console.error('Error name:', uploadError.name);
        return null;
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      console.log('Public URL:', publicUrl);

      // Update database with photo URL
      const { error: dbError } = await supabase
        .from('users')
        .update({ profile_photo_url: publicUrl })
        .eq('wallet_address', address);

      if (dbError) {
        console.error('Database update error:', dbError);
        // Still return URL even if DB update fails
      }

      // Also save locally for offline access
      await AsyncStorage.setItem('profile_photo', publicUrl);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      return null;
    }
  };

  const handleCopyAddress = async () => {
    const idToCopy = cpayId || formatWalletFingerprint(walletAddress);
    await Clipboard.setStringAsync(idToCopy);
  };

  const handleShareAddress = async () => {
    try {
      await Share.share({
        message: `My C-Pay ID:\n${cpayId || formatWalletFingerprint(walletAddress)}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleViewOnExplorer = () => {
    const explorerUrl = getExplorerUrl('account', walletAddress);
    Linking.openURL(explorerUrl);
  };

  const formatRawPrivateKey = (bytes: Uint8Array): string => (
    Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  );

  const maskKey = (value: string): string => {
    if (value.length <= 12) {
      return '•'.repeat(value.length);
    }

    return `${value.slice(0, 4)}${'•'.repeat(12)}${value.slice(-6)}`;
  };

  const handleCopyExportedKey = async () => {
    if (!exportedKey) {
      return;
    }

    await Clipboard.setStringAsync(exportedKey.value);
    AlertManager.alert('Copied', `${exportedKey.title} copied to clipboard.`, undefined, { type: 'success' });
  };

  const handleCloseExportedKey = () => {
    setExportedKey(null);
    setShowExportedKey(false);
  };

  const handleShowWalletAddress = () => {
    if (!walletAddress) {
      AlertManager.alert('Not Available', 'Wallet address is not available yet.');
      return;
    }

    setExportedKey({
      title: 'Wallet Address',
      description: 'Your public Stellar account address. Use this only when another Stellar app or exchange asks for it.',
      value: walletAddress,
      valueLabel: 'Address',
      warning: 'For normal C-Pay payments, share your C-Pay ID instead of this wallet address.',
    });
    setShowExportedKey(true);
  };

  const handleExportWalletKey = async (type: 'private' | 'stellar') => {
    const wallet = await getAuthenticatedWallet(
      'Export Wallet Key',
      'Enter your C-Pay PIN to export this key',
      'Export wallet key'
    );

    if (!wallet) {
      AlertManager.alert('Authentication Required', 'Unlock your wallet with PIN or biometric to export keys.');
      return;
    }

    const isPrivateKey = type === 'private';
    const value = isPrivateKey
      ? formatRawPrivateKey(wallet.keypair.rawSecretKey())
      : wallet.secret;

    setExportedKey({
      title: isPrivateKey ? 'Private Key' : 'Stellar Secret Key',
      description: isPrivateKey
        ? 'Raw Ed25519 private seed in hex format.'
        : 'Importable Stellar secret seed. This starts with S.',
      valueLabel: 'Key',
      value,
      warning: isPrivateKey
        ? 'Anyone with this private key can control your C-Pay wallet.'
        : 'Anyone with this Stellar secret key can control your C-Pay wallet.',
    });
    setShowExportedKey(false);
  };

  const handleShowQRCode = () => {
    setShowQRCode(!showQRCode);
  };

  const handleShareQRCode = async () => {
    try {
      if (qrCodeRef.current) {
        // Capture QR code as image
        const uri = await qrCodeRef.current.capture();
        
        const message = 'Scan this QR code to send me pilot credits on C-Pay.';
        
        // Use expo-sharing for reliable image sharing on both platforms
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: message,
            UTI: 'public.png', // For iOS
          });
        } else {
          AlertManager.alert('Not Available', 'Sharing is not available on this device');
        }
      }
    } catch (error) {
      console.error('Error sharing QR code:', error);
      AlertManager.alert('Error', 'Failed to share QR code');
    }
  };

  const handleDownloadQRCode = async () => {
    try {
      // Request media library permissions (write only, not read)
      const hasPermission = await requestPhotoSavePermission();

      if (!hasPermission) {
        AlertManager.alert('Permission Required', 'Please allow access to save the QR code to your gallery.');
        return;
      }

      if (qrCodeRef.current) {
        // Capture QR code as image
        const uri = await qrCodeRef.current.capture();
        
        // Save directly to media library
        const asset = await MediaLibrary.createAssetAsync(uri);
        
        AlertManager.alert('Success', 'QR code saved to gallery!');
      }
    } catch (error) {
      console.error('Error downloading QR code:', error);
      AlertManager.alert('Error', getMediaLibraryDownloadErrorMessage(error));
    }
  };

  const handleSignOut = () => {
    AlertManager.alert(
      'Sign Out',
      'Are you sure you want to sign out? You will need email verification and wallet unlock to access your account again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('auth_token');
            await AsyncStorage.removeItem('phone_verified');
            await AsyncStorage.removeItem('phone_number');
            await AsyncStorage.removeItem('email_verified');
            await AsyncStorage.removeItem('user_email');
            clearSessionPin();
            
            AlertManager.alert('Signed Out', 'You have been signed out successfully.', [
              {
                text: 'OK',
                onPress: () => navigation.replace('Splash'),
              },
            ]);
          },
        },
      ]
    );
  };

  const handleToggleBiometric = async (value: boolean) => {
    if (biometricSaving) {
      return;
    }

    biometricSavingRef.current = true;
    setBiometricSaving(true);
    setBiometricEnabled(value);

    try {
      if (value) {
        let available = biometricAvailable;
        let type = biometricType;

        if (!available) {
          [available, type] = await Promise.all([
            isBiometricAvailable(),
            getBiometricType(),
          ]);
          setBiometricAvailable(available);
          setBiometricType(type);
        }

        if (!available) {
          setBiometricEnabled(false);
          AlertManager.alert('Not Available', `${type} is not set up on this device. Please enable it in your device settings.`);
          return;
        }

        const enabled = await enableBiometric({ skipAvailabilityCheck: true });
        if (!enabled) {
          setBiometricEnabled(false);
          AlertManager.alert('Not Enabled', 'Biometric unlock was not enabled. Your PIN still works as usual.', undefined, { type: 'info' });
          return;
        }

        await AsyncStorage.setItem('biometric_enabled', 'true');
        syncBiometricPreference(true);
      } else {
        await clearBiometricBackup();
        await AsyncStorage.setItem('biometric_enabled', 'false');
        syncBiometricPreference(false);
      }
    } catch (error) {
      setBiometricEnabled(!value);
      console.error('Biometric setting update failed:', error);
      AlertManager.alert('Biometric Error', 'Could not update biometric unlock. Please try again.', undefined, { type: 'error' });
    } finally {
      biometricSavingRef.current = false;
      setBiometricSaving(false);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('notifications_enabled', value.toString());
  };

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <TouchableOpacity style={styles.profilePhotoContainer} onPress={handlePickImage}>
          <Image 
            source={profilePhoto ? { uri: profilePhoto } : require('../../assets/default-profile-image-cryptopay.png')} 
            style={styles.profilePhoto} 
          />
          <View style={styles.editIconContainer}>
            <Ionicons name="camera-outline" size={15} color={COLORS.primary} />
          </View>
        </TouchableOpacity>
        
        {displayName && <Text style={styles.profileName}>{displayName}</Text>}
        <TouchableOpacity 
          style={styles.addressContainer}
          onPress={handleCopyAddress}
          activeOpacity={0.7}
        >
          <Text style={styles.profileAddress}>
            {cpayId || formatWalletFingerprint(walletAddress)}
          </Text>
          <Ionicons name="copy-outline" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* QR Code Section */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.qrCodeCard}
          onPress={handleShowQRCode}
          activeOpacity={0.8}
        >
          <View style={styles.qrCodeHeader}>
            <View style={styles.qrCodeHeaderLeft}>
              <Ionicons name="qr-code-outline" size={24} color={COLORS.primary} style={styles.qrCodeIcon} />
              <Text style={styles.qrCodeTitle}>My QR Code</Text>
            </View>
            <Ionicons name={showQRCode ? 'chevron-up' : 'chevron-down'} size={22} color={COLORS.textSecondary} />
          </View>
          
          {showQRCode && (
            <View style={styles.qrCodeContent}>
              <ViewShot ref={qrCodeRef} options={{ format: 'png', quality: 1.0 }}>
                <View style={styles.shareableQRCard}>
                  {/* Profile Section */}
                  <View style={styles.shareCardProfile}>
                    <Image 
                      source={profilePhoto ? { uri: profilePhoto } : require('../../assets/default-profile-image-cryptopay.png')} 
                      style={styles.shareCardProfilePhoto} 
                    />
                    {displayName && <Text style={styles.shareCardName}>{displayName}</Text>}
                    <Text style={styles.shareCardAddress}>
                      {cpayId || formatWalletFingerprint(walletAddress)}
                    </Text>
                  </View>
                  
                  {/* QR Code */}
                  <View style={styles.qrCodeWrapper}>
                    <QRCode
                      value={generatePaymentQR(
                        walletAddress,
                        '0',
                        displayName || 'C-Pay User',
                        ''
                      )}
                      size={220}
                      backgroundColor="white"
                      color={COLORS.primary}
                      logo={require('../../assets/cpay_logo.png')}
                      logoSize={45}
                      logoBackgroundColor="white"
                      logoMargin={2}
                    />
                  </View>
                  
                  {/* Footer */}
                  <View style={styles.shareCardFooter}>
                    <Text style={styles.shareCardFooterText}>Scan to send pilot credits</Text>
                  </View>
                </View>
              </ViewShot>
              <Text style={styles.qrCodeDescription}>
                Let others scan this QR code to send you pilot credits
              </Text>
              
              {/* Action Buttons */}
              <View style={styles.qrActionButtons}>
                <TouchableOpacity style={styles.qrActionButton} onPress={handleDownloadQRCode}>
                  <Ionicons name="download-outline" size={20} color={COLORS.text} />
                  <Text style={styles.qrActionButtonText}>Download</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={[styles.qrActionButton, styles.qrShareButton]} onPress={handleShareQRCode}>
                  <Ionicons name="share-social-outline" size={20} color={COLORS.textInverse} />
                  <Text style={[styles.qrActionButtonText, styles.shareButtonText]}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Merchant Section */}
      {merchantStatus && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Merchant</Text>
          <View style={styles.merchantCard}>
            <View style={styles.merchantHeader}>
              <Text style={styles.merchantBadge}>Merchant Account</Text>
              <Text style={styles.merchantName}>{businessName}</Text>
            </View>
            <TouchableOpacity
              style={styles.merchantButton}
              onPress={() => navigation.navigate('MerchantDashboard')}
            >
              <Ionicons name="stats-chart-outline" size={20} color={COLORS.textInverse} style={styles.merchantButtonIcon} />
              <Text style={styles.merchantButtonText}>Open Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Security Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security & Privacy</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="lock-closed-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>{biometricType}</Text>
                <Text style={styles.settingDescription}>
                  {biometricSaving ? 'Updating biometric unlock...' : `Quick unlock with ${biometricType.toLowerCase()}`}
                </Text>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleToggleBiometric}
              disabled={biometricSaving}
              trackColor={{ false: COLORS.border, true: COLORS.primary + '50' }}
              thumbColor={biometricEnabled ? COLORS.primary : COLORS.textSecondary}
            />
          </View>
          
          <View style={styles.settingDivider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('ChangePIN')}>
            <View style={styles.settingInfo}>
              <Ionicons name="keypad-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Change PIN</Text>
                <Text style={styles.settingDescription}>Update your 6-digit PIN</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={styles.settingDescription}>Transaction alerts</Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: COLORS.border, true: COLORS.primary + '50' }}
              thumbColor={notificationsEnabled ? COLORS.primary : COLORS.textSecondary}
            />
          </View>
          
          <View style={styles.settingDivider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('TransactionHistory')}>
            <View style={styles.settingInfo}>
              <Ionicons name="receipt-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Transaction History</Text>
                <Text style={styles.settingDescription}>View all transactions</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.settingRow} onPress={handleShowWalletAddress}>
            <View style={styles.settingInfo}>
              <Ionicons name="finger-print-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Wallet Address</Text>
                <Text style={styles.settingDescription}>Show public Stellar address</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.settingDivider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('CloudBackupSetup', { fromSettings: true })}>
            <View style={styles.settingInfo}>
              <Ionicons name="cloud-done-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Cloud Backup</Text>
                <Text style={styles.settingDescription}>Update encrypted recovery backup</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.settingDivider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => handleExportWalletKey('private')}>
            <View style={styles.settingInfo}>
              <Ionicons name="wallet-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Backup Wallet</Text>
                <Text style={styles.settingDescription}>Export private key</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          
          <View style={styles.settingDivider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => handleExportWalletKey('stellar')}>
            <View style={styles.settingInfo}>
              <Ionicons name="key-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Recovery Key</Text>
                <Text style={styles.settingDescription}>Export Stellar secret key</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          
          <View style={styles.settingDivider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => AlertManager.alert('Coming Soon', 'Transaction limits feature will be available soon.')}>
            <View style={styles.settingInfo}>
              <Ionicons name="speedometer-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Transaction Limits</Text>
                <Text style={styles.settingDescription}>Daily & monthly limits</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* More Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>More</Text>
        <View style={styles.settingsCard}>
          {!merchantStatus && (
            <>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => navigation.navigate('MerchantRegistration')}
              >
                <View style={styles.settingInfo}>
                  <Ionicons name="storefront-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
                  <View>
                    <Text style={styles.settingLabel}>Become a Merchant</Text>
                    <Text style={styles.settingDescription}>Accept payments</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <View style={styles.settingDivider} />
            </>
          )}
          
          <TouchableOpacity style={styles.settingRow} onPress={() => AlertManager.alert('Coming Soon', 'Help & Support will be available soon.')}>
            <View style={styles.settingInfo}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Help & Support</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          
          <View style={styles.settingDivider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => AlertManager.alert('Privacy Policy', 'Coming soon')}>
            <View style={styles.settingInfo}>
              <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Privacy Policy</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          
          <View style={styles.settingDivider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => AlertManager.alert('Terms of Service', 'Coming soon')}>
            <View style={styles.settingInfo}>
              <Ionicons name="document-text-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>Terms of Service</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          
          <View style={styles.settingDivider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => AlertManager.alert('About C-Pay', 'Version 1.0.3\n\nC-Pay is a closed-pilot payment app using test credits on Stellar testnet.\n\nPilot credits are not real money and have no cash value.\n\n© 2026 C-Pay')}>
            <View style={styles.settingInfo}>
              <Ionicons name="information-circle-outline" size={22} color={COLORS.primary} style={styles.settingIcon} />
              <View>
                <Text style={styles.settingLabel}>About</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Account Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} style={styles.signOutButtonIcon} />
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.signOutHint}>
          Your wallet will be safe. Sign back in anytime.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>C-Pay v1.0.3</Text>
        <Text style={styles.footerSubtext}>Built for closed-pilot test payments</Text>
        <Text style={styles.footerSubtext}>Stellar Testnet</Text>
      </View>
    </ScrollView>
    <Modal
      visible={!!exportedKey}
      animationType="fade"
      transparent
      onRequestClose={handleCloseExportedKey}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.exportModal}>
          <View style={styles.exportModalHeader}>
            <View style={styles.exportIconCircle}>
              <Ionicons name="key-outline" size={24} color={COLORS.primary} />
            </View>
            <TouchableOpacity onPress={handleCloseExportedKey} style={styles.exportCloseButton}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.exportTitle}>{exportedKey?.title}</Text>
          <Text style={styles.exportDescription}>{exportedKey?.description}</Text>

          <View style={styles.exportWarning}>
            <Ionicons name="alert-circle-outline" size={18} color={COLORS.warning} />
            <Text style={styles.exportWarningText}>{exportedKey?.warning}</Text>
          </View>

          <View style={styles.exportKeyBox}>
            <Text style={styles.exportKeyLabel}>{exportedKey?.valueLabel || 'Value'}</Text>
            <Text style={styles.exportKeyValue} selectable={showExportedKey}>
              {exportedKey ? (showExportedKey ? exportedKey.value : maskKey(exportedKey.value)) : ''}
            </Text>
          </View>

          <View style={styles.exportActions}>
            <TouchableOpacity
              style={styles.exportSecondaryButton}
              onPress={() => setShowExportedKey((current) => !current)}
            >
              <Ionicons name={showExportedKey ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.primary} />
              <Text style={styles.exportSecondaryButtonText}>
                {showExportedKey ? 'Hide' : 'Reveal'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportPrimaryButton} onPress={handleCopyExportedKey}>
              <Ionicons name="copy-outline" size={18} color={COLORS.textInverse} />
              <Text style={styles.exportPrimaryButtonText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  exportModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.lg,
  },
  exportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  exportIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  exportTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  exportDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  exportWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: COLORS.warningBg,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  exportWarningText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.warningDark,
    lineHeight: 18,
  },
  exportKeyBox: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  exportKeyLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  exportKeyValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 20,
  },
  exportActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  exportSecondaryButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  exportSecondaryButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  exportPrimaryButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  exportPrimaryButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 10 : SPACING.md,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  profilePhotoContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  profilePhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  defaultAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.primaryDark,
  },
  defaultAvatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
  editIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  editIcon: {
    fontSize: 14,
  },
  profileName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  profileAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flex: 1,
    marginRight: SPACING.sm,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  qrCodeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  qrCodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrCodeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qrCodeIcon: {
    fontSize: 24,
    marginRight: SPACING.sm,
  },
  qrCodeTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  qrCodeToggle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  qrCodeContent: {
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  shareableQRCard: {
    backgroundColor: '#ffffff',
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    width: 320,
  },
  shareCardProfile: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  shareCardProfilePhoto: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  shareCardName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  shareCardAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  shareCardFooter: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  shareCardFooterText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  qrCodeWrapper: {
    padding: SPACING.lg,
    backgroundColor: '#ffffff',
    borderRadius: BORDER_RADIUS.md,
    ...SHADOWS.md,
  },
  qrCodeDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  qrActionButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    width: '100%',
    paddingHorizontal: SPACING.md,
  },
  qrActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  qrShareButton: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  qrActionButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: SPACING.xs,
  },
  shareButtonText: {
    color: COLORS.textInverse,
  },
  merchantCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
    ...SHADOWS.md,
  },
  merchantHeader: {
    marginBottom: SPACING.md,
  },
  merchantBadge: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  merchantName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
  merchantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  merchantButtonIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  merchantButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  settingLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  settingArrow: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  settingDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.sm,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.error + '15',
    borderWidth: 1,
    borderColor: COLORS.error,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  signOutButtonIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  signOutButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.error,
  },
  signOutHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  footer: {
    alignItems: 'center',
    marginTop: SPACING.xl,
    paddingTop: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  footerSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
});
