import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppLock } from '../components/AppLock';
import { NetworkNotifier } from '../components/NetworkNotifier';
import { BreakNotificationBanner } from '../components/BreakNotificationBanner';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';
import { ToastProvider } from '../core/ToastContext';
import { ConfirmProvider } from '../core/ConfirmContext';
import { initBreakNotificationService } from '../core/breakNotificationService';

export default function RootLayout() {
  useEffect(() => {
    initBreakNotificationService();

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'global-custom-web-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          /* Hilangkan border bawah navbar bawaan di web */
          header, [role="banner"] {
            border-bottom: none !important;
            border-bottom-width: 0 !important;
            border-bottom-color: transparent !important;
            box-shadow: none !important;
          }
          /* Custom sleek scrollbar agar tidak meninggalkan kotak putih di pojok navbar */
          html, body {
            overflow-x: hidden;
            background-color: #f8fafc;
          }
          ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 3px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.35);
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#f4f4f5' }} />;
  }

  // Hack for global font family (React Native doesn't support global CSS)
  const oldTextRender = (Text as any).render;
  if (oldTextRender && !(Text as any).defaultPropsSet) {
    (Text as any).defaultPropsSet = true;
    const customTextRender = function(this: any, props: any, ref: any) {
      let customStyle = { fontFamily: props.style?.fontWeight === 'bold' ? 'Inter_700Bold' : 'Inter_400Regular' };
      return oldTextRender.call(this, { ...props, style: [customStyle, props.style] }, ref);
    };
    (Text as any).render = customTextRender;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <ConfirmProvider>
        <ToastProvider>
          <NetworkNotifier />
          <BreakNotificationBanner />
          <AppLock>
            <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="forgot-password" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </AppLock>
        </ToastProvider>
      </ConfirmProvider>
    </GestureHandlerRootView>
  );
}