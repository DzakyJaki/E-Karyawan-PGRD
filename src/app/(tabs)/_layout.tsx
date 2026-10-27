import React, { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { theme } from '../../core/theme';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
  const tabHeight = 60 + (insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 8 : 4));

  useEffect(() => {
    const checkToken = async () => {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/login');
      }
    };
    checkToken();
  }, []);

  return (
    <Tabs screenOptions={{
      headerShown: true,
      headerStyle: { 
        backgroundColor: theme.colors.primary,
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
        borderBottomColor: 'transparent',
      },
      headerShadowVisible: false,
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
      tabBarStyle: {
        backgroundColor: theme.colors.card,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        height: tabHeight,
        paddingBottom: bottomPadding,
        paddingTop: 6,
      },
      tabBarActiveTintColor: theme.colors.primaryLight,
      tabBarInactiveTintColor: theme.colors.textMuted,
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Beranda',
        headerShown: false,
        tabBarIcon: ({ color }) => <MaterialIcons name="home" size={24} color={color as string} />
      }} />
      <Tabs.Screen name="leave" options={{
        title: 'Cuti',
        tabBarIcon: ({ color }) => <MaterialIcons name="beach-access" size={24} color={color as string} />
      }} />
      <Tabs.Screen name="attendance" options={{
        title: 'Presensi',
        headerShown: false,
        tabBarLabel: () => null,
        tabBarIcon: ({ focused }) => (
          <View style={[styles.centerButton, focused && styles.centerButtonFocused]}>
            <MaterialCommunityIcons name="calendar-clock" size={32} color="#fff" />
          </View>
        )
      }} />
      <Tabs.Screen name="salary" options={{
        title: 'Slip Gaji',
        headerShown: true,
        headerLeft: () => null,
        tabBarIcon: ({ color }) => <MaterialIcons name="payments" size={24} color={color as string} />
      }} />
      {/* Tab Lembur disembunyikan sementara sesuai instruksi owner, kodingan tetap utuh */}
      <Tabs.Screen name="overtime" options={{
        href: null,
      }} />
      <Tabs.Screen 
        name="profile" 
        options={{
          title: 'Profil',
          headerShown: false,
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={24} color={color as string} />
        }} 
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.navigate('profile', { screen: 'index' });
          },
        })}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerButton: {
    top: -15,
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primary,
    elevation: 5,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  centerButtonFocused: {
    backgroundColor: theme.colors.primaryLight,
  }
});
