import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  BreakAlertEvent,
  subscribeBreakAlerts,
} from '../core/breakNotificationService';

const { width } = Dimensions.get('window');

export function BreakNotificationBanner() {
  const insets = useSafeAreaInsets();
  const [currentAlert, setCurrentAlert] = useState<BreakAlertEvent | null>(null);
  const slideAnim = useRef(new Animated.Value(-150)).current;
  const dismissTimerRef = useRef<any>(null);

  const dismissBanner = React.useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: -200,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setCurrentAlert(null);
    });
  }, [slideAnim]);

  useEffect(() => {
    const unsubscribe = subscribeBreakAlerts((alert) => {
      // Getar perangkat layaknya pesan instan masuk
      try {
        Vibration.vibrate([0, 350, 150, 350]);
      } catch {}

      setCurrentAlert(alert);

      // Batalkan timer dismiss sebelumnya jika ada
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }

      // Animasi meluncur turun dari atas layar
      Animated.spring(slideAnim, {
        toValue: insets.top > 0 ? insets.top + 8 : 16,
        useNativeDriver: true,
        friction: 7,
        tension: 50,
      }).start();

      // Auto dismiss setelah 8 detik
      dismissTimerRef.current = setTimeout(() => {
        dismissBanner();
      }, 8000);
    });

    return () => {
      unsubscribe();
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [insets.top, slideAnim, dismissBanner]);

  const handlePressBanner = () => {
    dismissBanner();
    try {
      router.push('/(tabs)/attendance' as any);
    } catch (e) {
      console.log('Error navigating to attendance from banner:', e);
    }
  };

  if (!currentAlert) {
    return null;
  }

  const isReturnTime = currentAlert.type.includes('end');

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        style={[
          styles.card,
          isReturnTime ? styles.cardReturn : styles.cardBreak,
        ]}
        onPress={handlePressBanner}
      >
        {/* Top Header Row (WhatsApp / iOS banner style with App Icon) */}
        <View style={styles.headerRow}>
          <View style={styles.badgeRow}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={styles.headerAppIcon}
            />
            <Text style={styles.appName}>E-KARYAWAN</Text>
            <View style={styles.headerDotSeparator} />
            <Text style={styles.categoryBadge}>
              {isReturnTime ? 'Jam Masuk' : 'Waktu Istirahat'}
            </Text>
          </View>
          <View style={styles.rightHeader}>
            <Text style={styles.timeLabel}>Baru saja</Text>
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={dismissBanner}
              style={styles.closeBtn}
            >
              <MaterialIcons name="close" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content Row with prominent App Icon */}
        <View style={styles.contentRow}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={styles.appIconLarge}
            resizeMode="cover"
          />
          <View style={styles.textWrapper}>
            <Text style={styles.titleText} numberOfLines={1}>
              {currentAlert.title}
            </Text>
            <Text style={styles.bodyText} numberOfLines={2}>
              {currentAlert.body}
            </Text>
          </View>
        </View>

        {/* Action Button Row */}
        <View style={styles.actionRow}>
          <Text style={styles.actionPrompt}>Ketuk untuk presensi sekarang</Text>
          <View style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Buka Presensi</Text>
            <MaterialIcons name="chevron-right" size={16} color="#ffffff" />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  card: {
    width: Math.min(width - 24, 420),
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1,
  },
  cardBreak: {
    borderColor: '#fde68a',
    backgroundColor: '#fffdfa',
  },
  cardReturn: {
    borderColor: '#bfdbfe',
    backgroundColor: '#f8faff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerAppIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  headerDotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#94a3b8',
    marginHorizontal: 2,
  },
  categoryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  appName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  rightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  closeBtn: {
    padding: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  appIconLarge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#032a55',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  textWrapper: {
    flex: 1,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  bodyText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  actionPrompt: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 2,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});
