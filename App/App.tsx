import 'react-native-get-random-values';
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { Navigation } from './src/navigation';
import { PINDialog, CustomAlertProvider } from './src/components';
import { setPINDialogHandler } from './src/utils/biometric';
import { AlertManager } from './src/utils/alert';
import { cachePinForSession, verifyPin } from './src/services/wallet';

export default function App() {
  const [pinDialogVisible, setPinDialogVisible] = useState(false);
  const [pinDialogConfig, setPinDialogConfig] = useState({
    title: 'Enter PIN',
    message: 'Enter your 6-digit PIN to confirm',
    resolve: null as ((value: string | null) => void) | null,
  });

  // Set up PIN dialog handler
  React.useEffect(() => {
    setPINDialogHandler((title: string, message: string) => {
      return new Promise<string | null>((resolve) => {
        setPinDialogConfig({ title, message, resolve });
        setPinDialogVisible(true);
      });
    });
  }, []);

  const handlePINConfirm = async (pin: string) => {
    setPinDialogVisible(false);

    const isValid = await verifyPin(pin);

    if (isValid) {
      cachePinForSession(pin);
      pinDialogConfig.resolve?.(pin);
    } else {
      AlertManager.alert('Incorrect PIN', 'The PIN you entered is incorrect', undefined, { type: 'error' });
      pinDialogConfig.resolve?.(null);
    }
  };

  const handlePINCancel = () => {
    setPinDialogVisible(false);
    pinDialogConfig.resolve?.(null);
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <CustomAlertProvider>
          <Navigation />
          <StatusBar style="auto" />
          <PINDialog
            visible={pinDialogVisible}
            title={pinDialogConfig.title}
            message={pinDialogConfig.message}
            onConfirm={handlePINConfirm}
            onCancel={handlePINCancel}
          />
        </CustomAlertProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
