import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasWallet } from '../services/wallet';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { PILOT_NOTICE_TITLE } from '../utils/pilot';

const FONT_SIZES = TYPOGRAPHY.sizes;

const { width } = Dimensions.get('window');

interface SplashScreenProps {
  navigation: any;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ navigation }) => {
  useEffect(() => {
    checkWalletAndNavigate();
  }, [navigation]);

  const checkWalletAndNavigate = async () => {
    try {
      // Keep the splash visible just long enough to avoid a hard flash.
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if user has already created wallet
      const walletExists = await hasWallet();
      console.log('Wallet exists:', walletExists);
      
      if (walletExists) {
        // Check if phone is verified
        const phoneVerified = await AsyncStorage.getItem('phone_number');
        
        if (!phoneVerified) {
          // Existing wallet but no phone verification - show phone verification
          navigation.replace('PhoneVerification');
        } else {
          // User has wallet and phone verified, go to login
          navigation.replace('Login');
        }
      } else {
        // New user, show onboarding first
        navigation.replace('Onboarding');
      }
    } catch (error) {
      console.error('Error checking wallet:', error);
      // On error, assume new user
      navigation.replace('Onboarding');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/cpay_logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>C-Pay</Text>
        <Text style={styles.subtitle}>{PILOT_NOTICE_TITLE} on Stellar testnet</Text>
      </View>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={COLORS.card} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.card,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.card + 'CC',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.card + 'AA',
    marginTop: SPACING.sm,
  },
});
