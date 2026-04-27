import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

const getAndroidApiLevel = (): number => {
  if (typeof Platform.Version === 'number') {
    return Platform.Version;
  }

  return Number.parseInt(String(Platform.Version), 10) || 0;
};

export const isExpoGoMediaLibraryPermissionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('Expo Go can no longer provide full access to the media library');
};

export const getMediaLibraryDownloadErrorMessage = (error: unknown): string => {
  if (isExpoGoMediaLibraryPermissionError(error)) {
    return 'Saving QR codes to the gallery on Android requires a development build or production build. Please rebuild and install the app instead of testing this action in Expo Go.';
  }

  return 'Failed to download QR code';
};

export const requestPhotoSavePermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && getAndroidApiLevel() >= 33) {
    return true;
  }

  const { status } = await MediaLibrary.requestPermissionsAsync(true);
  return status === 'granted';
};
