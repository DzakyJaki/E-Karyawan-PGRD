import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useToast } from '../core/ToastContext';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleReset = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setEmailError('Email address wajib diisi');
      return;
    }
    if (!emailRegex.test(email.trim())) {
      setEmailError('Format email tidak valid (contoh: user@domain.com)');
      return;
    }
    setEmailError(null);

    setLoading(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const response = await fetch(`${apiUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        setIsSuccess(true);
        showToast({ 
          title: 'Berhasil', 
          message: data?.message || 'Tautan reset password telah dikirim ke email Anda.', 
          type: 'success' 
        });
      } else {
        showToast({ 
          title: 'Gagal', 
          message: data?.message || 'Gagal mengirim tautan reset. Pastikan email terdaftar.', 
          type: 'error' 
        });
      }
    } catch {
      showToast({ 
        title: 'Error', 
        message: 'Terjadi kesalahan jaringan atau koneksi ke server gagal.', 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Lupa Password?</Text>
        <Text style={styles.subtitle}>Jangan khawatir, kami akan membantu memulihkan akun Anda.</Text>
      </View>

      <View style={styles.formContainer}>
        {!isSuccess ? (
          <>
            <View style={styles.iconWrapper}>
              <MaterialIcons name="lock-reset" size={60} color={theme.colors.primary} />
            </View>

            <Text style={styles.instructions}>
              Masukkan alamat email yang terdaftar pada akun Anda. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi.
            </Text>

            <View style={{ marginBottom: theme.spacing.xl }}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Email Address</Text>
                <Text style={styles.requiredBadge}>*Wajib</Text>
              </View>
              <View style={[styles.inputBox, { marginBottom: 4 }, emailError && styles.inputBoxError]}>
                <MaterialIcons 
                  name="email" 
                  size={20} 
                  color={emailError ? theme.colors.danger : theme.colors.textMuted} 
                  style={styles.icon} 
                />
                <TextInput
                  style={styles.input}
                  placeholder="Masukkan email Anda"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (emailError) setEmailError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              {emailError ? (
                <View style={styles.inlineErrorRow}>
                  <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
                  <Text style={styles.inlineErrorText}>{emailError}</Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleReset} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>KIRIM TAUTAN RESET</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.successContainer}>
            <View style={styles.successIconWrapper}>
              <MaterialIcons name="check-circle" size={80} color={theme.colors.success} />
            </View>
            <Text style={styles.successTitle}>Email Terkirim!</Text>
            <Text style={styles.successMessage}>
              Silakan periksa kotak masuk email Anda ({email}) untuk instruksi lebih lanjut.
            </Text>
            <TouchableOpacity style={styles.submitBtn} onPress={() => router.back()}>
              <Text style={styles.submitBtnText}>KEMBALI KE LOGIN</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { 
    backgroundColor: theme.colors.primary, 
    paddingTop: 60, 
    paddingBottom: 40,
    paddingHorizontal: theme.spacing.xl,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    elevation: 10,
    shadowColor: theme.colors.primary, shadowOpacity: 0.4, shadowRadius: 15, shadowOffset: { height: 5, width: 0 }
  },
  backBtn: { marginBottom: 16, width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
  
  formContainer: { padding: theme.spacing.xl, marginTop: theme.spacing.m },
  iconWrapper: { 
    alignSelf: 'center', width: 100, height: 100, borderRadius: 50, 
    backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', 
    marginBottom: 24, elevation: 2, shadowColor: '#3b82f6', shadowOpacity: 0.1, shadowRadius: 5 
  },
  instructions: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  
  label: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  requiredBadge: { color: theme.colors.danger, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.m,
    paddingHorizontal: theme.spacing.m,
    marginBottom: theme.spacing.m,
    height: 55,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3
  },
  inputBoxError: {
    borderColor: theme.colors.danger,
    borderWidth: 1.5,
    backgroundColor: '#fff5f5'
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 2
  },
  inlineErrorText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
    flex: 1
  },
  icon: { marginRight: 10 },
  input: { flex: 1, color: theme.colors.text, fontSize: 16 },
  
  submitBtn: {
    backgroundColor: theme.colors.primary,
    height: 55,
    borderRadius: theme.radius.m,
    justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: theme.colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { height: 4, width: 0 }
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },

  successContainer: { alignItems: 'center', paddingTop: 20 },
  successIconWrapper: { marginBottom: 24 },
  successTitle: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text, marginBottom: 12 },
  successMessage: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 40, lineHeight: 22, paddingHorizontal: 20 }
});
