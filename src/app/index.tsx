import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

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
  }, [fadeAnim]);

  return (
    <View style={styles.splashContainer}>
      <Animated.View style={[styles.logoWrapper, { opacity: fadeAnim }]}>
        <View style={styles.logoBox}>
          <Image 
            source={require('@/assets/images/icon.png')} 
            style={styles.logoImage} 
            resizeMode="cover"
          />
        </View>
        <Text style={styles.splashSubtitle}>Sistem Informasi Karyawan</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#032a55',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
  },
  logoBox: {
    width: 140,
    height: 140,
    backgroundColor: '#fff',
    borderRadius: 32,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  splashSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase'
  }
});