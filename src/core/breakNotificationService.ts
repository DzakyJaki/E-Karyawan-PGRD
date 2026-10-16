import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Kunci penyimpanan
const BREAK_NOTIF_IDS_KEY = '@scheduled_break_notif_ids_v4';
const CHANNEL_ID = 'break-reminders-v4';

export type BreakAlertWindowType =
  | 'break_start_before'
  | 'break_start_now'
  | 'break_end_before'
  | 'break_end_now'
  | 'kantor_limit_before'
  | 'kantor_limit_now'
  | 'kantor_duration_before'
  | 'kantor_duration_now';

export interface BreakAlertEvent {
  title: string;
  body: string;
  type: BreakAlertWindowType;
  timestamp: number;
}

type BreakAlertListener = (alert: BreakAlertEvent) => void;
const alertListeners = new Set<BreakAlertListener>();

/**
 * Langganan event notifikasi pop-up di layar (In-App Floating Banner)
 */
export function subscribeBreakAlerts(callback: BreakAlertListener) {
  alertListeners.add(callback);
  return () => {
    alertListeners.delete(callback);
  };
}

/**
 * Memicu pop-up di layar aplikasi secara langsung (disertai getar)
 */
export function triggerBreakAlert(alert: BreakAlertEvent) {
  try {
    Vibration.vibrate([0, 350, 150, 350]);
  } catch {}
  alertListeners.forEach((cb) => {
    try {
      cb(alert);
    } catch (e) {
      console.log('Error dispatching break alert listener:', e);
    }
  });
}

interface SafeNotificationsAPI {
  scheduleNotificationAsync: (request: any) => Promise<string>;
  cancelScheduledNotificationAsync: (id: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync?: () => Promise<void>;
  setNotificationHandler: (handler: any) => void;
  setNotificationChannelAsync: (channelId: string, channel: any) => Promise<any>;
  getPermissionsAsync: () => Promise<any>;
  requestPermissionsAsync: (options?: any) => Promise<any>;
  addNotificationResponseReceivedListener: (listener: (response: any) => void) => { remove: () => void };
  AndroidImportance: {
    UNKNOWN: number;
    UNSPECIFIED: number;
    NONE: number;
    MIN: number;
    LOW: number;
    DEFAULT: number;
    HIGH: number;
    MAX: number;
  };
  AndroidNotificationVisibility: {
    UNKNOWN: number;
    PUBLIC: number;
    PRIVATE: number;
    SECRET: number;
  };
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: string;
    CALENDAR: string;
    DATE: string;
    DAILY: string;
    WEEKLY: string;
    MONTHLY: string;
    YEARLY: string;
  };
}

let cachedNotifications: SafeNotificationsAPI | null = null;
let isNotificationsChecked = false;

/**
 * Memuat modul notifikasi lokal Expo secara aman & terlindungi
 */
function getSafeNotifications(): SafeNotificationsAPI | null {
  if (isNotificationsChecked) {
    return cachedNotifications;
  }
  isNotificationsChecked = true;

  if (Platform.OS === 'web') {
    cachedNotifications = null;
    return null;
  }

  try {
    // Dynamic require modul lokal tanpa memuat remote push topics (ExpoTopicSubscriptionModule)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sched = require('expo-notifications/build/scheduleNotificationAsync');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cancel = require('expo-notifications/build/cancelScheduledNotificationAsync');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cancelAll = require('expo-notifications/build/cancelAllScheduledNotificationsAsync');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const handler = require('expo-notifications/build/NotificationsHandler');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('expo-notifications/build/NotificationPermissions');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const emitter = require('expo-notifications/build/NotificationsEmitter');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const channelTypes = require('expo-notifications/build/NotificationChannelManager.types');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifTypes = require('expo-notifications/build/Notifications.types');

    // Khusus Android channel resolver
    let setNotificationChannelAsync: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const channelAndroid = require('expo-notifications/build/setNotificationChannelAsync.android');
      setNotificationChannelAsync = channelAndroid.setNotificationChannelAsync;
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const channelGeneric = require('expo-notifications/build/setNotificationChannelAsync');
        setNotificationChannelAsync = channelGeneric.setNotificationChannelAsync;
      } catch {}
    }

    cachedNotifications = {
      scheduleNotificationAsync: sched.scheduleNotificationAsync,
      cancelScheduledNotificationAsync: cancel.cancelScheduledNotificationAsync,
      cancelAllScheduledNotificationsAsync: cancelAll.cancelAllScheduledNotificationsAsync,
      setNotificationHandler: handler.setNotificationHandler,
      setNotificationChannelAsync: setNotificationChannelAsync || (async () => null),
      getPermissionsAsync: perms.getPermissionsAsync,
      requestPermissionsAsync: perms.requestPermissionsAsync,
      addNotificationResponseReceivedListener: emitter.addNotificationResponseReceivedListener,
      AndroidImportance: channelTypes.AndroidImportance || { MAX: 7, HIGH: 6, DEFAULT: 5 },
      AndroidNotificationVisibility: channelTypes.AndroidNotificationVisibility || { PUBLIC: 1 },
      SchedulableTriggerInputTypes: notifTypes.SchedulableTriggerInputTypes || { TIME_INTERVAL: 'timeInterval' },
    };
    return cachedNotifications;
  } catch (err) {
    console.log('[Safe Notifications] Expo local notifications module not available:', err);
    cachedNotifications = null;
    return null;
  }
}

/**
 * Mengirim notifikasi sistem ke background (drawer / status bar / lockscreen Android)
 */
async function sendSystemNotification(
  title: string, 
  body: string, 
  delaySeconds: number = 0,
  identifier?: string
) {
  try {
    const notif = getSafeNotifications();
    if (!notif || typeof notif.scheduleNotificationAsync !== 'function') {
      return null;
    }

    // Pastikan izin notifikasi sistem telah diaktifkan
    if (typeof notif.getPermissionsAsync === 'function') {
      const perms = await notif.getPermissionsAsync();
      if (perms.status !== 'granted' && typeof notif.requestPermissionsAsync === 'function') {
        await notif.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
      }
    }

    const trigger = delaySeconds > 0
      ? {
          type: notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: delaySeconds,
          repeats: false,
          channelId: CHANNEL_ID,
        }
      : { channelId: CHANNEL_ID };

    let notifId: string | null = null;
    try {
      notifId = await notif.scheduleNotificationAsync({
        ...(identifier ? { identifier } : {}),
        content: {
          title,
          body,
          data: {
            screen: '/(tabs)/attendance',
            type: 'break_reminder',
            timestamp: Date.now(),
          },
          sound: 'default', // Mengikuti nada sistem default di HP
          priority: 'max',  // Prioritas tertinggi agar tampil di lockscreen & heads-up
          color: '#2563eb',
          badge: 1,
          vibrate: [0, 500, 250, 500],
        },
        trigger,
      });
    } catch {
      // Fallback tanpa channelId khusus jika di lingkungan Expo Go
      try {
        const fallbackTrigger = delaySeconds > 0
          ? {
              type: notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: delaySeconds,
              repeats: false,
            }
          : null;

        notifId = await notif.scheduleNotificationAsync({
          ...(identifier ? { identifier } : {}),
          content: {
            title,
            body,
            data: {
              screen: '/(tabs)/attendance',
              type: 'break_reminder',
              timestamp: Date.now(),
            },
            sound: 'default',
            priority: 'max',
            color: '#2563eb',
            badge: 1,
            vibrate: [0, 500, 250, 500],
          },
          trigger: fallbackTrigger as any,
        });
      } catch (fallbackErr) {
        console.log('Safe warning: fallback scheduleNotificationAsync error:', fallbackErr);
      }
    }

    return notifId;
  } catch (e) {
    console.log('Safe warning: sendSystemNotification error:', e);
    return null;
  }
}

/**
 * Memicu simulasi tes notifikasi pengingat istirahat
 * @param delaySeconds Jumlah detik jeda (misal 5 detik agar pengguna sempat mematikan layar / menutup aplikasi)
 */
export async function triggerTestBreakNotification(delaySeconds: number = 0) {
  await initBreakNotificationService();
  const alertData: BreakAlertEvent = {
    title: '⏰ Pengingat: 5 Menit Menuju Waktu Istirahat (Shift 1)',
    body: 'Waktu istirahat Anda akan dimulai dalam 5 menit (pukul 12:10 WIB). Bersiaplah untuk istirahat.',
    type: 'break_start_before',
    timestamp: Date.now(),
  };

  if (delaySeconds <= 0) {
    // 1. Munculkan Pop-up Banner meluncur di atas layar + Getar HP jika instan
    triggerBreakAlert(alertData);
  }

  // 2. Kirim juga ke notifikasi sistem Android (status bar, lockscreen & nada dering HP)
  const id = await sendSystemNotification(alertData.title, alertData.body, delaySeconds);
  return id;
}

/**
 * Inisialisasi Channel Notifikasi Android dan Listener Respon Klik
 */
let isInitialized = false;
export async function initBreakNotificationService() {
  if (isInitialized) return;
  isInitialized = true;

  try {
    const notif = getSafeNotifications();
    if (notif) {
      // 1. Inisialisasi Handler Notifikasi Foreground
      if (typeof notif.setNotificationHandler === 'function') {
        notif.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
      }

      // 2. Konfigurasi Channel Notifikasi Android (Importance MAX = pop-up + suara + getar + lockscreen)
      // Di Expo Go Android, NotificationsChannelsProvider bernilai null sehingga sengaja dilewati agar tidak muncul warning/error.
      // Channel kustom ini akan aktif penuh saat dibuild menjadi file APK mandiri.
      const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
      if (Platform.OS === 'android' && !isExpoGo && typeof notif.setNotificationChannelAsync === 'function') {
        try {
          await notif.setNotificationChannelAsync(CHANNEL_ID, {
            name: 'Pengingat Waktu Istirahat & Masuk',
            description: 'Notifikasi pop-up dan suara pengingat istirahat & jam masuk kembali',
            importance: notif.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 250, 500],
            lightColor: '#2563eb',
            sound: 'default', // Mengikuti nada dering sistem di HP
            enableVibrate: true,
            showBadge: true,
            lockscreenVisibility: notif.AndroidNotificationVisibility.PUBLIC, // Tampil di layar kunci saat HP dimatikan
            bypassDnd: false,
          });
        } catch {}
      }

      // 3. Minta Izin Notifikasi (Android 13+ & iOS)
      if (typeof notif.getPermissionsAsync === 'function') {
        const { status: existingStatus } = await notif.getPermissionsAsync();
        if (existingStatus !== 'granted' && typeof notif.requestPermissionsAsync === 'function') {
          await notif.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
        }
      }

      // 4. Listener saat pengguna mengklik notifikasi sistem (arahkan ke menu presensi)
      if (typeof notif.addNotificationResponseReceivedListener === 'function') {
        notif.addNotificationResponseReceivedListener((response) => {
          const data = response?.notification?.request?.content?.data;
          if (data?.screen) {
            try {
              router.push(data.screen as any);
            } catch (e) {
              console.log('Error navigating from notification:', e);
            }
          }
        });
      }
    }

    // Mulai ticker real-time untuk memantau waktu secara terus menerus
    startBreakTicker();
  } catch (err) {
    console.log('Safe warning: initBreakNotificationService error:', err);
  }
}

/**
 * Helper untuk mengubah string format "HH:mm" atau "HH:mm:ss" menjadi Date hari ini
 */
function parseTodayTimeString(timeStr?: string | null): Date | null {
  if (!timeStr) return null;
  const clean = timeStr.trim().split(':');
  if (clean.length < 2) return null;

  const hours = parseInt(clean[0], 10);
  const minutes = parseInt(clean[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;

  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Membatalkan semua notifikasi pengingat istirahat yang sebelumnya telah dijadwalkan
 */
export async function cancelAllBreakReminders() {
  try {
    const notif = getSafeNotifications();
    // 1. Batalkan semua notifikasi di antrean sistem OS secara menyeluruh
    if (notif && typeof notif.cancelAllScheduledNotificationsAsync === 'function') {
      await notif.cancelAllScheduledNotificationsAsync().catch(() => {});
    }

    // 2. Batalkan juga berdasarkan tracking ID lama jika ada
    const rawIds = await AsyncStorage.getItem(BREAK_NOTIF_IDS_KEY);
    if (rawIds) {
      const ids: string[] = JSON.parse(rawIds);
      if (notif && typeof notif.cancelScheduledNotificationAsync === 'function') {
        for (const id of ids) {
          await notif.cancelScheduledNotificationAsync(id).catch(() => {});
        }
      }
      await AsyncStorage.removeItem(BREAK_NOTIF_IDS_KEY);
    }
  } catch (err) {
    console.log('Safe warning: cancelAllBreakReminders error:', err);
  }
}

// Memory Cache untuk data jadwal terakhir
let cachedWorkTimeData: any = null;
let cachedTodayAttendance: any = null;

/**
 * Memeriksa apakah saat ini jam HP sedang berada di salah satu jendela pengingat aktif,
 * lalu langsung memicu POP-UP DI LAYAR dan NOTIFIKASI DI BELAKANG APLIKASI
 */
async function checkAndTriggerActiveReminders() {
  try {
    if (!cachedWorkTimeData || cachedWorkTimeData.is_closed_today) {
      return;
    }

    const now = new Date();
    const todayStr = cachedWorkTimeData.today || now.toISOString().split('T')[0];

    // Pembersihan otomatis: Hapus cache flag notifikasi dari hari-hari sebelumnya agar tidak menumpuk
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const oldAlertKeys = allKeys.filter((k) => k.startsWith('@alert_v3_') && !k.includes(todayStr));
      if (oldAlertKeys.length > 0) {
        await AsyncStorage.multiRemove(oldAlertKeys);
      }
    } catch {}

    const hasStartedBreak = Boolean(cachedTodayAttendance?.break_start);
    const hasEndedBreak = Boolean(cachedTodayAttendance?.break_end);

    if (hasEndedBreak) {
      return;
    }

    const isShift = cachedWorkTimeData.break_type === 'shift' || (
      Boolean(cachedWorkTimeData.break_start_time) && 
      Boolean(cachedWorkTimeData.break_end_time) && 
      cachedWorkTimeData.break_type !== 'kantor'
    );

    if (isShift) {
      const shiftName = cachedWorkTimeData.break_shift_name ? `(${cachedWorkTimeData.break_shift_name})` : '';
      const startTime = parseTodayTimeString(cachedWorkTimeData.break_start_time);
      const endTime = parseTodayTimeString(cachedWorkTimeData.break_end_time);

      const startLabel = cachedWorkTimeData.break_start_time?.substring(0, 5) || '';
      const endLabel = cachedWorkTimeData.break_end_time?.substring(0, 5) || '';

      // --- 1. JENDELA MULAI ISTIRAHAT ---
      if (!hasStartedBreak && startTime) {
        const t1 = new Date(startTime.getTime() - 5 * 60 * 1000); // 5 Menit Sebelum
        const t2 = new Date(startTime.getTime() + 5 * 60 * 1000); // 5 Menit Sesudah

        // 5 Menit SEBELUM Mulai
        if (now.getTime() >= t1.getTime() && now.getTime() < startTime.getTime()) {
          const firedKey = `@alert_v3_${todayStr}_start_before_${startLabel}`;
          const already = await AsyncStorage.getItem(firedKey);
          if (!already) {
            await AsyncStorage.setItem(firedKey, '1');
            const alertData: BreakAlertEvent = {
              title: `⏰ 5 Menit Menuju Waktu Istirahat ${shiftName}`.trim(),
              body: `Waktu istirahat Anda akan dimulai dalam beberapa saat (pukul ${startLabel} WIB). Bersiaplah untuk istirahat.`,
              type: 'break_start_before',
              timestamp: Date.now(),
            };
            triggerBreakAlert(alertData);
            sendSystemNotification(alertData.title, alertData.body, 1);
          }
        }
        // 5 Menit SESUDAH Mulai
        else if (now.getTime() >= startTime.getTime() && now.getTime() <= t2.getTime()) {
          const firedKey = `@alert_v3_${todayStr}_start_now_${startLabel}`;
          const already = await AsyncStorage.getItem(firedKey);
          if (!already) {
            await AsyncStorage.setItem(firedKey, '1');
            const alertData: BreakAlertEvent = {
              title: `☕ Waktu Istirahat Telah Dimulai ${shiftName}`.trim(),
              body: `Sudah memasuki waktu istirahat (${startLabel} WIB). Segera catat presensi 'Mulai Istirahat' di aplikasi!`,
              type: 'break_start_now',
              timestamp: Date.now(),
            };
            triggerBreakAlert(alertData);
            sendSystemNotification(alertData.title, alertData.body, 1);
          }
        }
      }

      // --- 2. JENDELA SELESAI ISTIRAHAT (MASUK KEMBALI) ---
      if (endTime) {
        const t3 = new Date(endTime.getTime() - 5 * 60 * 1000); // 5 Menit Sebelum Selesai
        const t4 = new Date(endTime.getTime() + 5 * 60 * 1000); // 5 Menit Sesudah Selesai

        // 5 Menit SEBELUM Jam Selesai
        if (now.getTime() >= t3.getTime() && now.getTime() < endTime.getTime()) {
          const firedKey = `@alert_v3_${todayStr}_end_before_${endLabel}`;
          const already = await AsyncStorage.getItem(firedKey);
          if (!already) {
            await AsyncStorage.setItem(firedKey, '1');
            const alertData: BreakAlertEvent = {
              title: `⏳ 5 Menit Menuju Waktu Masuk ${shiftName}`.trim(),
              body: `Waktu istirahat tersisa sebentar lagi (selesai pukul ${endLabel} WIB). Bersiaplah kembali bekerja.`,
              type: 'break_end_before',
              timestamp: Date.now(),
            };
            triggerBreakAlert(alertData);
            sendSystemNotification(alertData.title, alertData.body, 1);
          }
        }
        // 5 Menit SESUDAH Jam Selesai (Jika belum presensi selesai rehat)
        else if (now.getTime() >= endTime.getTime() && now.getTime() <= t4.getTime() && !hasEndedBreak) {
          const firedKey = `@alert_v3_${todayStr}_end_now_${endLabel}`;
          const already = await AsyncStorage.getItem(firedKey);
          if (!already) {
            await AsyncStorage.setItem(firedKey, '1');
            const alertData: BreakAlertEvent = {
              title: `🏢 Waktu Masuk Kembali! ${shiftName}`.trim(),
              body: `Jam istirahat telah berakhir (${endLabel} WIB). Segera tekan 'Selesai Istirahat' di aplikasi.`,
              type: 'break_end_now',
              timestamp: Date.now(),
            };
            triggerBreakAlert(alertData);
            sendSystemNotification(alertData.title, alertData.body, 1);
          }
        }
      }
    }
    // --- SKENARIO KANTOR ---
    else if (cachedWorkTimeData.break_type === 'kantor' || cachedWorkTimeData.kantor_break_until) {
      const untilLabel = cachedWorkTimeData.kantor_break_until?.substring(0, 5) || '15:00';
      const limitTime = parseTodayTimeString(cachedWorkTimeData.kantor_break_until || '15:00');

      if (limitTime) {
        const tLimitBefore = new Date(limitTime.getTime() - 5 * 60 * 1000);
        const tLimitAfter = new Date(limitTime.getTime() + 5 * 60 * 1000);

        if (now.getTime() >= tLimitBefore.getTime() && now.getTime() < limitTime.getTime()) {
          const firedKey = `@alert_v3_${todayStr}_kantor_before_${untilLabel}`;
          const already = await AsyncStorage.getItem(firedKey);
          if (!already) {
            await AsyncStorage.setItem(firedKey, '1');
            const alertData: BreakAlertEvent = {
              title: `⚠️ 5 Menit Menuju Batas Istirahat Kantor`,
              body: `Batas akhir waktu istirahat kantor tersisa sebentar lagi (pukul ${untilLabel} WIB). Pastikan Anda telah kembali bekerja.`,
              type: 'kantor_limit_before',
              timestamp: Date.now(),
            };
            triggerBreakAlert(alertData);
            sendSystemNotification(alertData.title, alertData.body, 1);
          }
        } else if (now.getTime() >= limitTime.getTime() && now.getTime() <= tLimitAfter.getTime() && !hasEndedBreak) {
          const firedKey = `@alert_v3_${todayStr}_kantor_now_${untilLabel}`;
          const already = await AsyncStorage.getItem(firedKey);
          if (!already) {
            await AsyncStorage.setItem(firedKey, '1');
            const alertData: BreakAlertEvent = {
              title: `🏢 Batas Istirahat Kantor Telah Berakhir`,
              body: `Batas waktu istirahat kantor telah berakhir (${untilLabel} WIB). Pastikan Anda telah menyelesaikan presensi rehat.`,
              type: 'kantor_limit_now',
              timestamp: Date.now(),
            };
            triggerBreakAlert(alertData);
            sendSystemNotification(alertData.title, alertData.body, 1);
          }
        }
      }
    }
  } catch (err) {
    console.log('Error in checkAndTriggerActiveReminders:', err);
  }
}

/**
 * Ticker real-time yang memantau jam setiap 10 detik
 */
let tickerInterval: any = null;
export function startBreakTicker() {
  if (tickerInterval) return;
  tickerInterval = setInterval(() => {
    checkAndTriggerActiveReminders();
  }, 10000);
}

/**
 * Menjadwalkan pengingat istirahat 5 menit sebelum dan sesudah jam istirahat / jam masuk.
 * Menghasilkan:
 * 1. POP-UP DI LAYAR (In-App Heads-Up Banner meluncur dari atas layaknya WhatsApp)
 * 2. DI BELAKANG APLIKASI (Notifikasi sistem Android di status bar & drawer)
 */
let isSchedulingInProgress = false;
let lastScheduledFingerprint = '';
let lastScheduledTimestamp = 0;

export async function scheduleBreakReminders(
  workTimeData: any,
  todayAttendance?: { break_start?: string | null; break_end?: string | null } | null
) {
  try {
    if (!workTimeData || workTimeData.is_closed_today) {
      return;
    }

    const todayStr = workTimeData.today || new Date().toISOString().split('T')[0];
    const fingerprint = `${todayStr}_${workTimeData.break_type}_${workTimeData.break_start_time}_${workTimeData.break_end_time}_${todayAttendance?.break_start || ''}_${todayAttendance?.break_end || ''}`;
    const nowMs = Date.now();

    // Pencegahan duplikasi: jika konfigurasi sama persis dan baru saja dijadwalkan dalam 10 detik terakhir, abaikan pemanggilan berulang
    if (fingerprint === lastScheduledFingerprint && nowMs - lastScheduledTimestamp < 10000) {
      return;
    }

    if (isSchedulingInProgress) {
      return;
    }
    isSchedulingInProgress = true;
    lastScheduledFingerprint = fingerprint;
    lastScheduledTimestamp = nowMs;

    cachedWorkTimeData = workTimeData;
    cachedTodayAttendance = todayAttendance;

    await initBreakNotificationService();
    await cancelAllBreakReminders();

    const now = new Date();
    const hasStartedBreak = Boolean(todayAttendance?.break_start);
    const hasEndedBreak = Boolean(todayAttendance?.break_end);

    if (hasEndedBreak) {
      return;
    }

    // 1. Periksa jendela aktif saat ini seketika (Immediate check)
    await checkAndTriggerActiveReminders();

    // 2. Jadwalkan waktu-waktu di masa depan ke sistem Android dengan identifier unik (Background scheduler)
    const isShift = workTimeData.break_type === 'shift' || (
      Boolean(workTimeData.break_start_time) && 
      Boolean(workTimeData.break_end_time) && 
      workTimeData.break_type !== 'kantor'
    );

    const scheduledIds: string[] = [];

    if (isShift) {
      const shiftName = workTimeData.break_shift_name ? `(${workTimeData.break_shift_name})` : '';
      const startTime = parseTodayTimeString(workTimeData.break_start_time);
      const endTime = parseTodayTimeString(workTimeData.break_end_time);

      const startLabel = workTimeData.break_start_time?.substring(0, 5) || '';
      const endLabel = workTimeData.break_end_time?.substring(0, 5) || '';

      if (!hasStartedBreak && startTime) {
        const t1 = new Date(startTime.getTime() - 5 * 60 * 1000);
        const t2 = new Date(startTime.getTime() + 5 * 60 * 1000);

        if (t1.getTime() > now.getTime()) {
          const delay = Math.round((t1.getTime() - now.getTime()) / 1000);
          const id = await sendSystemNotification(
            `⏰ 5 Menit Menuju Waktu Istirahat ${shiftName}`.trim(),
            `Waktu istirahat Anda akan dimulai dalam 5 menit (pukul ${startLabel} WIB). Bersiaplah untuk istirahat.`,
            delay,
            'break-shift-start-before'
          );
          if (id) scheduledIds.push(id);
        }

        if (t2.getTime() > now.getTime()) {
          const delay = Math.round((t2.getTime() - now.getTime()) / 1000);
          const id = await sendSystemNotification(
            `☕ Waktu Istirahat Telah Dimulai ${shiftName}`.trim(),
            `Sudah 5 menit memasuki waktu istirahat (${startLabel} WIB). Jangan lupa catat presensi 'Mulai Istirahat' di aplikasi!`,
            delay,
            'break-shift-start-now'
          );
          if (id) scheduledIds.push(id);
        }
      }

      if (endTime) {
        const t3 = new Date(endTime.getTime() - 5 * 60 * 1000);
        const t4 = new Date(endTime.getTime() + 5 * 60 * 1000);

        if (t3.getTime() > now.getTime()) {
          const delay = Math.round((t3.getTime() - now.getTime()) / 1000);
          const id = await sendSystemNotification(
            `⏳ 5 Menit Menuju Waktu Masuk ${shiftName}`.trim(),
            `Waktu istirahat tersisa 5 menit lagi (selesai pukul ${endLabel} WIB). Bersiaplah kembali bekerja.`,
            delay,
            'break-shift-end-before'
          );
          if (id) scheduledIds.push(id);
        }

        if (t4.getTime() > now.getTime()) {
          const delay = Math.round((t4.getTime() - now.getTime()) / 1000);
          const id = await sendSystemNotification(
            `🏢 Waktu Masuk Kembali! ${shiftName}`.trim(),
            `Jam istirahat telah berakhir 5 menit yang lalu (${endLabel} WIB). Jangan lupa tekan 'Selesai Istirahat' di aplikasi.`,
            delay,
            'break-shift-end-now'
          );
          if (id) scheduledIds.push(id);
        }
      }
    } else if (workTimeData.break_type === 'kantor' || workTimeData.kantor_break_until) {
      const untilLabel = workTimeData.kantor_break_until?.substring(0, 5) || '15:00';
      const limitTime = parseTodayTimeString(workTimeData.kantor_break_until || '15:00');

      if (limitTime) {
        const tLimitBefore = new Date(limitTime.getTime() - 5 * 60 * 1000);
        const tLimitAfter = new Date(limitTime.getTime() + 5 * 60 * 1000);

        if (tLimitBefore.getTime() > now.getTime()) {
          const delay = Math.round((tLimitBefore.getTime() - now.getTime()) / 1000);
          const id = await sendSystemNotification(
            `⚠️ 5 Menit Menuju Batas Istirahat Kantor`,
            `Batas akhir waktu istirahat kantor tersisa 5 menit lagi (pukul ${untilLabel} WIB). Pastikan Anda telah kembali bekerja.`,
            delay,
            'break-kantor-limit-before'
          );
          if (id) scheduledIds.push(id);
        }

        if (tLimitAfter.getTime() > now.getTime()) {
          const delay = Math.round((tLimitAfter.getTime() - now.getTime()) / 1000);
          const id = await sendSystemNotification(
            `🏢 Batas Istirahat Kantor Telah Berakhir`,
            `Batas waktu istirahat kantor telah berakhir 5 menit yang lalu (${untilLabel} WIB). Pastikan Anda telah menyelesaikan presensi rehat.`,
            delay,
            'break-kantor-limit-now'
          );
          if (id) scheduledIds.push(id);
        }
      }
    }

    if (scheduledIds.length > 0) {
      await AsyncStorage.setItem(BREAK_NOTIF_IDS_KEY, JSON.stringify(scheduledIds));
    }
  } catch (err) {
    console.log('Safe warning: scheduleBreakReminders error:', err);
  } finally {
    isSchedulingInProgress = false;
  }
}
