import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, AppState, TouchableOpacity, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { MaterialIcons } from '@expo/vector-icons';
import { theme } from '../core/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

let isAppLockSuspended = false;

/**
 * Tangguhkan AppLock sementara (misal saat membuka kamera, galeri foto, atau pemilih dokumen)
 */
export const suspendAppLock = () => {
  isAppLockSuspended = true;
};

/**
 * Aktifkan kembali AppLock setelah selesai dari kamera/galeri
 */
export const resumeAppLock = (delayMs = 3000) => {
  setTimeout(() => {
    isAppLockSuspended = false;
  }, delayMs);
};

export const getIsAppLockSuspended = () => isAppLockSuspended;

export function AppLock({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);

  // Waktu jeda (dalam milidetik) sebelum aplikasi terkunci saat di background (default 60 detik)
  const LOCK_TIMEOUT = 60000;

  const checkBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBiometrics(Boolean(hasHardware && isEnrolled));
    } catch {
      setHasBiometrics(false);
    }
  };

  const loadSavedPin = async () => {
    try {
      const p = await AsyncStorage.getItem('app_pin');
      if (p && p !== '123456') {
        setSavedPin(p);
      } else {
        setSavedPin(null);
      }
    } catch {
      setSavedPin(null);
    }
  };

  const authenticate = useCallback(async () => {
    if (!hasBiometrics) return;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Pindai Sidik Jari untuk Buka Aplikasi',
        cancelLabel: 'Gunakan PIN',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLocked(false);
        setPin('');
      }
    } catch (error) {
      console.log('Autentikasi Error', error);
    }
  }, [hasBiometrics]);

  useEffect(() => {
    checkBiometrics();
    loadSavedPin();

    const subscription = AppState.addEventListener('change', nextAppState => {
      // Jika AppLock sedang ditangguhkan (misal sedang buka kamera/galeri), reset timer dan jangan kunci
      if (isAppLockSuspended) {
        backgroundTime.current = null;
        appState.current = nextAppState;
        return;
      }

      // Jika masuk ke background, catat waktunya
      if (appState.current.match(/active/) && nextAppState === 'background') {
        backgroundTime.current = Date.now();
      }

      // Jika kembali ke active dari background
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (backgroundTime.current) {
          const timeAway = Date.now() - backgroundTime.current;
          if (timeAway > LOCK_TIMEOUT) {
            // Hanya kunci jika pengguna telah mengaktifkan Sidik Jari di menu Pengaturan
            AsyncStorage.getItem('biometrics_enabled').then(bioEnabled => {
              if (bioEnabled === 'true') {
                setIsLocked(true);
                setTimeout(() => {
                  authenticate();
                }, 400);
              }
            }).catch(() => {});
          }
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [authenticate]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);

      if (newPin.length === 6) {
        if (savedPin && newPin === savedPin) {
          setIsLocked(false);
          setPin('');
        } else {
          Alert.alert('PIN Salah', 'PIN yang Anda masukkan tidak cocok.', [
            { text: 'OK', onPress: () => setPin('') }
          ]);
        }
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  if (!isLocked) {
    return <>{children}</>;
  }

  // Tampilan M-Banking Style Lock Screen (Murni dinamis tanpa hardcode)
  return (
    <View style={styles.lockScreen}>
      <View style={styles.header}>
        <MaterialIcons name="security" size={50} color="#fff" />
        <Text style={styles.title}>Kunci Aplikasi E-Karyawan</Text>
        <Text style={styles.subtitle}>
          {hasBiometrics
            ? 'Pindai sidik jari atau masukkan 6 digit PIN Anda.'
            : 'Masukkan 6 digit PIN keamanan Anda.'}
        </Text>
      </View>

      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
          <TouchableOpacity key={num} style={styles.keyBtn} onPress={() => handleKeyPress(num)}>
            <Text style={styles.keyText}>{num}</Text>
          </TouchableOpacity>
        ))}
        {hasBiometrics ? (
          <TouchableOpacity style={styles.keyBtnAction} onPress={authenticate}>
            <MaterialIcons name="fingerprint" size={32} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.keyBtnAction} />
        )}
        <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyPress('0')}>
          <Text style={styles.keyText}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.keyBtnAction} onPress={handleBackspace}>
          <MaterialIcons name="backspace" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
  },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 12, marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', paddingHorizontal: 20 },

  dotsContainer: { flexDirection: 'row', gap: 15, marginBottom: 50 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#fff', borderColor: '#fff' },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 280 },
  keyBtn: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center', borderRadius: 40, margin: 6, backgroundColor: 'rgba(255,255,255,0.1)' },
  keyText: { fontSize: 28, fontWeight: '600', color: '#fff' },
  keyBtnAction: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center', margin: 6 },
});
