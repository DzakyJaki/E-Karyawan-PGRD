import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  title: string;
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextData {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextData>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toastConfig, setToastConfig] = useState<ToastOptions | null>(null);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const showToast = ({ title, message, type = 'info', duration = 3000 }: ToastOptions) => {
    setToastConfig({ title, message, type, duration });
    
    // Slide In
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: Platform.OS === 'ios' ? 60 : 40,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();

    // Auto Hide
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start(() => {
        setToastConfig(null);
      });
    }, duration);
  };

  const getToastColors = (type: ToastType) => {
    switch (type) {
      case 'success': return { bg: '#10b981', icon: 'check-circle' };
      case 'error': return { bg: '#f43f5e', icon: 'error' };
      case 'warning': return { bg: '#f59e0b', icon: 'warning' };
      default: return { bg: '#3b82f6', icon: 'info' };
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toastConfig && (
        <Animated.View 
          style={[
            styles.toastContainer, 
            { 
              transform: [{ translateY: slideAnim }],
              opacity: opacityAnim,
              backgroundColor: getToastColors(toastConfig.type!).bg
            }
          ]}
        >
          <MaterialIcons name={getToastColors(toastConfig.type!).icon as any} size={28} color="#fff" style={styles.icon} />
          <View style={styles.textContainer}>
            <Text style={styles.title}>{toastConfig.title}</Text>
            {toastConfig.message ? <Text style={styles.message}>{toastConfig.message}</Text> : null}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    zIndex: 99999,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  message: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    marginTop: 2,
  },
});
