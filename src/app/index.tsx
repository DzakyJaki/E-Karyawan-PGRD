import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { theme } from '../core/theme';

export default function Index() {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Jalankan animasi fade-in logo
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Cek token auth setelah delay 2 detik (supaya splash screen kelihatan)
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        setTimeout(() => {
          if (token) {
            router.replace('/(tabs)');
          } else {
            router.replace('/login');
          }
        }, 1500);
      } catch {
        router.replace('/login');
      }
    };
    
    checkAuth();
  }, []);

  return (
    <View style={styles.splashContainer}>
      <Animated.View style={[styles.logoWrapper, { opacity: fadeAnim }]}>
        <View style={styles.logoCircle}>
          <MaterialIcons name="business" size={70} color={theme.colors.primary} />
        </View>
        <Text style={styles.splashTitle}>E-Karyawan</Text>
        <Text style={styles.splashSubtitle}>Sistem Informasi Karyawan</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 120,
    height: 120,
    backgroundColor: '#fff',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  splashTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: 1
  },
  splashSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase'
  }
});