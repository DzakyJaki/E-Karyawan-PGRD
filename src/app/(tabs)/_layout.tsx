import React, { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { theme } from '../../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TabsLayout() {
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
      },
      headerShadowVisible: false,
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
      tabBarStyle: {
        backgroundColor: theme.colors.card,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        height: 60,
        paddingBottom: 8,
        paddingTop: 8,
      },
      tabBarActiveTintColor: theme.colors.primaryLight,
      tabBarInactiveTintColor: theme.colors.textMuted,
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Beranda',
        headerShown: false,
        tabBarIcon: ({ color }) => <MaterialIcons name="home" size={24} color={color} />
      }} />
      <Tabs.Screen name="leave" options={{
        title: 'Cuti',
        tabBarIcon: ({ color }) => <MaterialIcons name="beach-access" size={24} color={color} />
      }} />
      <Tabs.Screen name="attendance" options={{
        title: 'Presensi',
        tabBarLabel: () => null,
        tabBarIcon: ({ focused }) => (
          <View style={[styles.centerButton, focused && styles.centerButtonFocused]}>
            <MaterialIcons name="fingerprint" size={32} color="#fff" />
          </View>
        )
      }} />
      <Tabs.Screen name="overtime" options={{
        title: 'Lembur',
        tabBarIcon: ({ color }) => <MaterialIcons name="schedule" size={24} color={color} />
      }} />
      <Tabs.Screen 
        name="profile" 
        options={{
          title: 'Profil',
          headerShown: false,
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={24} color={color} />
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
