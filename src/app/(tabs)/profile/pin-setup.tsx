import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { theme } from '../../../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfirm } from '../../../core/ConfirmContext';
import { useToast } from '../../../core/ToastContext';

export default function PinSetupScreen() {
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();

  const [hasPin, setHasPin] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // States untuk input PIN 2 langkah
  const [pin, setPin] = useState('');
  const [step, setStep] = useState(1);
  const [firstPin, setFirstPin] = useState('');

  const loadPinStatus = async () => {
    try {
      const p = await AsyncStorage.getItem('app_pin');
      if (p === '123456') {
        // Hapus hardcoded PIN jika pernah tersimpan
        await AsyncStorage.removeItem('app_pin');
        setHasPin(false);
      } else {
        setHasPin(Boolean(p && p.length === 6));
      }
    } catch {
      setHasPin(false);
    }
  };

  useEffect(() => {
    loadPinStatus();
  }, []);

  const startPinSetup = () => {
    setIsSettingUp(true);
    setStep(1);
    setPin('');
    setFirstPin('');
  };

  const handleDeletePin = () => {
    showConfirm({
      title: 'Hapus PIN',
      message: 'Apakah Anda yakin ingin menghapus PIN keamanan Anda?',
      confirmText: 'Hapus',
      cancelText: 'Batal',
      type: 'danger',
      onConfirm: async () => {
        await AsyncStorage.removeItem('app_pin');
        setHasPin(false);
        showToast({
          title: 'PIN Dihapus',
          message: 'PIN keamanan Anda telah dinonaktifkan.',
          type: 'info'
        });
      }
    });
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);

      if (newPin.length === 6) {
        setTimeout(() => {
          if (step === 1) {
            setFirstPin(newPin);
            setPin('');
            setStep(2);
          } else if (step === 2) {
            if (newPin === firstPin) {
              Alert.alert('Sukses', 'PIN Keamanan berhasil disimpan!', [
                {
                  text: 'Selesai',
                  onPress: async () => {
                    await AsyncStorage.setItem('app_pin', newPin);
                    setHasPin(true);
                    setIsSettingUp(false);
                    setPin('');
                    setFirstPin('');
                    showToast({
                      title: 'Berhasil',
                      message: 'PIN baru Anda berhasil diaktifkan.',
                      type: 'success'
                    });
                  }
                }
              ]);
            } else {
              Alert.alert('Gagal', 'Konfirmasi PIN tidak cocok. Silakan ulangi.', [
                {
                  text: 'Ulangi',
                  onPress: () => {
                    setStep(1);
                    setFirstPin('');
                    setPin('');
                  }
                }
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
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'PIN Keamanan',
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => (isSettingUp ? setIsSettingUp(false) : router.back())}
              style={{ marginLeft: 8, marginRight: 16 }}
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          )
        }}
      />

      {!isSettingUp ? (
        <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="dialpad" size={64} color="#10b981" />
          </View>

          <Text style={styles.titleMain}>PIN Keamanan</Text>
          <Text style={styles.subtitleMain}>
            Gunakan 6 digit PIN pribadi buatan Anda sendiri untuk melindungi akses data rahasia seperti slip gaji.
          </Text>

          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusDot, { backgroundColor: hasPin ? '#10b981' : '#f59e0b' }]} />
              <Text style={styles.statusTitle}>
                {hasPin ? 'PIN Keamanan Aktif' : 'PIN Belum Diatur'}
              </Text>
            </View>
            <Text style={styles.statusDesc}>
              {hasPin
                ? 'PIN 6 digit pribadi Anda tersimpan dengan aman pada perangkat ini.'
                : 'Anda belum mengatur PIN keamanan. Silakan buat PIN untuk mengamankan data Anda.'}
            </Text>
          </View>

          <TouchableOpacity style={styles.btnPrimary} onPress={startPinSetup} activeOpacity={0.8}>
            <MaterialIcons name={hasPin ? "edit" : "add-circle"} size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.btnPrimaryText}>
              {hasPin ? 'Ubah PIN Keamanan' : 'Buat PIN Baru'}
            </Text>
          </TouchableOpacity>

          {hasPin && (
            <TouchableOpacity style={styles.btnDelete} onPress={handleDeletePin} activeOpacity={0.7}>
              <MaterialIcons name="delete-outline" size={20} color="#ef4444" style={{ marginRight: 6 }} />
              <Text style={styles.btnDeleteText}>Hapus PIN</Text>
            </TouchableOpacity>
          )}

          <View style={styles.infoBox}>
            <MaterialIcons name="security" size={20} color={theme.colors.primary} />
            <Text style={styles.infoText}>
              Aplikasi tidak menggunakan PIN bawaan/default. Setiap karyawan membuat PIN pribadinya sendiri secara aman.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.keypadContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerKeypad}>
            <MaterialIcons name={step === 1 ? 'dialpad' : 'check-circle'} size={50} color="#10b981" />
            <Text style={styles.keypadTitle}>{step === 1 ? 'Masukkan 6 Digit PIN Baru' : 'Konfirmasi PIN Baru'}</Text>
            <Text style={styles.keypadSubtitle}>
              {step === 1
                ? 'Pilih 6 digit angka yang mudah Anda ingat.'
                : 'Ketik ulang 6 digit angka PIN Anda untuk konfirmasi.'}
            </Text>
          </View>

          <View style={styles.dotsContainer}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
            ))}
          </View>

          <View style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <TouchableOpacity key={num} style={styles.keyBtn} onPress={() => handleKeyPress(num)} activeOpacity={0.7}>
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.keyBtnEmpty} />
            <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyPress('0')} activeOpacity={0.7}>
              <Text style={styles.keyText}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.keyBtn} onPress={handleBackspace} activeOpacity={0.7}>
              <MaterialIcons name="backspace" size={26} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.btnCancelSetup}
            onPress={() => {
              setIsSettingUp(false);
              setPin('');
              setFirstPin('');
            }}
          >
            <Text style={styles.btnCancelSetupText}>Batal</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5' },
  settingsContent: { padding: 24, alignItems: 'center' },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20
  },
  titleMain: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, marginBottom: 8, textAlign: 'center' },
  subtitleMain: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 28, lineHeight: 20 },

  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    marginBottom: 20
  },
  statusHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  statusDesc: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },

  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    elevation: 3,
    marginBottom: 12
  },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  btnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    marginBottom: 16
  },
  btnDeleteText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },

  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    alignItems: 'flex-start',
    width: '100%'
  },
  infoText: {
    color: '#1e40af',
    fontSize: 12.5,
    lineHeight: 18,
    marginLeft: 10,
    flex: 1
  },

  keypadContent: { alignItems: 'center', paddingVertical: 24 },
  headerKeypad: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 24 },
  keypadTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginTop: 12, marginBottom: 6 },
  keypadSubtitle: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },

  dotsContainer: { flexDirection: 'row', marginVertical: 20, gap: 14 },
  dot: { width: 15, height: 15, borderRadius: 7.5, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#e2e8f0' },
  dotFilled: { backgroundColor: '#10b981', borderColor: '#10b981' },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 280 },
  keyBtn: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 36,
    margin: 8,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4
  },
  keyBtnEmpty: { width: 72, height: 72, margin: 8 },
  keyText: { fontSize: 26, fontWeight: '600', color: theme.colors.text },

  btnCancelSetup: { marginTop: 24, paddingVertical: 10, paddingHorizontal: 24 },
  btnCancelSetupText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' }
});
