import React from 'react';
import { Stack } from 'expo-router';
import { theme } from '../../../core/theme';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Profil',
          headerShown: false, // Induk profil menggunakan header kustom profil
        }}
      />
      <Stack.Screen
        name="employee-data"
        options={{
          title: 'Data Karyawan',
        }}
      />
      <Stack.Screen
        name="salary"
        options={{
          title: 'Slip Gaji',
        }}
      />
      <Stack.Screen
        name="change-password"
        options={{
          title: 'Ubah Password',
        }}
      />
      <Stack.Screen
        name="pin-setup"
        options={{
          title: 'Atur PIN Keamanan',
        }}
      />
      <Stack.Screen
        name="biometrics"
        options={{
          title: 'Biometrik',
        }}
      />
      <Stack.Screen
        name="chat-support"
        options={{
          title: 'Tutorial Penggunaan',
        }}
      />
    </Stack>
  );
}
