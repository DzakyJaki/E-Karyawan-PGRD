import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// A generic utility to save and retrieve token
export const saveToken = async (token: string) => {
  await AsyncStorage.setItem('userToken', token);
};

export const getToken = async () => {
  return await AsyncStorage.getItem('userToken');
};
