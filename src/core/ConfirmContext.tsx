import React, { createContext, useContext, useState, ReactNode } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { theme } from './theme';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
}

interface ConfirmContextData {
  showConfirm: (options: ConfirmOptions) => void;
}

const ConfirmContext = createContext<ConfirmContextData>({ showConfirm: () => {} });

export const useConfirm = () => useContext(ConfirmContext);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfig] = useState<ConfirmOptions | null>(null);
  const [visible, setVisible] = useState(false);

  const scaleAnim = React.useRef(new Animated.Value(0.8)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  const showConfirm = (options: ConfirmOptions) => {
    setConfig({
      confirmText: 'Ya',
      cancelText: 'Batal',
      type: 'warning',
      ...options
    });
    setVisible(true);
    
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true
      })
    ]).start();
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      })
    ]).start(() => {
      setVisible(false);
      setConfig(null);
    });
  };

  const handleConfirm = () => {
    if (config?.onConfirm) {
      config.onConfirm();
    }
    handleClose();
  };

  return (
    <ConfirmContext.Provider value={{ showConfirm }}>
      {children}
      
      <Modal transparent visible={visible} animationType="none">
        <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
          <Animated.View style={[styles.dialog, { transform: [{ scale: scaleAnim }] }]}>
            
            <View style={[
              styles.iconRing, 
              { backgroundColor: config?.type === 'danger' ? '#fee2e2' : config?.type === 'info' ? '#e0e7ff' : '#fef3c7' }
            ]}>
              <View style={[
                styles.iconContainer, 
                { backgroundColor: config?.type === 'danger' ? '#fecaca' : config?.type === 'info' ? '#c7d2fe' : '#fde68a' }
              ]}>
                <MaterialIcons 
                  name={config?.type === 'danger' ? 'delete-forever' : config?.type === 'info' ? 'info' : 'warning'} 
                  size={36} 
                  color={config?.type === 'danger' ? theme.colors.danger : config?.type === 'info' ? theme.colors.primary : theme.colors.warning} 
                />
              </View>
            </View>

            <Text style={styles.title}>{config?.title}</Text>
            <Text style={styles.message}>{config?.message}</Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.btnCancel} onPress={handleClose} activeOpacity={0.7}>
                <Text style={styles.btnCancelText}>{config?.cancelText}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.btnConfirm, 
                  { backgroundColor: config?.type === 'danger' ? theme.colors.danger : theme.colors.primary }
                ]} 
                onPress={handleConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.btnConfirmText}>{config?.confirmText}</Text>
              </TouchableOpacity>
            </View>
            
          </Animated.View>
        </Animated.View>
      </Modal>
    </ConfirmContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  dialog: {
    backgroundColor: '#fff',
    width: '100%',
    borderRadius: 24,
    padding: theme.spacing.xl,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 }
  },
  iconRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.l,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 }
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center'
  },
  message: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 100,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  btnCancelText: {
    color: theme.colors.textMuted,
    fontWeight: 'bold',
    fontSize: 15
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 100,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }
  },
  btnConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15
  }
});
