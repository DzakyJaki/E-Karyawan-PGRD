import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  Image
} from 'react-native';
import { theme } from '../../../core/theme';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<{ email?: string; password?: string }>({});

  const handleLogin = async () => {
    const errors: { email?: string; password?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email.trim()) {
      errors.email = 'Email address wajib diisi';
    } else if (!emailRegex.test(email.trim())) {
      errors.email = 'Format email tidak valid (contoh: user@domain.com)';
    }

    if (!password) {
      errors.password = 'Password wajib diisi';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    setLoading(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, client: 'apk' })
      });

      const data = await response.json();
      
      if (response.ok && data.accessToken) {
        await AsyncStorage.setItem('userToken', data.accessToken);
        if (data.userData) {
          await AsyncStorage.setItem('userData', JSON.stringify(data.userData));
        }
        // Kosongkan form password setelah login sukses
        setPassword('');
        router.replace('/(tabs)');
      } else {
        Alert.alert('Login Gagal', data.message || 'Email atau Password salah.');
      }
    } catch {
      Alert.alert('Error', 'Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Image 
            source={require('@/assets/images/icon.png')} 
            style={styles.logoImage} 
            resizeMode="cover"
          />
        </View>
        <Text style={styles.title}>E-Karyawan</Text>
        <Text style={styles.subtitle}>Sistem Informasi Karyawan</Text>
      </View>

      {/* Form */}
      <View style={styles.formContainer}>
        <View style={{ marginBottom: theme.spacing.s }}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Email Address</Text>
            <Text style={styles.requiredBadge}>*Wajib</Text>
          </View>
          <View style={[styles.inputBox, formErrors.email && styles.inputBoxError]}>
            <MaterialIcons 
              name="email" 
              size={20} 
              color={formErrors.email ? theme.colors.danger : theme.colors.textMuted} 
              style={styles.icon} 
            />
            <TextInput
              style={styles.input}
              placeholder="Masukkan email"
              placeholderTextColor="#94a3b8"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (formErrors.email) setFormErrors(prev => ({ ...prev, email: undefined }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>
          {formErrors.email ? (
            <View style={styles.inlineErrorRow}>
              <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
              <Text style={styles.inlineErrorText}>{formErrors.email}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ marginBottom: theme.spacing.s }}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Password</Text>
            <Text style={styles.requiredBadge}>*Wajib</Text>
          </View>
          <View style={[styles.inputBox, formErrors.password && styles.inputBoxError]}>
            <MaterialIcons 
              name="lock" 
              size={20} 
              color={formErrors.password ? theme.colors.danger : theme.colors.textMuted} 
              style={styles.icon} 
            />
            <TextInput
              style={styles.input}
              placeholder="Masukkan password"
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (formErrors.password) setFormErrors(prev => ({ ...prev, password: undefined }));
              }}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <MaterialIcons name={showPassword ? "visibility" : "visibility-off"} size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          {formErrors.password ? (
            <View style={styles.inlineErrorRow}>
              <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
              <Text style={styles.inlineErrorText}>{formErrors.password}</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push('/forgot-password')}>
          <Text style={styles.forgotText}>Lupa Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginBtnText}>MASUK SEKARANG</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2026 TIM IT</Text>
      </View>
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {Platform.OS === 'web' ? (
        formContent
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          {formContent}
        </TouchableWithoutFeedback>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  header: {
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    elevation: 10,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 15,
    shadowOffset: { height: 5, width: 0 }
  },
  logoCircle: {
    width: 96,
    height: 96,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { height: 4, width: 0 }
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },

  formContainer: {
    padding: theme.spacing.xl,
    marginTop: theme.spacing.l,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  requiredBadge: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.m,
    paddingHorizontal: theme.spacing.m,
    marginBottom: theme.spacing.m,
    height: 55,
  },
  inputBoxError: {
    borderColor: theme.colors.danger,
    borderWidth: 1.5,
    backgroundColor: '#fff5f5',
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  inlineErrorText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
    flex: 1,
  },
  icon: { marginRight: 10 },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    height: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },

  forgotBtn: { alignSelf: 'flex-end', marginBottom: theme.spacing.xl, marginTop: -8 },
  forgotText: { color: theme.colors.primaryLight, fontWeight: '600' },

  loginBtn: {
    backgroundColor: theme.colors.primary,
    height: 55,
    borderRadius: theme.radius.m,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { height: 2, width: 0 }
  },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },

  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    marginTop: 'auto',
  },
  footerText: { color: theme.colors.textMuted, fontSize: 12 },
});
