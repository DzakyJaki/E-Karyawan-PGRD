import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { theme } from '../../../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function BiometricsScreen() {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        setIsSupported(hasHardware && isEnrolled);

        const savedValue = await AsyncStorage.getItem('biometrics_enabled');
        setIsEnabled(savedValue === 'true');
      } catch (err) {
        console.log('Error checking biometrics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, []);

  const toggleSwitch = async () => {
    const targetState = !isEnabled;

    if (targetState) {
      if (!isSupported) {
        Alert.alert(
          'Tidak Didukung',
          'Perangkat Anda belum memiliki sensor biometrik atau belum ada sidik jari yang didaftarkan di Pengaturan HP Anda.'
        );
        return;
      }

      // Autentikasi sidik jari nyata sebelum mengaktifkan
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Pindai Sidik Jari untuk Mengaktifkan Kunci Aplikasi',
          cancelLabel: 'Batal',
          disableDeviceFallback: false,
        });

        if (result.success) {
          setIsEnabled(true);
          await AsyncStorage.setItem('biometrics_enabled', 'true');
          Alert.alert(
            'Kunci Sidik Jari Aktif',
            'Aplikasi E-Karyawan kini dilindungi dengan kunci sidik jari saat Anda meninggalkan aplikasi.'
          );
        } else {
          setIsEnabled(false);
        }
      } catch (_) {
        Alert.alert('Error', 'Gagal memproses pemindaian sidik jari.');
      }
    } else {
      setIsEnabled(false);
      await AsyncStorage.setItem('biometrics_enabled', 'false');
      Alert.alert('Kunci Dinonaktifkan', 'Kunci aplikasi dengan sidik jari telah dimatikan.');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Kunci Aplikasi (Biometrik)',
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8, marginRight: 16 }}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          )
        }} 
      />

      <View style={styles.content}>
        <View style={[styles.iconCircle, isEnabled && styles.iconCircleActive]}>
          <MaterialIcons name="fingerprint" size={80} color={isEnabled ? '#fff' : '#ec4899'} />
        </View>

        <Text style={styles.title}>Kunci Aplikasi</Text>
        <Text style={styles.subtitle}>
          Gunakan sensor sidik jari perangkat untuk mengunci dan mengamankan aplikasi E-Karyawan secara otomatis saat Anda keluar atau berpindah aplikasi.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={theme.colors.primary} size="large" />
        ) : (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <MaterialIcons name="security" size={24} color={theme.colors.primary} />
              <View style={{ marginLeft: 16, flex: 1 }}>
                <Text style={styles.cardTitle}>Kunci dengan Sidik Jari</Text>
                <Text style={styles.cardDesc}>
                  {isSupported ? 'Kunci aplikasi saat tidak digunakan' : 'Sensor tidak tersedia di perangkat'}
                </Text>
              </View>
            </View>
            <Switch
              disabled={!isSupported}
              trackColor={{ false: '#cbd5e1', true: '#ec4899' }}
              thumbColor={isEnabled ? '#fff' : '#f4f3f4'}
              onValueChange={toggleSwitch}
              value={isEnabled}
            />
          </View>
        )}

        {isEnabled && (
          <View style={styles.successBox}>
            <MaterialIcons name="check-circle" size={20} color={theme.colors.success} />
            <Text style={styles.successText}>
              Kunci sidik jari aktif. Aplikasi akan terkunci otomatis demi keamanan saat Anda beralih dari aplikasi.
            </Text>
          </View>
        )}

        {!isSupported && !isLoading && (
          <View style={[styles.successBox, { backgroundColor: '#fee2e2' }]}>
            <MaterialIcons name="info" size={20} color={theme.colors.danger} />
            <Text style={[styles.successText, { color: '#991b1b' }]}>
              Sidik jari tidak terdeteksi. Pastikan Anda telah mengaktifkan sidik jari pada pengaturan keamanan ponsel Anda.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5' },
  content: { padding: theme.spacing.xl, alignItems: 'center' },
  iconCircle: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#fce7f3', alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.xl },
  iconCircleActive: { backgroundColor: '#ec4899', elevation: 10, shadowColor: '#ec4899', shadowOpacity: 0.5, shadowRadius: 15 },
  
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text, marginBottom: 12 },
  subtitle: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 36, lineHeight: 22, paddingHorizontal: 10 },
  
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: theme.radius.l, padding: theme.spacing.l, alignItems: 'center', justifyContent: 'space-between', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, width: '100%' },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  cardDesc: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  
  successBox: { flexDirection: 'row', backgroundColor: '#dcfce7', padding: 16, borderRadius: theme.radius.m, marginTop: 24, alignItems: 'center', width: '100%' },
  successText: { color: '#166534', marginLeft: 12, flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 }
});
