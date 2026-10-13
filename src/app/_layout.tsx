import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppLock } from '../components/AppLock';
import { NetworkNotifier } from '../components/NetworkNotifier';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Text, TextInput, View } from 'react-native';
import { ToastProvider } from '../core/ToastContext';
import { ConfirmProvider } from '../core/ConfirmContext';

export default function RootLayout() {
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