import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useToast } from '../core/ToastContext';

export function NetworkNotifier() {
  const { showToast } = useToast();
  const wasConnected = useRef<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // First render init
      if (wasConnected.current === null) {
        wasConnected.current = state.isConnected;
        return;
      }

      // If disconnected
      if (wasConnected.current === true && !state.isConnected) {
        showToast({
          title: 'Koneksi Terputus',
          message: 'Anda sedang offline. Beberapa fitur mungkin tidak berfungsi.',
          type: 'error',
          duration: 5000
        });
      }

      // If reconnected
      if (wasConnected.current === false && state.isConnected) {
        showToast({
          title: 'Koneksi Pulih',
          message: 'Anda kembali online.',
          type: 'success',
          duration: 3000
        });
      }

      wasConnected.current = state.isConnected;
    });

    return () => unsubscribe();
  }, [showToast]);

  return null;
}
