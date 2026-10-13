import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { theme } from '../../../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfirm } from '../../../core/ConfirmContext';

export default function PinSetupScreen() {
  const router = useRouter();
  
  // States untuk pengaturan utama
  const [isPinActive, setIsPinActive] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // States untuk pembuatan PIN
  const [pin, setPin] = useState('');
  const [step, setStep] = useState(1);
  const [firstPin, setFirstPin] = useState('');
  const { showConfirm } = useConfirm();

  React.useEffect(() => {
    const loadPinSettings = async () => {
      const active = await AsyncStorage.getItem('app_pin_active');
      if (active === 'true') setIsPinActive(true);
    };
    loadPinSettings();
  }, []);

  const toggleSwitch = async () => {
    if (!isPinActive) {
      setIsSettingUp(true);
      setStep(1);
      setPin('');
      setFirstPin('');
    } else {
      showConfirm({
        title: 'Matikan PIN',
        message: 'Apakah Anda yakin ingin mematikan fitur PIN Aplikasi?',
        confirmText: 'Matikan',
        cancelText: 'Batal',
        type: 'danger',
        onConfirm: async () => {
          setIsPinActive(false);
          await AsyncStorage.setItem('app_pin_active', 'false');
          await AsyncStorage.removeItem('app_pin');
        }
      });
    }
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
      
      // Auto-transition ketika 6 digit terpenuhi
      if (newPin.length === 6) {
        setTimeout(() => {
          if (step === 1) {
            setFirstPin(newPin);
            setPin('');
            setStep(2);
          } else if (step === 2) {
            if (newPin === firstPin) {
              Alert.alert('Sukses', 'PIN Keamanan berhasil diatur!', [
                { text: 'Selesai', onPress: async () => {
                  await AsyncStorage.setItem('app_pin', newPin);
                  await AsyncStorage.setItem('app_pin_active', 'true');
                  setIsSettingUp(false);
                  setIsPinActive(true);
                  setPin('');
                }}
              ]);
            } else {
              Alert.alert('Gagal', 'PIN tidak cocok. Silakan ulangi dari awal.', [
                { text: 'Ulangi', onPress: () => {
                  setStep(1);
                  setFirstPin('');
                  setPin('');
                }}
              ]);
            }
          }
        }, 300);
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <View style={[styles.container, !isSettingUp && { backgroundColor: '#f4f4f5' }]}>
      <Stack.Screen 
        options={{ 
          title: 'Atur PIN Keamanan',
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => isSettingUp ? setIsSettingUp(false) : router.back()} 
              style={{ marginLeft: 8, marginRight: 16 }}
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          )
        }} 
      />

      {!isSettingUp ? (
        // TAMPILAN PENGATURAN PIN (TOGGLE)
        <View style={styles.settingsContent}>
          <View style={[styles.iconCircle, isPinActive && styles.iconCircleActive]}>
            <MaterialIcons name="dialpad" size={70} color={isPinActive ? '#fff' : '#10b981'} />
          </View>
          
          <Text style={styles.titleMain}>Keamanan PIN</Text>
          <Text style={styles.subtitleMain}>
            Gunakan 6 digit angka khusus untuk mengamankan data rahasia dan verifikasi persetujuan di aplikasi.
          </Text>

          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <MaterialIcons name="security" size={24} color={theme.colors.primary} />
              <View style={{ marginLeft: 16, flex: 1 }}>
                <Text style={styles.cardTitle}>Gunakan PIN Aplikasi</Text>
                <Text style={styles.cardDesc}>Lapisan keamanan tambahan</Text>
              </View>
            </View>
            <Switch
              trackColor={{ false: '#cbd5e1', true: '#10b981' }}
              thumbColor={isPinActive ? '#fff' : '#f4f3f4'}
              onValueChange={toggleSwitch}
              value={isPinActive}
            />
          </View>

          {isPinActive && (
            <View style={styles.successBox}>
              <MaterialIcons name="check-circle" size={20} color={theme.colors.success} />
              <Text style={styles.successText}>PIN Keamanan saat ini aktif. Anda dapat menggunakannya sebagai alternatif Sidik Jari.</Text>
            </View>
          )}
        </View>
      ) : (
        // TAMPILAN KEYPAD PEMBUATAN PIN (2-STEP)
        <View style={styles.keypadContent}>
          <View style={styles.header}>
            <MaterialIcons name={step === 1 ? "dialpad" : "check-circle"} size={60} color="#10b981" />
            <Text style={styles.title}>{step === 1 ? 'Buat PIN Baru' : 'Konfirmasi PIN Baru'}</Text>
            <Text style={styles.subtitle}>
              {step === 1 
                ? 'Gunakan 6 digit angka yang mudah Anda ingat.' 
                : 'Masukkan kembali 6 digit angka PIN Anda untuk konfirmasi.'}
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
            <View style={styles.keyBtn} />
            <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyPress('0')}>
              <Text style={styles.keyText}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.keyBtn} onPress={handleBackspace}>
              <MaterialIcons name="backspace" size={28} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  
  // Pengaturan UI
  settingsContent: { padding: theme.spacing.xl, alignItems: 'center' },
  iconCircle: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.xl },
  iconCircleActive: { backgroundColor: '#10b981', elevation: 10, shadowColor: '#10b981', shadowOpacity: 0.5, shadowRadius: 15 },
  titleMain: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text, marginBottom: 12 },
  subtitleMain: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 40, lineHeight: 22 },
  
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: theme.radius.l, padding: theme.spacing.l, alignItems: 'center', justifyContent: 'space-between', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, width: '100%' },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  cardDesc: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  
  successBox: { flexDirection: 'row', backgroundColor: '#dcfce7', padding: 16, borderRadius: theme.radius.m, marginTop: 24, alignItems: 'center', width: '100%' },
  successText: { color: '#166534', marginLeft: 12, flex: 1, fontSize: 13, fontWeight: '500' },

  // Keypad UI
  keypadContent: { alignItems: 'center', paddingTop: theme.spacing.xl },
  header: { alignItems: 'center', marginVertical: theme.spacing.xl },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  
  dotsContainer: { flexDirection: 'row', marginVertical: theme.spacing.xxl, gap: 15 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#f1f5f9' },
  dotFilled: { backgroundColor: '#10b981', borderColor: '#10b981' },
  
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 280, marginTop: 20 },
  keyBtn: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center', borderRadius: 40, margin: 6, backgroundColor: '#f8fafc' },
  keyText: { fontSize: 28, fontWeight: '600', color: theme.colors.text },
});
