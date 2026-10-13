import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { theme } from '../../../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '../../../core/ToastContext';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    passwordConfirmation?: string;
  }>({});

  const handleSave = async () => {
    const errors: {
      currentPassword?: string;
      newPassword?: string;
      passwordConfirmation?: string;
    } = {};

    if (!currentPassword.trim()) {
      errors.currentPassword = 'Password saat ini wajib diisi';
    }

    if (!newPassword.trim()) {
      errors.newPassword = 'Password baru wajib diisi';
    } else if (newPassword.length < 5) {
      errors.newPassword = 'Password baru minimal 5 karakter';
    }

    if (!passwordConfirmation.trim()) {
      errors.passwordConfirmation = 'Konfirmasi password baru wajib diisi';
    } else if (newPassword !== passwordConfirmation) {
      errors.passwordConfirmation = 'Konfirmasi password tidak cocok dengan password baru';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      showToast({ title: 'Form Belum Lengkap', message: 'Harap periksa kolom yang ditandai merah', type: 'warning' });
      return;
    }
    setFormErrors({});

    setLoading(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        showToast({ title: 'Sesi Berakhir', message: 'Silakan login kembali.', type: 'error' });
        router.replace('/login');
        return;
      }

      const payload = {
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: passwordConfirmation
      };

      // Coba POST terlebih dahulu
      let response = await fetch(`${apiUrl}/api/my/password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });

      // Jika 405 Method Not Allowed, coba dengan PUT
      if (response.status === 405) {
        response = await fetch(`${apiUrl}/api/my/password`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }

      const json = await response.json().catch(() => ({}));

      if (response.ok) {
        showToast({
          title: 'Sukses',
          message: json.message || 'Password Anda berhasil diperbarui!',
          type: 'success'
        });
        setTimeout(() => {
          router.back();
        }, 800);
      } else {
        const errMessage = json.message || (json.errors ? Object.values(json.errors).flat().join('\n') : 'Gagal memperbarui password');
        showToast({
          title: 'Gagal',
          message: errMessage,
          type: 'error'
        });
      }
    } catch (_) {
      showToast({
        title: 'Error Koneksi',
        message: 'Gagal menghubungi server. Periksa koneksi internet Anda.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Ubah Password',
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8, marginRight: 16 }}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          )
        }} 
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.iconCircle}>
          <MaterialIcons name="lock-reset" size={46} color="#f59e0b" />
        </View>
        <Text style={styles.title}>Perbarui Password</Text>
        <Text style={styles.subtitle}>Masukkan password saat ini dan buat password baru yang aman untuk akun Anda.</Text>

        {/* PASSWORD LAMA / SAAT INI */}
        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Password Saat Ini</Text>
            <Text style={styles.requiredBadge}>*Wajib</Text>
          </View>
          <View style={[styles.inputWrapper, formErrors.currentPassword && styles.inputWrapperError]}>
            <MaterialIcons name="lock-outline" size={20} color={formErrors.currentPassword ? theme.colors.danger : theme.colors.textMuted} style={styles.inputIcon} />
            <TextInput 
              style={styles.input} 
              secureTextEntry={!showCurrentPass} 
              value={currentPassword} 
              onChangeText={(text) => {
                setCurrentPassword(text);
                if (formErrors.currentPassword) setFormErrors(prev => ({ ...prev, currentPassword: undefined }));
              }} 
              placeholder="Masukkan password saat ini"
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowCurrentPass(!showCurrentPass)} style={styles.eyeBtn}>
              <MaterialIcons name={showCurrentPass ? "visibility" : "visibility-off"} size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          {formErrors.currentPassword ? (
            <View style={styles.inlineErrorRow}>
              <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
              <Text style={styles.inlineErrorText}>{formErrors.currentPassword}</Text>
            </View>
          ) : null}
        </View>

        {/* PASSWORD BARU */}
        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Password Baru</Text>
            <Text style={styles.requiredBadge}>*Wajib</Text>
          </View>
          <View style={[styles.inputWrapper, formErrors.newPassword && styles.inputWrapperError]}>
            <MaterialIcons name="lock" size={20} color={formErrors.newPassword ? theme.colors.danger : theme.colors.textMuted} style={styles.inputIcon} />
            <TextInput 
              style={styles.input} 
              secureTextEntry={!showNewPass} 
              value={newPassword} 
              onChangeText={(text) => {
                setNewPassword(text);
                if (formErrors.newPassword) setFormErrors(prev => ({ ...prev, newPassword: undefined }));
              }} 
              placeholder="Masukkan password baru"
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowNewPass(!showNewPass)} style={styles.eyeBtn}>
              <MaterialIcons name={showNewPass ? "visibility" : "visibility-off"} size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          {formErrors.newPassword ? (
            <View style={styles.inlineErrorRow}>
              <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
              <Text style={styles.inlineErrorText}>{formErrors.newPassword}</Text>
            </View>
          ) : null}
        </View>

        {/* KONFIRMASI PASSWORD BARU */}
        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Konfirmasi Password Baru</Text>
            <Text style={styles.requiredBadge}>*Wajib</Text>
          </View>
          <View style={[styles.inputWrapper, formErrors.passwordConfirmation && styles.inputWrapperError]}>
            <MaterialIcons name="verified-user" size={20} color={formErrors.passwordConfirmation ? theme.colors.danger : theme.colors.textMuted} style={styles.inputIcon} />
            <TextInput 
              style={styles.input} 
              secureTextEntry={!showConfirmPass} 
              value={passwordConfirmation} 
              onChangeText={(text) => {
                setPasswordConfirmation(text);
                if (formErrors.passwordConfirmation) setFormErrors(prev => ({ ...prev, passwordConfirmation: undefined }));
              }} 
              placeholder="Ulangi password baru"
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowConfirmPass(!showConfirmPass)} style={styles.eyeBtn}>
              <MaterialIcons name={showConfirmPass ? "visibility" : "visibility-off"} size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          {formErrors.passwordConfirmation ? (
            <View style={styles.inlineErrorRow}>
              <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
              <Text style={styles.inlineErrorText}>{formErrors.passwordConfirmation}</Text>
            </View>
          ) : null}
        </View>

        {/* TOMBOL SIMPAN */}
        <TouchableOpacity 
          style={[styles.btnSave, loading && { opacity: 0.7 }]} 
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnSaveText}>Simpan Password Baru</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: theme.spacing.xl, alignItems: 'center', paddingBottom: 40 },
  iconCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.l },
  title: { fontSize: 21, fontWeight: 'bold', color: theme.colors.text, marginBottom: 8 },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', marginBottom: theme.spacing.xl, paddingHorizontal: 16, lineHeight: 19 },
  
  formGroup: { width: '100%', marginBottom: theme.spacing.l },
  label: { fontSize: 13, fontWeight: 'bold', color: theme.colors.text },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  requiredBadge: { color: theme.colors.danger, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: theme.radius.m, paddingHorizontal: theme.spacing.m },
  inputWrapperError: { borderColor: theme.colors.danger, borderWidth: 1.5, backgroundColor: '#fff5f5' },
  inlineErrorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingHorizontal: 2 },
  inlineErrorText: { color: theme.colors.danger, fontSize: 12, fontWeight: '500', marginLeft: 4, flex: 1 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 13, fontSize: 14, color: theme.colors.text },
  eyeBtn: { padding: 6 },
  
  btnSave: { backgroundColor: theme.colors.primary, width: '100%', paddingVertical: 14, borderRadius: theme.radius.m, alignItems: 'center', marginTop: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  btnSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});
