import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useConfirm } from '../../../core/ConfirmContext';
import { theme } from '../../../core/theme';
import { useToast } from '../../../core/ToastContext';
import { scheduleBreakReminders } from '../../../core/breakNotificationService';
import { 
  calculateBreakDeadline, 
  calculateBreakLateDetails, 
  getEffectiveScheduleForToday, 
  normalizeTimeString 
} from '../../../core/timeUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MONTH_NAMES_INDONESIA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

interface AttendanceItem {
  id: number;
  employee_id: number;
  branch_id?: number;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  clock_in_latitude?: number | null;
  clock_in_longitude?: number | null;
  clock_in_distance_meters?: number | null;
  is_within_radius?: boolean | null;
  clock_out_latitude?: number | null;
  clock_out_longitude?: number | null;
  clock_out_distance_meters?: number | null;
  break_start?: string | null;
  break_end?: string | null;
  break_start_latitude?: string | number | null;
  break_start_longitude?: string | number | null;
  break_end_latitude?: string | number | null;
  break_end_longitude?: string | number | null;
  notes?: string | null;
  overtime_hours?: string | null;
  is_late?: boolean | null;
  late_minutes?: number | null;
  is_early_leave?: boolean | null;
  early_leave_minutes?: number | null;
  late_status?: string | null;
  early_leave_status?: string | null;
  break_late_status?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DailySchedule {
  day_of_week: number;
  work_start_time?: string | null;
  dispensation_time?: string | null;
  work_end_time?: string | null;
  overtime_start_time?: string | null;
  kantor_break_from?: string | null;
  kantor_break_until?: string | null;
  kantor_break_duration?: number | null;
  simultaneous_break_start?: string | null;
  simultaneous_break_end?: string | null;
  is_closed?: boolean;
  is_rest?: boolean;
}

export interface WorkTimeData {
  id: number;
  name: string;
  type?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo?: string | null;
  status?: string;
  latitude?: number | null;
  longitude?: number | null;
  radius_meters: number;
  work_start_time?: string | null;
  dispensation_time?: string | null;
  work_end_time?: string | null;
  overtime_start_time?: string | null;
  break_type?: 'kantor' | 'shift' | string | null;
  break_shift_id?: number | null;
  break_shift_name?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  kantor_break_from?: string | null;
  kantor_break_until?: string | null;
  kantor_break_duration?: number | null;
  is_break_simultaneous?: boolean;
  work_time_source?: string;
  simultaneous_break_start?: string | null;
  simultaneous_break_end?: string | null;
  closed_days?: number[];
  rest_days?: number[];
  schedules?: DailySchedule[];
  today?: string;
  day_name?: string;
  is_closed_today?: boolean;
  is_rest_today?: boolean;
}


// Rumus Haversine untuk menghitung jarak akurat (meter)
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Radius bumi dalam meter
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // Clock state
  const [time, setTime] = useState(new Date());

  // Location & Anti-Fake GPS states
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isMockGps, setIsMockGps] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  // Work Time & Cabang Data (/api/my/work-time)
  const [workTimeData, setWorkTimeData] = useState<WorkTimeData | null>(null);

  // Attendance Data & History
  const [history, setHistory] = useState<AttendanceItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter Month & Year
  const currentD = new Date();
  const [filterMonth, setFilterMonth] = useState(currentD.getMonth() + 1); // 1 - 12
  const [filterYear, setFilterYear] = useState(currentD.getFullYear());
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempMonth, setTempMonth] = useState(currentD.getMonth() + 1);
  const [tempYear, setTempYear] = useState(currentD.getFullYear());
  const [showWeeklyScheduleModal, setShowWeeklyScheduleModal] = useState(false);

  // Branch / Office Info fallback dari profile cache
  const [branchInfo, setBranchInfo] = useState<{ name: string; address?: string } | null>(null);
  const [profileBranch, setProfileBranch] = useState<{
    id?: number;
    name?: string;
    type?: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    radius_meters?: number | null;
  } | null>(null);

  // Live Digital Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load cached branch & work-time info
  useEffect(() => {
    const loadCache = async () => {
      try {
        const cached = await AsyncStorage.getItem('fullProfile');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.branch) {
            setProfileBranch(parsed.branch);
            setBranchInfo({
              name: parsed.branch.name || 'Kantor Cabang',
              address: parsed.branch.address || ''
            });
          }
        }
        const cachedWt = await AsyncStorage.getItem('cachedWorkTime');
        if (cachedWt) {
          setWorkTimeData(JSON.parse(cachedWt));
        }
      } catch {}
    };
    loadCache();
  }, []);

  // Deteksi Lokasi & Anti Fake GPS
  const detectLocation = useCallback(async () => {
    setIsDetectingLocation(true);
    setLocationError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Izin akses GPS ditolak. Silakan aktifkan izin lokasi di pengaturan.');
        setIsDetectingLocation(false);
        return;
      }

      // Pastikan layanan lokasi aktif
      const isLocationServicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationServicesEnabled) {
        setLocationError('Layanan GPS perangkat belum aktif. Silakan nyalakan GPS.');
        setIsDetectingLocation(false);
        return;
      }

      // Ambil posisi akurasi tinggi (menggunakan High untuk kestabilan kombinasi satelit + A-GPS)
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // ============================================
      // CEK ANTI FAKE GPS (Mock Location Provider)
      // ============================================
      if (loc.mocked === true) {
        setIsMockGps(true);
        setCurrentCoords(null);
        setLocationError('Peringatan: Lokasi Palsu (Fake GPS) terdeteksi!');
        showToast({
          title: 'Keamanan GPS',
          message: 'Aplikasi Fake GPS terdeteksi aktif. Presensi tidak diizinkan!',
          type: 'error'
        });
        setIsDetectingLocation(false);
        return;
      }

      if (loc.coords.accuracy != null) {
        setGpsAccuracy(Math.round(loc.coords.accuracy));
      }

      setIsMockGps(false);
      // Filter Jitter GPS:
      // Sinyal GPS satelit alami berfluktuasi 1-3 meter saat HP diletakkan diam di meja (GPS drift).
      // Abaikan pergeseran kecil < 3 meter agar angka jarak tidak melompat-lompat saat HP tidak bergerak.
      setCurrentCoords(prev => {
        if (!prev) {
          return {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          };
        }
        const shiftDist = calculateDistanceMeters(
          prev.latitude,
          prev.longitude,
          loc.coords.latitude,
          loc.coords.longitude
        );
        if (shiftDist < 3) {
          return prev;
        }
        return {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        };
      });
      setLocationError(null);
    } catch (err: any) {
      console.log('Error deteksi lokasi:', err);
      setLocationError('Gagal mendeteksi lokasi GPS. Pastikan GPS menyala dan sinyal baik.');
    } finally {
      setIsDetectingLocation(false);
    }
  }, [showToast]);

  // Fetch Riwayat Presensi
  const fetchAttendanceHistory = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const url = `${apiUrl}/api/my/presensi?month=${filterMonth}&year=${filterYear}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      if (response.status === 401) {
        await AsyncStorage.clear();
        router.replace('/login');
        return;
      }

      const contentType = response.headers.get('content-type');
      if (response.ok && contentType && contentType.includes('application/json')) {
        const json = await response.json();
        if (json && Array.isArray(json.data)) {
          setHistory(json.data);
        }
      }
    } catch (err) {
      console.log('Error fetch presensi:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [filterMonth, filterYear]);

  // Fetch Informasi Jam Kerja Cabang & Radius (/api/my/work-time)
  const fetchWorkTime = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${apiUrl}/api/my/work-time`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      if (response.ok) {
        const json = await response.json();
        if (json && json.data) {
          setWorkTimeData(json.data);
          await AsyncStorage.setItem('cachedWorkTime', JSON.stringify(json.data));
        }
      }
    } catch (err) {
      console.log('Error fetch work-time:', err);
    }
  }, []);

  // Fetch Profile & Data Cabang (/api/my/profile)
  const fetchProfile = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${apiUrl}/api/my/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      if (response.ok) {
        const json = await response.json();
        if (json?.branch) {
          setProfileBranch(json.branch);
          setBranchInfo({
            name: json.branch.name || 'Kantor Cabang',
            address: json.branch.address || ''
          });
          await AsyncStorage.setItem('fullProfile', JSON.stringify(json));
        }
      }
    } catch (err) {
      console.log('Error fetch profile:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    detectLocation();
    fetchAttendanceHistory();
    fetchWorkTime();
    fetchProfile();
  }, [detectLocation, fetchAttendanceHistory, fetchWorkTime, fetchProfile]);

  // Auto refresh GPS periodic
  useEffect(() => {
    const interval = setInterval(detectLocation, 30000);
    return () => clearInterval(interval);
  }, [detectLocation]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([detectLocation(), fetchAttendanceHistory(), fetchWorkTime(), fetchProfile()]);
    setRefreshing(false);
  }, [detectLocation, fetchAttendanceHistory, fetchWorkTime, fetchProfile]);

  // Data koordinat dan radius cabang gabungan (dari work-time atau profile)
  const effectiveBranchLatitude = useMemo(() => {
    if (workTimeData?.latitude != null) return workTimeData.latitude;
    if (profileBranch?.latitude != null) return profileBranch.latitude;
    return null;
  }, [workTimeData, profileBranch]);

  const effectiveBranchLongitude = useMemo(() => {
    if (workTimeData?.longitude != null) return workTimeData.longitude;
    if (profileBranch?.longitude != null) return profileBranch.longitude;
    return null;
  }, [workTimeData, profileBranch]);

  const effectiveRadiusMeters = useMemo(() => {
    if (workTimeData?.radius_meters != null) return workTimeData.radius_meters;
    if (profileBranch?.radius_meters != null) return profileBranch.radius_meters;
    return null;
  }, [workTimeData, profileBranch]);

  const effectiveBranchName = workTimeData?.name || profileBranch?.name || branchInfo?.name || 'Kantor Cabang';

  // Validasi Kritis: Karyawan TIDAK BISA absen jika latitude, longitude, atau radius_meters bernilai null
  const isBranchLocationConfigured = useMemo(() => {
    const hasLat = effectiveBranchLatitude != null && !isNaN(Number(effectiveBranchLatitude));
    const hasLon = effectiveBranchLongitude != null && !isNaN(Number(effectiveBranchLongitude));
    const hasRadius = effectiveRadiusMeters != null && !isNaN(Number(effectiveRadiusMeters)) && Number(effectiveRadiusMeters) > 0;
    
    return Boolean(hasLat && hasLon && hasRadius);
  }, [effectiveBranchLatitude, effectiveBranchLongitude, effectiveRadiusMeters]);

  // Alasan rinci jika konfigurasi cabang belum lengkap (untuk banner peringatan & toast)
  const locationConfigErrorReason = useMemo(() => {
    if (isBranchLocationConfigured) return null;
    const missing: string[] = [];
    const hasLat = effectiveBranchLatitude != null && !isNaN(Number(effectiveBranchLatitude));
    const hasLon = effectiveBranchLongitude != null && !isNaN(Number(effectiveBranchLongitude));
    const hasRadius = effectiveRadiusMeters != null && !isNaN(Number(effectiveRadiusMeters)) && Number(effectiveRadiusMeters) > 0;

    if (!hasLat || !hasLon) {
      missing.push('Titik Koordinat (Latitude & Longitude)');
    }
    if (!hasRadius) {
      missing.push('Radius Presensi (Radius Meters)');
    }
    return missing.join(' dan ');
  }, [isBranchLocationConfigured, effectiveBranchLatitude, effectiveBranchLongitude, effectiveRadiusMeters]);

  // Cari data presensi hari ini
  const todayStr = useMemo(() => {
    if (workTimeData?.today) return workTimeData.today;
    const y = time.getFullYear();
    const m = (time.getMonth() + 1).toString().padStart(2, '0');
    const d = time.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [workTimeData?.today, time]);

  const todayRecord = useMemo(() => {
    return history.find(item => item.date === todayStr);
  }, [history, todayStr]);

  const hasClockedInToday = Boolean(todayRecord?.clock_in);
  const hasClockedOutToday = Boolean(todayRecord?.clock_out);

  // Status Istirahat Hari Ini
  const todayBreakStart = useMemo(() => {
    return todayRecord?.break_start ? todayRecord.break_start.substring(0, 5) : null;
  }, [todayRecord]);

  const todayBreakEnd = useMemo(() => {
    return todayRecord?.break_end ? todayRecord.break_end.substring(0, 5) : null;
  }, [todayRecord]);

  const hasStartedBreakToday = Boolean(todayRecord?.break_start);
  const hasEndedBreakToday = Boolean(todayRecord?.break_end);
  const isCurrentlyOnBreak = hasStartedBreakToday && !hasEndedBreakToday;

  // Resolusi jadwal aktif hari ini (otomatis mencocokkan jadwal hari Jumat/hari lainnya dari backend schedules)
  const activeSchedule = useMemo(() => {
    return getEffectiveScheduleForToday(workTimeData || profileBranch, time);
  }, [workTimeData, profileBranch, time]);

  const effectiveWork = activeSchedule || workTimeData || profileBranch;

  const currentDayOfWeek = time.getDay();

  // Urutan jadwal 7 hari: Senin (1) s/d Minggu (0 -> di paling bawah)
  const orderedSchedules = useMemo(() => {
    const rawSchedules = (Array.isArray(workTimeData?.schedules) && workTimeData.schedules.length > 0)
      ? workTimeData.schedules
      : (Array.isArray((profileBranch as any)?.schedules) ? (profileBranch as any).schedules : []);
    if (!Array.isArray(rawSchedules)) return [];
    return [...rawSchedules].sort((a, b) => {
      const orderA = a.day_of_week === 0 ? 7 : a.day_of_week;
      const orderB = b.day_of_week === 0 ? 7 : b.day_of_week;
      return orderA - orderB;
    });
  }, [workTimeData?.schedules, profileBranch]);

  // Jadwal Jam Istirahat Kantor / Shift
  const breakScheduleText = useMemo(() => {
    if (effectiveWork?.is_closed_today) {
      return 'Libur Hari Ini';
    }

    // 0. Istirahat Serentak (Jumat / Simultaneous Break)
    if (effectiveWork?.has_simultaneous_break) {
      const s = effectiveWork.simultaneous_break_start ? effectiveWork.simultaneous_break_start.substring(0, 5) : '11:30';
      const e = effectiveWork.simultaneous_break_end ? effectiveWork.simultaneous_break_end.substring(0, 5) : '13:30';
      return `${s} - ${e} WIB`;
    }

    // 1. Tipe Shift atau Berjadwal: Memiliki shift_name atau jam mulai & selesai
    if (effectiveWork?.break_type === 'shift' || (effectiveWork?.break_start_time && effectiveWork?.break_end_time && effectiveWork?.break_type !== 'kantor')) {
      const start = effectiveWork?.break_start_time ? effectiveWork.break_start_time.substring(0, 5) : '--:--';
      const end = effectiveWork?.break_end_time ? effectiveWork.break_end_time.substring(0, 5) : '--:--';
      return `${start} - ${end} WIB`;
    }

    // 2. Tipe Kantor: Jam Mulai (kantor_break_from) s/d Batas Akhir (kantor_break_until) & DURASI (kantor_break_duration)
    if (effectiveWork?.break_type === 'kantor' || effectiveWork?.kantor_break_until || effectiveWork?.kantor_break_from) {
      const from = effectiveWork?.kantor_break_from
        ? effectiveWork.kantor_break_from.substring(0, 5)
        : '12:00';
      const until = effectiveWork?.kantor_break_until
        ? effectiveWork.kantor_break_until.substring(0, 5)
        : '15:00';
      const duration = Number(effectiveWork?.kantor_break_duration) || 60;
      return `${from} - ${until} WIB (Maks. ${duration}m)`;
    }

    if (effectiveWork?.break_end_time) {
      return `Batas s/d ${effectiveWork.break_end_time.substring(0, 5)} WIB`;
    }

    return 'Sesuai Jam Kantor';
  }, [effectiveWork]);

  // Kalkulasi jarak real-time dari posisi GPS ke titik Cabang (jika koordinat cabang valid)
  const distanceInfo = useMemo(() => {
    if (!currentCoords || !isBranchLocationConfigured || effectiveBranchLatitude == null || effectiveBranchLongitude == null) {
      return null;
    }
    const dist = calculateDistanceMeters(
      currentCoords.latitude,
      currentCoords.longitude,
      Number(effectiveBranchLatitude),
      Number(effectiveBranchLongitude)
    );
    const maxRadius = Number(effectiveRadiusMeters) || 100;
    return {
      distance: dist,
      isWithinRadius: dist <= maxRadius,
      maxRadius
    };
  }, [currentCoords, isBranchLocationConfigured, effectiveBranchLatitude, effectiveBranchLongitude, effectiveRadiusMeters]);

  // Validasi mutlak apakah posisi perangkat berada di luar batas radius kantor
  const isOutsideRadius = useMemo(() => {
    return Boolean(distanceInfo && !distanceInfo.isWithinRadius);
  }, [distanceInfo]);

  // Jam Pulang kantor / toko (default '17:00')
  const workEndLabel = useMemo(() => {
    if (effectiveWork?.work_end_time) {
      return normalizeTimeString(effectiveWork.work_end_time, effectiveWork.work_start_time);
    }
    return '17:00';
  }, [effectiveWork]);

  // Validasi apakah waktu sekarang sudah mencapai jam pulang
  const isEndTimeReached = useMemo(() => {
    try {
      const parts = workEndLabel.split(':');
      const endHour = parseInt(parts[0], 10);
      const endMinute = parseInt(parts[1], 10);
      const endTotalMin = (isNaN(endHour) ? 17 : endHour) * 60 + (isNaN(endMinute) ? 0 : endMinute);
      
      const currentHour = time.getHours();
      const currentMinute = time.getMinutes();
      const currentTotalMin = currentHour * 60 + currentMinute;
      
      return currentTotalMin >= endTotalMin;
    } catch {
      return false;
    }
  }, [time, workEndLabel]);

  // Sinkronisasi otomatis notifikasi pengingat istirahat (5 menit sebelum & sesudah)
  useEffect(() => {
    if (effectiveWork) {
      scheduleBreakReminders(effectiveWork, todayRecord).catch(() => {});
    }
  }, [effectiveWork, todayRecord]);

  // Cek apakah waktu saat ini berada dalam rentang 5 menit sebelum / sesudah jam istirahat / masuk
  const breakProximityAlert = useMemo(() => {
    if (!effectiveWork || effectiveWork.is_closed_today || hasEndedBreakToday) {
      return null;
    }
    const nowMs = time.getTime();

    // 1. Skenario Shift / Berjadwal
    if (effectiveWork.break_type === 'shift' || (effectiveWork.break_start_time && effectiveWork.break_end_time && effectiveWork.break_type !== 'kantor')) {
      const shiftName = effectiveWork.break_shift_name ? `(${effectiveWork.break_shift_name})` : '';
      const startParts = effectiveWork.break_start_time?.split(':');
      const endParts = effectiveWork.break_end_time?.split(':');

      if (startParts && startParts.length >= 2 && !hasStartedBreakToday) {
        const dStart = new Date(time);
        dStart.setHours(parseInt(startParts[0], 10), parseInt(startParts[1], 10), 0, 0);
        const diffMinutes = Math.round((dStart.getTime() - nowMs) / 60000);

        if (diffMinutes > 0 && diffMinutes <= 5) {
          return {
            title: `Waktu Istirahat ${diffMinutes} Menit Lagi`,
            message: `Waktu istirahat Anda ${shiftName} dimulai pukul ${effectiveWork.break_start_time?.substring(0, 5) || ''} WIB. Bersiaplah untuk istirahat.`,
            color: '#d97706',
            bgColor: '#fffbeb',
            borderColor: '#fde68a',
            iconBg: '#fef3c7'
          };
        }
        if (diffMinutes <= 0 && diffMinutes >= -5) {
          return {
            title: 'Waktu Istirahat Sedang Berjalan',
            message: `Waktu istirahat telah tiba. Jangan lupa tekan tombol 'Mulai Istirahat' di bawah.`,
            color: '#b45309',
            bgColor: '#fef3c7',
            borderColor: '#fcd34d',
            iconBg: '#fde68a'
          };
        }
      }

      if (endParts && endParts.length >= 2) {
        const dEnd = new Date(time);
        dEnd.setHours(parseInt(endParts[0], 10), parseInt(endParts[1], 10), 0, 0);
        const diffMinutes = Math.round((dEnd.getTime() - nowMs) / 60000);

        if (diffMinutes > 0 && diffMinutes <= 5) {
          return {
            title: `Istirahat Berakhir ${diffMinutes} Menit Lagi`,
            message: `Waktu istirahat selesai pukul ${effectiveWork.break_end_time?.substring(0, 5) || ''} WIB. Bersiaplah untuk masuk kembali.`,
            color: '#4f46e5',
            bgColor: '#eef2ff',
            borderColor: '#c7d2fe',
            iconBg: '#e0e7ff'
          };
        }
        if (diffMinutes <= 0 && diffMinutes >= -5 && !hasEndedBreakToday) {
          return {
            title: 'Waktu Masuk Kembali Telah Tiba',
            message: `Jam istirahat telah berakhir. Segera tekan 'Selesai Istirahat' untuk melanjutkan pekerjaan.`,
            color: '#dc2626',
            bgColor: '#fef2f2',
            borderColor: '#fecaca',
            iconBg: '#fee2e2'
          };
        }
      }
    }

    // 2. Skenario Kantor
    if (effectiveWork.break_type === 'kantor' || effectiveWork.kantor_break_until) {
      const duration = Number(effectiveWork.kantor_break_duration) || 60;

      // Jika karyawan sedang istirahat, pantau durasi maksimal istirahat (kantor_break_duration)
      if (hasStartedBreakToday && !hasEndedBreakToday && todayBreakStart) {
        const deadlineStr = calculateBreakDeadline(todayBreakStart, duration, effectiveWork.kantor_break_until);
        const [deadH, deadM] = (deadlineStr || '15:00').split(':').map(Number);
        if (!isNaN(deadH) && !isNaN(deadM)) {
          const dDead = new Date(time);
          dDead.setHours(deadH, deadM, 0, 0);
          const diffMinutes = Math.round((dDead.getTime() - nowMs) / 60000);

          if (diffMinutes > 0 && diffMinutes <= 5) {
            return {
              title: `Istirahat Berakhir ${diffMinutes} Menit Lagi`,
              message: `Waktu istirahat Anda (maks. ${duration}m) selesai pukul ${deadlineStr} WIB. Bersiaplah untuk masuk kembali.`,
              color: '#d97706',
              bgColor: '#fffbeb',
              borderColor: '#fde68a',
              iconBg: '#fef3c7'
            };
          }
          if (diffMinutes <= 0 && diffMinutes >= -15) {
            return {
              title: `Durasi Istirahat (${duration}m) Telah Berakhir`,
              message: `Batas waktu istirahat telah berakhir (${deadlineStr} WIB). Segera tekan 'Selesai Istirahat' di bawah!`,
              color: '#dc2626',
              bgColor: '#fef2f2',
              borderColor: '#fecaca',
              iconBg: '#fee2e2'
            };
          }
        }
      }

      const untilParts = (effectiveWork.kantor_break_until || '15:00').split(':');
      if (untilParts.length >= 2) {
        const dLimit = new Date(time);
        dLimit.setHours(parseInt(untilParts[0], 10), parseInt(untilParts[1], 10), 0, 0);
        const diffMinutes = Math.round((dLimit.getTime() - nowMs) / 60000);

        if (diffMinutes > 0 && diffMinutes <= 5) {
          return {
            title: `Batas Istirahat Kantor ${diffMinutes} Menit Lagi`,
            message: `Batas waktu istirahat kantor adalah pukul ${untilParts[0]}:${untilParts[1]} WIB. Pastikan Anda telah menyelesaikan rehat.`,
            color: '#d97706',
            bgColor: '#fffbeb',
            borderColor: '#fde68a',
            iconBg: '#fef3c7'
          };
        }
        if (diffMinutes <= 0 && diffMinutes >= -5) {
          return {
            title: 'Batas Istirahat Kantor Telah Lewat',
            message: `Batas waktu istirahat kantor telah berakhir. Pastikan Anda telah berada di tempat kerja.`,
            color: '#dc2626',
            bgColor: '#fef2f2',
            borderColor: '#fecaca',
            iconBg: '#fee2e2'
          };
        }
      }
    }

    return null;
  }, [effectiveWork, time, hasStartedBreakToday, hasEndedBreakToday, todayBreakStart]);

  // Konfigurasi Tombol Pintar Presensi (Smart Action Button)
  const smartAction = useMemo(() => {
    // 0. Hari Ini Libur / Toko Tutup
    if (effectiveWork?.is_closed_today && !hasClockedInToday) {
      return {
        type: 'Check In' as const,
        title: 'Hari Ini Libur / Tutup',
        sub: `Kantor/toko cabang sedang libur (${effectiveWork?.day_name || 'Libur'}). Presensi dinonaktifkan.`,
        icon: 'event-busy' as keyof typeof MaterialIcons.glyphMap,
        btnColor: '#64748b',
        disabled: true,
        canSkipToCheckout: false,
        isCompleted: false
      };
    }

    // 1. Belum Masuk Kerja
    if (!hasClockedInToday) {
      let sub = 'Tekan untuk Mulai Jam Kerja';
      let disabled = false;
      if (!isBranchLocationConfigured) {
        sub = 'Lokasi Kantor Belum Dikonfigurasi';
        disabled = true;
      } else if (isOutsideRadius && distanceInfo) {
        sub = `Luar Radius (${distanceInfo.distance}m dari kantor)`;
        disabled = true;
      } else if (isMockGps) {
        sub = 'Peringatan: Fake GPS Terdeteksi';
        disabled = true;
      } else if (!currentCoords) {
        sub = 'Mencari Titik Koordinat GPS...';
        disabled = true;
      }

      return {
        type: 'Check In' as const,
        title: 'Check In (Masuk Kerja)',
        sub,
        icon: 'login' as keyof typeof MaterialIcons.glyphMap,
        btnColor: '#10b981',
        disabled,
        canSkipToCheckout: false,
        isCompleted: false
      };
    }

    // 2. Sedang Istirahat (Belum Selesai Istirahat)
    if (isCurrentlyOnBreak) {
      const dur = Number(effectiveWork?.kantor_break_duration) || 60;
      const deadStr = calculateBreakDeadline(todayBreakStart, dur, effectiveWork?.kantor_break_until);
      let sub = deadStr
        ? `Mulai ${todayBreakStart} WIB • Batas: ${deadStr} WIB (${dur}m)`
        : `Istirahat sejak ${todayBreakStart} WIB • Tekan jika selesai`;
      let disabled = false;
      if (!isBranchLocationConfigured) {
        sub = 'Lokasi Kantor Belum Dikonfigurasi';
        disabled = true;
      } else if (isOutsideRadius && distanceInfo) {
        sub = `Luar Radius (${distanceInfo.distance}m dari kantor)`;
        disabled = true;
      } else if (isMockGps) {
        sub = 'Peringatan: Fake GPS Terdeteksi';
        disabled = true;
      } else if (!currentCoords) {
        sub = 'Mencari Titik Koordinat GPS...';
        disabled = true;
      }

      return {
        type: 'Selesai Istirahat' as const,
        title: 'Selesai Istirahat',
        sub,
        icon: 'task-alt' as keyof typeof MaterialIcons.glyphMap,
        btnColor: '#4f46e5',
        disabled,
        canSkipToCheckout: false,
        isCompleted: false
      };
    }

    // 3. Sudah Masuk, Belum Mulai Istirahat, dan Belum Check Out
    if (!hasStartedBreakToday && !hasClockedOutToday) {
      const isShift = effectiveWork?.break_type === 'shift' || (
        Boolean(effectiveWork?.break_start_time) && 
        Boolean(effectiveWork?.break_end_time) && 
        effectiveWork?.break_type !== 'kantor'
      );
      const isKantor = effectiveWork?.break_type === 'kantor' || (!isShift && (Boolean(effectiveWork?.kantor_break_until) || Boolean(effectiveWork?.kantor_break_from)));

      let isBreakExpired = false;
      let isBreakUnlocked = true;
      let shiftBreakEndLabel = '';
      let kantorUntilLabel = '15:00';

      if (isShift && effectiveWork?.break_start_time) {
        shiftBreakEndLabel = effectiveWork.break_end_time ? effectiveWork.break_end_time.substring(0, 5) : '';
        const startParts = effectiveWork.break_start_time.split(':');
        const endParts = (effectiveWork.break_end_time || '').split(':');

        if (startParts.length >= 2) {
          const dStart = new Date(time);
          dStart.setHours(parseInt(startParts[0], 10), parseInt(startParts[1], 10), 0, 0);
          // Sebelum jam istirahat shift dimulai -> belum bisa diklik
          if (time.getTime() < dStart.getTime()) {
            isBreakUnlocked = false;
          }
        }

        if (endParts.length >= 2) {
          const dEnd = new Date(time);
          dEnd.setHours(parseInt(endParts[0], 10), parseInt(endParts[1], 10), 0, 0);
          // Selepas rentang shift istirahat berakhir -> tidak bisa istirahat lagi
          if (time.getTime() > dEnd.getTime()) {
            isBreakExpired = true;
          }
        }
      } else if (isKantor) {
        const kantorFromLabel = effectiveWork?.kantor_break_from ? effectiveWork.kantor_break_from.substring(0, 5) : '12:00';
        kantorUntilLabel = effectiveWork?.kantor_break_until ? effectiveWork.kantor_break_until.substring(0, 5) : '15:00';

        const fromParts = kantorFromLabel.split(':');
        if (fromParts.length >= 2) {
          const dFrom = new Date(time);
          dFrom.setHours(parseInt(fromParts[0], 10), parseInt(fromParts[1], 10), 0, 0);
          // Sebelum jam istirahat kantor dimulai -> belum bisa diklik
          if (time.getTime() < dFrom.getTime()) {
            isBreakUnlocked = false;
          }
        }

        const untilParts = kantorUntilLabel.split(':');
        if (untilParts.length >= 2) {
          const dLimit = new Date(time);
          dLimit.setHours(parseInt(untilParts[0], 10), parseInt(untilParts[1], 10), 0, 0);
          // Selepas batas kantor (jam 15:00) -> tidak bisa istirahat lagi
          if (time.getTime() > dLimit.getTime()) {
            isBreakExpired = true;
          }
        }
      }

      // JIKA WAKTU ISTIRAHAT BELUM LEWAT:
      // Tampilkan tombol Mulai Istirahat (Aktif jika dalam rentang, atau Terkunci jika belum jamnya)
      if (!isBreakExpired) {
        let sub = isBreakUnlocked ? `Jadwal Istirahat: ${breakScheduleText}` : 'Belum Waktu Istirahat';
        if (isShift) {
          if (!isBreakUnlocked) {
            sub = 'Belum Waktu Istirahat';
          } else {
            sub = `Rentang Shift Istirahat • s/d ${shiftBreakEndLabel} WIB`;
          }
        } else if (isKantor) {
          if (!isBreakUnlocked) {
            sub = 'Belum Waktu Istirahat';
          } else {
            const dur = Number(effectiveWork?.kantor_break_duration) || 60;
            sub = `Istirahat Kantor • Maks. ${dur}m (Rentang s/d ${kantorUntilLabel} WIB)`;
          }
        }

        let disabled = false;
        if (!isBreakUnlocked) {
          disabled = true; // Button terkunci dan tidak bisa diklik!
        } else if (!isBranchLocationConfigured) {
          sub = 'Lokasi Kantor Belum Dikonfigurasi';
          disabled = true;
        } else if (isOutsideRadius && distanceInfo) {
          sub = `Luar Radius (${distanceInfo.distance}m dari kantor)`;
          disabled = true;
        } else if (isMockGps) {
          sub = 'Peringatan: Fake GPS Terdeteksi';
          disabled = true;
        } else if (!currentCoords) {
          sub = 'Mencari Titik Koordinat GPS...';
          disabled = true;
        }

        return {
          type: 'Mulai Istirahat' as const,
          title: 'Mulai Istirahat',
          sub,
          icon: isBreakUnlocked ? ('free-breakfast' as keyof typeof MaterialIcons.glyphMap) : ('lock-clock' as keyof typeof MaterialIcons.glyphMap),
          btnColor: isBreakUnlocked ? '#d97706' : '#94a3b8',
          disabled,
          canSkipToCheckout: true,
          isCompleted: false
        };
      }

      // JIKA WAKTU ISTIRAHAT SUDAH SELESAI / LEWAT (Selepas jam 15:00 untuk kantor atau lewat shift):
      // Karyawan tidak bisa istirahat lagi -> Otomatis beralih ke tombol Check Out (Pulang Kerja)
    }

    // 4. Sudah Selesai Istirahat (atau langsung), Belum Pulang
    if (!hasClockedOutToday) {
      let sub = !isEndTimeReached ? `Pulang Awal (Jadwal: ${workEndLabel} WIB)` : `Selesai Jam Kerja (${workEndLabel} WIB)`;
      let disabled = false;
      if (!isBranchLocationConfigured) {
        sub = 'Lokasi Kantor Belum Dikonfigurasi';
        disabled = true;
      } else if (isOutsideRadius && distanceInfo) {
        sub = `Luar Radius (${distanceInfo.distance}m dari kantor)`;
        disabled = true;
      } else if (isMockGps) {
        sub = 'Peringatan: Fake GPS Terdeteksi';
        disabled = true;
      } else if (!currentCoords) {
        sub = 'Mencari Titik Koordinat GPS...';
        disabled = true;
      }

      return {
        type: 'Check Out' as const,
        title: 'Check Out (Pulang Kerja)',
        sub,
        icon: 'logout' as keyof typeof MaterialIcons.glyphMap,
        btnColor: '#f43f5e',
        disabled,
        canSkipToCheckout: false,
        isCompleted: false
      };
    }

    // 5. Presensi Lengkap Hari Ini (Sudah Check Out)
    return {
      type: 'Check Out' as const,
      title: 'Presensi Hari Ini Selesai',
      sub: 'Selamat beristirahat dan sampai jumpa besok!',
      icon: 'check-circle' as keyof typeof MaterialIcons.glyphMap,
      btnColor: '#059669',
      disabled: true,
      canSkipToCheckout: false,
      isCompleted: true
    };
  }, [
    hasClockedInToday,
    isCurrentlyOnBreak,
    hasStartedBreakToday,
    hasClockedOutToday,
    isBranchLocationConfigured,
    isOutsideRadius,
    distanceInfo,
    isMockGps,
    currentCoords,
    todayBreakStart,
    breakScheduleText,
    isEndTimeReached,
    workEndLabel,
    effectiveWork,
    time
  ]);

  // Trigger Action Check-in / Break / Check-out
  const handleTriggerAction = (type: 'Check In' | 'Check Out' | 'Mulai Istirahat' | 'Selesai Istirahat') => {
    // 0. Validasi Hari Libur / Toko Tutup
    if (effectiveWork?.is_closed_today && type === 'Check In') {
      showToast({
        title: 'Hari Libur / Toko Tutup',
        message: `Hari ini kantor/toko cabang sedang tutup (${effectiveWork?.day_name || 'Libur'}). Presensi dinonaktifkan.`,
        type: 'warning'
      });
      return;
    }

    // 0. Validasi Pengaturan Lokasi Cabang oleh Admin (Latitude, Longitude & Radius)
    if (!isBranchLocationConfigured) {
      showToast({
        title: 'Presensi Dinonaktifkan',
        message: `Tidak dapat melakukan absensi: ${locationConfigErrorReason} pada kantor cabang "${effectiveBranchName}" belum dikonfigurasi oleh Admin. Hubungi HRD untuk mengatur lokasi cabang.`,
        type: 'error'
      });
      return;
    }

    // 1. Validasi Fake GPS
    if (isMockGps) {
      showToast({
        title: 'Peringatan Keamanan',
        message: 'Presensi dibatalkan: Perangkat terdeteksi menggunakan Fake GPS / Lokasi Palsu!',
        type: 'error'
      });
      return;
    }

    // 2. Validasi Ketersediaan GPS
    if (!currentCoords) {
      showToast({
        title: 'Lokasi Belum Terdeteksi',
        message: 'Sedang mencari titik koordinat GPS. Harap tunggu sebentar...',
        type: 'warning'
      });
      detectLocation();
      return;
    }

    // 3. Validasi Radius Kantor Cabang (Tolak mutlak jika di luar radius)
    if (isOutsideRadius && distanceInfo) {
      showToast({
        title: 'Di Luar Radius Kantor',
        message: `Presensi ditolak! Posisi Anda berada ${distanceInfo.distance} meter dari kantor cabang "${effectiveBranchName}". Batas radius maksimal adalah ${distanceInfo.maxRadius} meter. Harap mendekat ke area kantor untuk absen.`,
        type: 'error'
      });
      return;
    }

    // 4. Validasi Alur Mulai Istirahat
    if (type === 'Mulai Istirahat') {
      if (!hasClockedInToday) {
        showToast({
          title: 'Belum Check In',
          message: 'Anda harus melakukan Check In terlebih dahulu sebelum mulai istirahat.',
          type: 'warning'
        });
        return;
      }
      if (hasStartedBreakToday) {
        showToast({
          title: 'Sudah Istirahat',
          message: `Anda sudah mencatat mulai istirahat hari ini (${todayBreakStart} WIB).`,
          type: 'info'
        });
        return;
      }
      if (hasClockedOutToday) {
        showToast({
          title: 'Sudah Check Out',
          message: 'Jam kerja Anda hari ini telah selesai.',
          type: 'info'
        });
        return;
      }

      const isShift = effectiveWork?.break_type === 'shift' || (
        Boolean(effectiveWork?.break_start_time) && 
        Boolean(effectiveWork?.break_end_time) && 
        effectiveWork?.break_type !== 'kantor'
      );
      const isKantor = effectiveWork?.break_type === 'kantor' || (!isShift && (Boolean(effectiveWork?.kantor_break_until) || Boolean(effectiveWork?.kantor_break_from)));

      // Validasi Jadwal Shift
      if (isShift && effectiveWork?.break_start_time) {
        const startParts = effectiveWork.break_start_time.split(':');
        const endParts = (effectiveWork.break_end_time || '').split(':');
        const startLabel = effectiveWork.break_start_time.substring(0, 5);
        const endLabel = effectiveWork.break_end_time ? effectiveWork.break_end_time.substring(0, 5) : '';

        // 1. Sebelum rentang shift dimulai
        if (startParts.length >= 2) {
          const dStart = new Date();
          dStart.setHours(parseInt(startParts[0], 10), parseInt(startParts[1], 10), 0, 0);
          if (Date.now() < dStart.getTime()) {
            showToast({
              title: 'Belum Jam Istirahat',
              message: `Jadwal istirahat shift Anda adalah pukul ${startLabel} WIB. Anda belum dapat memulai istirahat.`,
              type: 'warning'
            });
            return;
          }
        }

        // 2. Selepas rentang shift
        if (endParts.length >= 2) {
          const dEnd = new Date();
          dEnd.setHours(parseInt(endParts[0], 10), parseInt(endParts[1], 10), 0, 0);
          if (Date.now() > dEnd.getTime()) {
            showToast({
              title: 'Waktu Istirahat Shift Berakhir',
              message: `Rentang waktu istirahat shift Anda (${startLabel} - ${endLabel} WIB) telah berakhir. Anda tidak dapat lagi memulai istirahat.`,
              type: 'warning'
            });
            return;
          }
        }
      }

      // Validasi Kantor (Mulai jam kantor_break_from s/d batas kantor_break_until)
      if (isKantor) {
        const kantorFrom = effectiveWork?.kantor_break_from ? effectiveWork.kantor_break_from.substring(0, 5) : '12:00';
        const kantorUntil = effectiveWork?.kantor_break_until ? effectiveWork.kantor_break_until.substring(0, 5) : '15:00';

        // 1. Sebelum jam mulai istirahat kantor
        const fromParts = kantorFrom.split(':');
        if (fromParts.length >= 2) {
          const dFrom = new Date();
          dFrom.setHours(parseInt(fromParts[0], 10), parseInt(fromParts[1], 10), 0, 0);
          if (Date.now() < dFrom.getTime()) {
            showToast({
              title: 'Belum Jam Istirahat',
              message: `Waktu istirahat kantor baru dimulai pukul ${kantorFrom} WIB. Anda belum dapat memulai istirahat.`,
              type: 'warning'
            });
            return;
          }
        }

        // 2. Selepas batas akhir istirahat kantor
        const untilParts = kantorUntil.split(':');
        if (untilParts.length >= 2) {
          const dLimit = new Date();
          dLimit.setHours(parseInt(untilParts[0], 10), parseInt(untilParts[1], 10), 0, 0);
          if (Date.now() > dLimit.getTime()) {
            showToast({
              title: 'Batas Istirahat Berakhir',
              message: `Batas waktu istirahat kantor telah berakhir (maksimal pukul ${kantorUntil} WIB). Selepas jam tersebut Anda tidak dapat lagi memulai istirahat.`,
              type: 'warning'
            });
            return;
          }
        }
      }
    }

    // 5. Validasi Alur Selesai Istirahat
    if (type === 'Selesai Istirahat') {
      if (!hasClockedInToday) {
        showToast({
          title: 'Belum Check In',
          message: 'Anda belum melakukan Check In hari ini.',
          type: 'warning'
        });
        return;
      }
      if (!hasStartedBreakToday) {
        showToast({
          title: 'Belum Mulai Istirahat',
          message: 'Anda belum mencatat mulai istirahat.',
          type: 'warning'
        });
        return;
      }
      if (hasEndedBreakToday) {
        showToast({
          title: 'Sudah Selesai Istirahat',
          message: `Anda sudah mencatat selesai istirahat hari ini (${todayBreakEnd} WIB).`,
          type: 'info'
        });
        return;
      }
    }

    // 6. Validasi Jam Kerja: Check Out
    if (type === 'Check Out') {
      if (!hasClockedInToday) {
        showToast({
          title: 'Belum Check In',
          message: 'Anda harus melakukan Check In terlebih dahulu sebelum Check Out.',
          type: 'warning'
        });
        return;
      }
      if (isCurrentlyOnBreak) {
        showToast({
          title: 'Selesaikan Istirahat Dahulu',
          message: 'Anda sedang dalam status istirahat. Harap tekan tombol "Selesai Istirahat" terlebih dahulu sebelum Check Out.',
          type: 'warning'
        });
        return;
      }
      if (hasClockedOutToday) {
        showToast({
          title: 'Sudah Check Out',
          message: 'Anda sudah melakukan Check Out hari ini.',
          type: 'info'
        });
        return;
      }
      if (!isEndTimeReached) {
        showConfirm({
          title: 'Konfirmasi Pulang Cepat',
          message: `Saat ini belum mencapai jam pulang kerja (${workEndLabel} WIB).\n\nCheck Out sekarang akan dicatat sebagai Pulang Cepat (Early Leave).\n\nApakah Anda yakin ingin Check Out sekarang?`,
          confirmText: 'Ya, Pulang Cepat',
          cancelText: 'Batal',
          type: 'danger',
          onConfirm: async () => {
            await executeAttendance('Check Out');
          }
        });
        return;
      }
    }

    // 7. Konfirmasi Modal
    const isClosed = effectiveWork?.is_closed_today;
    const closedWarning = isClosed
      ? `\n\n Catatan: Hari ini adalah hari libur / toko tutup (${effectiveWork?.day_name || 'Libur'}).`
      : '';

    let confirmTitle = 'Konfirmasi Presensi';
    let confirmMsg = `Waktu: ${formattedTime}${closedWarning}`;
    let confirmType: 'info' | 'danger' = 'info';

    if (type === 'Check In') {
      confirmTitle = 'Konfirmasi Absensi Masuk';
      confirmMsg = `Apakah Anda ingin mencatat Check In (Masuk) sekarang?\n\nWaktu: ${formattedTime}${closedWarning}`;
    } else if (type === 'Check Out') {
      confirmTitle = 'Konfirmasi Absensi Pulang';
      confirmMsg = `Apakah Anda ingin mencatat Check Out (Pulang) sekarang?\n\nWaktu: ${formattedTime}${closedWarning}`;
      confirmType = 'danger';
    } else if (type === 'Mulai Istirahat') {
      confirmTitle = 'Konfirmasi Mulai Istirahat';
      const dur = Number(effectiveWork?.kantor_break_duration) || 60;
      const isKantor = effectiveWork?.break_type === 'kantor' || (!effectiveWork?.has_simultaneous_break && effectiveWork?.break_type !== 'shift');
      const durNote = isKantor ? `\n\nCatatan: Durasi istirahat maksimal adalah ${dur} menit.` : '';
      confirmMsg = `Apakah Anda ingin mencatat Mulai Istirahat sekarang?\n\nWaktu: ${formattedTime}${durNote}`;
    } else if (type === 'Selesai Istirahat') {
      confirmTitle = 'Konfirmasi Selesai Istirahat';
      confirmMsg = `Apakah Anda ingin menyelesaikan istirahat dan kembali bekerja sekarang?\n\nWaktu: ${formattedTime}`;
    }

    showConfirm({
      title: confirmTitle,
      message: confirmMsg,
      confirmText: `Ya, ${type}`,
      cancelText: 'Batal',
      type: confirmType,
      onConfirm: async () => {
        await executeAttendance(type);
      }
    });
  };

  // Eksekusi Kirim Presensi ke API Langsung
  const executeAttendance = async (type: 'Check In' | 'Check Out' | 'Mulai Istirahat' | 'Selesai Istirahat') => {
    if (!isBranchLocationConfigured) {
      showToast({
        title: 'Lokasi Belum Diatur',
        message: 'Presensi ditolak: Koordinat GPS atau radius kantor cabang belum dikonfigurasi.',
        type: 'error'
      });
      return;
    }

    if (!currentCoords) return;

    if (isMockGps) {
      showToast({
        title: 'Keamanan GPS',
        message: 'Fake GPS terdeteksi! Presensi dibatalkan.',
        type: 'error'
      });
      return;
    }

    // Validasi kedua sebelum kirim ke backend
    if (isOutsideRadius && distanceInfo) {
      showToast({
        title: 'Presensi Ditolak',
        message: `Anda berada di luar radius kantor (${distanceInfo.distance}m / maks ${distanceInfo.maxRadius}m). Presensi tidak dapat diproses.`,
        type: 'error'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');

      let endpoint = '/api/my/presensi/check-in';
      if (type === 'Check Out') {
        endpoint = '/api/my/presensi/check-out';
      } else if (type === 'Mulai Istirahat') {
        endpoint = '/api/my/presensi/break-start';
      } else if (type === 'Selesai Istirahat') {
        endpoint = '/api/my/presensi/break-end';
      }
      
      const payload: any = {
        latitude: currentCoords.latitude,
        longitude: currentCoords.longitude
      };

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const json = await response.json().catch(() => ({}));

      if (response.status === 401) {
        showToast({
          title: 'Sesi Berakhir',
          message: 'Sesi login Anda telah berakhir. Silakan login kembali.',
          type: 'warning'
        });
        await AsyncStorage.multiRemove(['userToken', 'userData', 'fullProfile']);
        router.replace('/login');
        return;
      }

      if (response.ok) {
        showToast({
          title: 'Presensi Berhasil',
          message: json.message || `${type} berhasil dicatat!`,
          type: 'success'
        });
        fetchAttendanceHistory();
      } else {
        showToast({
          title: 'Presensi Gagal',
          message: json.message || 'Gagal mengirim data presensi ke server.',
          type: 'error'
        });
      }
    } catch {
      showToast({
        title: 'Error Koneksi',
        message: 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validasi pintar status pulang cepat (Early Leave) sesuai jadwal resmi
  const isItemEarlyLeave = useCallback((item?: AttendanceItem | null) => {
    if (!item?.clock_out) return false;

    // Jika status dari API sudah menyatakan tepat waktu
    if (item.early_leave_status && item.early_leave_status.toLowerCase().includes('tepat')) {
      return false;
    }

    const clockOutStr = item.clock_out.substring(0, 5);
    const [outH, outM] = clockOutStr.split(':').map(Number);
    if (isNaN(outH) || isNaN(outM)) return Boolean(item.is_early_leave);

    let scheduledEnd = '17:00';
    const schedulesList = (Array.isArray(workTimeData?.schedules) && workTimeData.schedules.length > 0)
      ? workTimeData.schedules
      : (Array.isArray((profileBranch as any)?.schedules) ? (profileBranch as any).schedules : []);

    if (item.date) {
      try {
        const itemDate = new Date(item.date + 'T00:00:00');
        const dayOfWeek = itemDate.getDay();
        const daySched = schedulesList.find((s: any) => Number(s.day_of_week) === dayOfWeek);
        if (daySched?.work_end_time) {
          scheduledEnd = normalizeTimeString(daySched.work_end_time, daySched.work_start_time);
        } else if (workTimeData?.work_end_time) {
          scheduledEnd = normalizeTimeString(workTimeData.work_end_time, workTimeData.work_start_time);
        } else if ((profileBranch as any)?.work_end_time) {
          scheduledEnd = normalizeTimeString((profileBranch as any).work_end_time, (profileBranch as any).work_start_time);
        }
      } catch {
        scheduledEnd = '17:00';
      }
    } else if (workTimeData?.work_end_time) {
      scheduledEnd = normalizeTimeString(workTimeData.work_end_time, workTimeData.work_start_time);
    } else if ((profileBranch as any)?.work_end_time) {
      scheduledEnd = normalizeTimeString((profileBranch as any).work_end_time, (profileBranch as any).work_start_time);
    }

    const [schedH, schedM] = scheduledEnd.split(':').map(Number);
    if (!isNaN(schedH) && !isNaN(schedM)) {
      const outTotalMin = outH * 60 + outM;
      const schedTotalMin = schedH * 60 + schedM;
      // Jika jam checkout sudah mencapai atau melewati jadwal pulang hari tersebut (misal Selasa 17:00 atau Sabtu 17:30),
      // maka diakui Tepat Waktu (bukan Pulang Cepat)
      if (outTotalMin >= schedTotalMin) {
        return false;
      }
      return true;
    }

    return Boolean(item.is_early_leave);
  }, [workTimeData, profileBranch]);

  const isItemLate = useCallback((item?: AttendanceItem | null) => {
    if (!item?.clock_in) return false;
    if (item.late_status && item.late_status.toLowerCase().includes('tepat')) {
      return false;
    }
    return Boolean(item.is_late);
  }, []);

  const getStatusColor = (status: string, item?: AttendanceItem) => {
    const isEarly = isItemEarlyLeave(item);
    const isLate = isItemLate(item);

    if (isLate && isEarly) {
      return { bg: '#fee2e2', text: '#991b1b', label: 'Telat & Cepat' };
    }
    if (isLate) {
      const lateTxt = item?.late_status && !item.late_status.toLowerCase().includes('tepat')
        ? item.late_status
        : (item?.late_minutes ? `Telat ${item.late_minutes}m` : 'Terlambat');
      return { bg: '#fee2e2', text: '#991b1b', label: lateTxt };
    }
    if (isEarly) {
      const earlyTxt = item?.early_leave_minutes ? `Cepat ${item.early_leave_minutes}m` : 'Pulang Cepat';
      return { bg: '#fef3c7', text: '#92400e', label: earlyTxt };
    }
    const s = (status || '').toLowerCase();
    if (s === 'hadir' || s === 'tepat waktu' || (!isEarly && item?.clock_out)) {
      return { bg: '#dcfce7', text: '#166534', label: 'Tepat Waktu' };
    }
    if (s === 'terlambat') {
      return { bg: '#fee2e2', text: '#991b1b', label: 'Terlambat' };
    }
    if (s === 'pulang cepat') {
      return isEarly ? { bg: '#fef3c7', text: '#92400e', label: 'Pulang Cepat' } : { bg: '#dcfce7', text: '#166534', label: 'Tepat Waktu' };
    }
    if (s === 'lembur') {
      return { bg: '#e0e7ff', text: '#3730a3', label: 'Lembur' };
    }
    return { bg: '#f1f5f9', text: '#475569', label: status || 'Hadir' };
  };

  const getBreakLateInfo = useCallback((breakEnd?: string | null, breakStart?: string | null, item?: AttendanceItem | null) => {
    if (!breakEnd) return null;
    if (item?.break_late_status && item.break_late_status.toLowerCase().includes('tepat')) {
      return { isLate: false, lateMinutes: 0, actualDurationMinutes: 0, allowedDurationMinutes: 0 };
    }

    let dayWork: any = effectiveWork;
    if (item?.date) {
      try {
        const itemDate = new Date(item.date + 'T00:00:00');
        dayWork = getEffectiveScheduleForToday(workTimeData || profileBranch, itemDate) || effectiveWork;
      } catch {}
    }

    return calculateBreakLateDetails(breakStart, breakEnd, dayWork);
  }, [effectiveWork, workTimeData, profileBranch]);

  const formatDurationBadge = (minutes?: number | null, prefix = 'Telat') => {
    if (!minutes || minutes <= 0) return prefix === 'Telat' ? 'Terlambat' : prefix;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) {
      return `${prefix} ${h}j ${m}m`;
    }
    if (h > 0) {
      return `${prefix} ${h} jam`;
    }
    return `${prefix} ${m}m`;
  };

  const todayBreakLate = getBreakLateInfo(todayRecord?.break_end, todayRecord?.break_start, todayRecord);

  const formattedTime = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = time.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 50 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        
        {/* HEADER SECTION */}
        <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top + 14, 28) }]}>
          <Text style={styles.headerMainTitle}>Presensi</Text>
          <Text style={styles.dateText}>{formattedDate}</Text>
          <Text style={styles.timeText}>{formattedTime}</Text>

          {/* NOTIFIKASI GLOBAL JIKA LOKASI CABANG BELUM DIATUR OLEH ADMIN */}
          {!isBranchLocationConfigured ? (
            <View style={styles.globalNoticeBanner}>
              <View style={styles.globalNoticeHeader}>
                <MaterialIcons name="warning" size={20} color="#b91c1c" style={{ marginRight: 6 }} />
                <Text style={styles.globalNoticeTitle}>Lokasi Kantor Belum Dikonfigurasi</Text>
              </View>
              <Text style={styles.globalNoticeDesc}>
                {locationConfigErrorReason} pada kantor cabang "{effectiveBranchName}" bernilai null / belum diatur oleh Admin. Anda tidak dapat melakukan absensi hingga data lokasi cabang dilengkapi.
              </Text>
              <View style={styles.globalNoticeFooter}>
                <MaterialIcons name="info-outline" size={13} color="#991b1b" style={{ marginRight: 4 }} />
                <Text style={styles.globalNoticeSub}>
                  Silakan hubungi Administrator / HRD untuk melengkapi koordinat GPS & radius kantor cabang.
                </Text>
              </View>
            </View>
          ) : null}
          
          {/* GABUNGAN CARD: LOKASI GPS & JADWAL KERJA CABANG */}
          <View style={styles.unifiedCard}>
            {/* BARIS ATAS: LOKASI CABANG & STATUS GPS */}
            <View style={styles.cardHeaderRow}>
              <View style={[
                styles.locationIconWrap, 
                (!isBranchLocationConfigured || isMockGps) && { backgroundColor: '#fee2e2' }
              ]}>
                <MaterialIcons 
                  name={!isBranchLocationConfigured ? 'location-off' : isMockGps ? 'warning' : 'my-location'} 
                  size={22} 
                  color={(!isBranchLocationConfigured || isMockGps) ? theme.colors.danger : theme.colors.primary} 
                />
              </View>

              <View style={{ flex: 1, paddingRight: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={styles.locationTitle} numberOfLines={1}>
                    {effectiveBranchName}
                  </Text>
                  {workTimeData?.type ? (
                    <View style={styles.branchTypeBadge}>
                      <Text style={styles.branchTypeBadgeText}>{workTimeData.type.toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
                
                {!isBranchLocationConfigured ? (
                  <Text style={styles.locationSubTextErr}>
                    ⚠️ Titik kantor belum diatur ({locationConfigErrorReason} bernilai null)
                  </Text>
                ) : isMockGps ? (
                  <Text style={styles.locationSubTextErr}>
                    ⚠️ Terdeteksi Fake GPS! Matikan aplikasi lokasi tiruan.
                  </Text>
                ) : locationError ? (
                  <Text style={styles.locationSubTextErr}>{locationError}</Text>
                ) : isDetectingLocation ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.locationSubText}>Memperbarui titik GPS...</Text>
                  </View>
                ) : currentCoords ? (
                  distanceInfo ? (
                    distanceInfo.isWithinRadius ? (
                      <Text style={styles.locationSubTextSuccess}>
                        ✓ Dalam Radius Kantor • Jarak: {distanceInfo.distance}m{gpsAccuracy ? ` (±${gpsAccuracy}m)` : ''}
                      </Text>
                    ) : (
                      <Text style={styles.locationSubTextErr}>
                        ⚠️ Di Luar Radius Kantor • Jarak: {distanceInfo.distance}m (Maks: {distanceInfo.maxRadius}m)
                      </Text>
                    )
                  ) : (
                    <Text style={styles.locationSubTextSuccess}>
                      ✓ GPS Aktif{gpsAccuracy ? ` • Akurasi: ±${gpsAccuracy}m` : ''}
                    </Text>
                  )
                ) : (
                  <Text style={styles.locationSubText}>Menunggu sinyal GPS...</Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[
                  styles.scheduleDayBadge, 
                  effectiveWork?.is_closed_today ? styles.scheduleDayClosed : styles.scheduleDayOpen,
                  { marginRight: 4 }
                ]}>
                  <MaterialIcons 
                    name={effectiveWork?.is_closed_today ? 'event-busy' : 'event-available'} 
                    size={12} 
                    color={effectiveWork?.is_closed_today ? '#b91c1c' : '#15803d'} 
                    style={{ marginRight: 3 }} 
                  />
                  <Text style={[
                    styles.scheduleDayText, 
                    effectiveWork?.is_closed_today ? styles.scheduleTextClosed : styles.scheduleTextOpen
                  ]}>
                    {effectiveWork?.is_closed_today 
                      ? `Libur` 
                      : `Buka`}
                  </Text>
                </View>

                <TouchableOpacity 
                  style={styles.refreshLocBtn} 
                  onPress={detectLocation}
                  disabled={isDetectingLocation}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="refresh" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* GARIS PEMBATAS DALAM KARTU */}
            <View style={styles.unifiedCardDivider} />

            {/* BARIS BAWAH: JADWAL JAM KERJA & RADIUS */}
            <View style={styles.scheduleGrid}>
              <View style={styles.scheduleBox}>
                <Text style={styles.scheduleBoxLabel}>Jam Masuk</Text>
                <Text style={styles.scheduleBoxTime}>
                  {effectiveWork?.is_closed_today 
                    ? '--:--' 
                    : (effectiveWork?.work_start_time ? effectiveWork.work_start_time.substring(0, 5) : '--:--')}
                </Text>
                <Text style={styles.scheduleBoxSub}>
                  {effectiveWork?.is_closed_today 
                    ? 'Hari Libur' 
                    : (effectiveWork?.dispensation_time 
                        ? `Batas: ${effectiveWork.dispensation_time.substring(0, 5)}` 
                        : 'Tepat Waktu')}
                </Text>
              </View>

              <View style={styles.scheduleDivider} />

              <View style={styles.scheduleBox}>
                <Text style={styles.scheduleBoxLabel}>Jam Pulang</Text>
                <Text style={styles.scheduleBoxTime}>
                  {effectiveWork?.is_closed_today ? '--:--' : workEndLabel}
                </Text>
                <Text style={styles.scheduleBoxSub}>
                  {effectiveWork?.is_closed_today ? 'Toko Tutup' : 'WIB'}
                </Text>
              </View>

              <View style={styles.scheduleDivider} />

              <View style={styles.scheduleBox}>
                <Text style={styles.scheduleBoxLabel}>Radius</Text>
                <Text style={[styles.scheduleBoxTime, (!effectiveRadiusMeters || effectiveRadiusMeters <= 0) && { color: '#dc2626' }]}>
                  {effectiveRadiusMeters && effectiveRadiusMeters > 0 ? `${effectiveRadiusMeters} M` : 'Null'}
                </Text>
                <Text style={[styles.scheduleBoxSub, (!effectiveRadiusMeters || effectiveRadiusMeters <= 0) && { color: '#dc2626' }]}>
                  {effectiveRadiusMeters && effectiveRadiusMeters > 0 ? 'Area Kantor' : 'Belum Diatur'}
                </Text>
              </View>
            </View>


            {/* KARTU JADWAL & STATUS ISTIRAHAT */}
            <View style={styles.breakScheduleCard}>
              {/* BARIS ATAS: JUDUL HARI JUMAT / ISTIRAHAT SEJAJAR DENGAN KETERANGAN STATUS (BELUM / REHAT / SELESAI) */}
              <View style={styles.breakCardTopRow}>
                <View style={styles.breakCardTitleWrap}>
                  <View style={styles.breakScheduleIconWrap}>
                    <MaterialIcons name="free-breakfast" size={16} color="#d97706" />
                  </View>
                  <Text style={styles.breakScheduleTitle}>
                    {effectiveWork?.has_simultaneous_break
                      ? 'Istirahat Hari Jumat'
                      : effectiveWork?.break_type === 'shift'
                        ? (effectiveWork?.break_shift_name ? `Istirahat ${effectiveWork.break_shift_name}` : 'Istirahat Shift')
                        : effectiveWork?.break_type === 'kantor'
                          ? 'Istirahat Kantor'
                          : 'Jadwal Istirahat'}
                  </Text>
                </View>

                {/* Status Absensi Istirahat Karyawan (Sejajar di baris atas) */}
                <View style={[
                  styles.breakStatusBadge,
                  todayRecord?.break_end
                    ? (todayBreakLate?.isLate ? { backgroundColor: '#fee2e2' } : { backgroundColor: '#dcfce7' })
                    : todayRecord?.break_start
                      ? { backgroundColor: '#fef3c7' }
                      : { backgroundColor: '#f1f5f9' }
                ]}>
                  <View style={[
                    styles.breakStatusDot,
                    todayRecord?.break_end
                      ? (todayBreakLate?.isLate ? { backgroundColor: '#dc2626' } : { backgroundColor: '#16a34a' })
                      : todayRecord?.break_start
                        ? { backgroundColor: '#d97706' }
                        : { backgroundColor: '#94a3b8' }
                  ]} />
                  <Text style={[
                    styles.breakStatusBadgeText,
                    todayRecord?.break_end
                      ? (todayBreakLate?.isLate ? { color: '#991b1b' } : { color: '#166534' })
                      : todayRecord?.break_start
                        ? { color: '#92400e' }
                        : { color: '#64748b' }
                  ]}>
                    {todayRecord?.break_end
                      ? (todayBreakLate?.isLate ? `Telat ${todayBreakLate.lateMinutes}m` : 'Selesai')
                      : todayRecord?.break_start
                        ? 'Rehat'
                        : 'Belum'}
                  </Text>
                </View>
              </View>

              {/* BARIS BAWAH: WAKTU JADWAL & STATUS ABSEN HARI INI */}
              <View style={styles.breakCardBottomRow}>
                <View style={styles.breakTimeCol}>
                  <Text style={styles.breakTimeLabel}>Jadwal Istirahat</Text>
                  <Text style={styles.breakScheduleTimeText}>{breakScheduleText}</Text>
                </View>

                <View style={styles.breakTimeDivider} />

                <View style={[styles.breakTimeCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.breakTimeLabel}>Presensi Hari Ini</Text>
                  <Text style={[
                    styles.breakRecordedTimeText,
                    !todayRecord?.break_start && { color: theme.colors.textMuted, fontStyle: 'italic', fontWeight: '500' }
                  ]}>
                    {todayRecord?.break_start 
                      ? `${todayRecord.break_start.substring(0, 5)}${todayRecord.break_end ? ` - ${todayRecord.break_end.substring(0, 5)}` : ' (Rehat)'} WIB`
                      : 'Belum Presensi'}
                  </Text>
                </View>
              </View>
            </View>

            {/* TOMBOL LIHAT JADWAL 7 HARI CABANG */}
            {Array.isArray(workTimeData?.schedules) && workTimeData.schedules.length > 0 && (
              <TouchableOpacity 
                style={styles.viewWeeklyScheduleBtn}
                onPress={() => setShowWeeklyScheduleModal(true)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="calendar-month" size={15} color={theme.colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.viewWeeklyScheduleBtnText}>Lihat Jadwal Kerja Lengkap (7 Hari)</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>


        {/* BANNER NOTIFIKASI JIKA SEDANG WAKTU ISTIRAHAT */}
        {isCurrentlyOnBreak && (
          <View style={styles.activeBreakBanner}>
            <View style={styles.activeBreakIconWrap}>
              <MaterialIcons name="free-breakfast" size={24} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeBreakTitle}>Sedang Waktu Istirahat</Text>
              <Text style={styles.activeBreakDesc}>
                {effectiveWork?.break_type === 'shift'
                  ? `Mulai istirahat pukul ${todayBreakStart} WIB (Jadwal: ${breakScheduleText}). Tekan 'Selesai Istirahat' jika Anda telah kembali ke area kantor.`
                  : effectiveWork?.break_type === 'kantor'
                    ? `Mulai istirahat pukul ${todayBreakStart} WIB (Maks. ${Number(effectiveWork?.kantor_break_duration) || 60} menit • Batas kembali: pukul ${calculateBreakDeadline(todayBreakStart, Number(effectiveWork?.kantor_break_duration) || 60, effectiveWork?.kantor_break_until)} WIB). Tekan 'Selesai Istirahat' jika Anda telah kembali bekerja.`
                    : `Mulai istirahat pukul ${todayBreakStart} WIB. Tekan 'Selesai Istirahat' jika Anda telah kembali ke area kantor dan siap bekerja.`}
              </Text>
            </View>
          </View>
        )}

        {/* BANNER PENGINGAT 5 MENIT SEBELUM / SESUDAH ISTIRAHAT */}
        {breakProximityAlert && (
          <View style={[styles.proximityAlertBanner, { backgroundColor: breakProximityAlert.bgColor, borderColor: breakProximityAlert.borderColor }]}>
            <View style={[styles.proximityAlertIconWrap, { backgroundColor: breakProximityAlert.iconBg }]}>
              <MaterialIcons name="notifications-active" size={22} color={breakProximityAlert.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.proximityAlertTitle, { color: breakProximityAlert.color }]}>
                {breakProximityAlert.title}
              </Text>
              <Text style={styles.proximityAlertDesc}>
                {breakProximityAlert.message}
              </Text>
            </View>
          </View>
        )}

        {/* TOMBOL PINTAR PRESENSI (SMART ATTENDANCE ACTION BUTTON) */}
        <View style={styles.smartButtonContainer}>
          <TouchableOpacity 
            style={[
              styles.smartBtn, 
              { backgroundColor: smartAction.btnColor },
              (smartAction.disabled && !smartAction.isCompleted) && styles.smartBtnDisabled,
              smartAction.isCompleted && styles.smartBtnCompleted
            ]}
            onPress={() => {
              if (!smartAction.isCompleted) {
                handleTriggerAction(smartAction.type);
              }
            }}
            disabled={smartAction.disabled || smartAction.isCompleted || isSubmitting}
            activeOpacity={smartAction.isCompleted ? 1 : 0.85}
          >
            <View style={styles.smartBtnContent}>
              <View style={[
                styles.smartBtnIconWrap,
                smartAction.isCompleted && { backgroundColor: 'rgba(255,255,255,0.25)' }
              ]}>
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name={smartAction.icon} size={28} color="#fff" />
                )}
              </View>

              <View style={{ flex: 1, paddingRight: 6 }}>
                <Text style={styles.smartBtnTitle}>{smartAction.title}</Text>
                <Text style={styles.smartBtnSub} numberOfLines={2}>{smartAction.sub}</Text>
              </View>

              {!smartAction.isCompleted && !smartAction.disabled && (
                <View style={styles.smartBtnArrowWrap}>
                  <MaterialIcons name="arrow-forward" size={20} color="#fff" />
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* OPSI CHECK OUT LANGSUNG JIKA BELUM ISTIRAHAT */}
          {smartAction.canSkipToCheckout && (
            <TouchableOpacity 
              style={styles.skipCheckoutBtn}
              onPress={() => handleTriggerAction('Check Out')}
              activeOpacity={0.7}
              disabled={isOutsideRadius || !isBranchLocationConfigured || isMockGps || !currentCoords || isSubmitting}
            >
              <MaterialIcons name="logout" size={16} color="#64748b" style={{ marginRight: 6 }} />
              <Text style={styles.skipCheckoutText}>
                Atau langsung <Text style={{ fontWeight: 'bold', color: '#f43f5e' }}>Check Out (Pulang)</Text>
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* BANNER PERINGATAN JIKA BERADA DI LUAR RADIUS */}
        {isOutsideRadius && distanceInfo ? (
          <View style={styles.outsideRadiusBanner}>
            <MaterialIcons name="wrong-location" size={20} color="#b91c1c" style={{ marginRight: 8, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.outsideRadiusTitle}>Presensi Terkunci: Di Luar Radius Kantor</Text>
              <Text style={styles.outsideRadiusDesc}>
                Jarak Anda saat ini {distanceInfo.distance} meter dari kantor cabang "{effectiveBranchName}". Batas radius maksimal adalah {distanceInfo.maxRadius} meter. Tombol presensi dinonaktifkan hingga Anda berada di dalam area radius kantor.
              </Text>
            </View>
          </View>
        ) : null}

        {/* RIWAYAT ABSENSI */}
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Riwayat Absensi</Text>
            
            {/* Filter Bulan Pop-up Trigger */}
            <TouchableOpacity 
              style={styles.filterBadge}
              onPress={() => {
                setTempMonth(filterMonth);
                setTempYear(filterYear);
                setShowFilterModal(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.filterText}>
                {MONTH_NAMES_INDONESIA[filterMonth - 1]} {filterYear}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={18} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {/* LIST RIWAYAT */}
          <View style={styles.listContainer}>
            {isLoadingHistory ? (
              <View style={{ padding: 36, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} size="large" />
                <Text style={{ marginTop: 8, color: theme.colors.textMuted }}>Memuat riwayat presensi...</Text>
              </View>
            ) : history.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <MaterialIcons name="event-note" size={44} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>Belum ada data presensi pada bulan ini</Text>
              </View>
            ) : (
              history.map((item, index) => {
                const statusInfo = getStatusColor(item.status, item);
                const breakLateInfo = getBreakLateInfo(item.break_end, item.break_start, item);
                const parts = (item.date || '').split('-');
                const day = parts[2] || '--';
                const monthIdx = parseInt(parts[1] || '1', 10) - 1;
                const fullMonthName = MONTH_NAMES_INDONESIA[monthIdx] || '';
                const year = parts[0] || '';
                const isToday = item.date === todayStr;
                const hasOvertime = Boolean(item.overtime_hours && parseFloat(item.overtime_hours) > 0);
                const hasNotes = Boolean(item.notes);
                const showExtraRow = hasOvertime || hasNotes;

                let dayName = '';
                if (item.date) {
                  const [y, m, d] = item.date.split('-').map(Number);
                  const dObj = new Date(y, m - 1, d);
                  dayName = dObj.toLocaleDateString('id-ID', { weekday: 'long' });
                }

                const fullDateTitle = dayName && item.date
                  ? `${dayName}, ${parseInt(day, 10)} ${fullMonthName} ${year}`
                  : (item.date || '--');

                const radiusBorderColor = item.is_within_radius === true
                  ? '#10b981'
                  : item.is_within_radius === false
                    ? '#ef4444'
                    : (isToday ? theme.colors.primary : 'transparent');

                return (
                  <View 
                    key={item.id || index} 
                    style={[
                      styles.listItem, 
                      isToday && styles.listItemToday,
                      { borderLeftWidth: 4, borderLeftColor: radiusBorderColor },
                      index === history.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    {/* Header: Tanggal Lengkap (Tanpa Badge) & Badge Sudut Hari Ini */}
                    <View style={styles.historyCardHeader}>
                      <View style={styles.historyHeaderLeft}>
                        <MaterialIcons name="event" size={15} color={theme.colors.primary} style={{ marginRight: 6 }} />
                        <Text style={styles.historyDateDayName} numberOfLines={1}>
                          {fullDateTitle}
                        </Text>
                      </View>

                      {isToday ? (
                        <View style={[styles.statusBadge, { backgroundColor: '#e0e7ff', borderColor: '#c7d2fe', borderWidth: 1 }]}>
                          <Text style={[styles.statusText, { color: theme.colors.primary }]}>Hari Ini</Text>
                        </View>
                      ) : statusInfo.label !== 'Tepat Waktu' ? (
                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                          <Text style={[styles.statusText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Grid 4 Kolom Sejajar: Masuk | Mulai Ist. | Selesai Ist. | Pulang */}
                    <View style={styles.historyGridRow}>
                      {/* Kolom 1: Masuk */}
                      <View style={[
                        styles.timeGridCol,
                        item.clock_in && item.is_late && { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1 }
                      ]}>
                        <View style={styles.timeGridColHeader}>
                          <View style={[styles.gridDot, { backgroundColor: theme.colors.success }]} />
                          <Text style={styles.gridLabel} numberOfLines={1}>Masuk</Text>
                        </View>
                        <Text style={[
                          styles.gridTime,
                          item.clock_in && item.is_late && { color: '#dc2626' }
                        ]}>
                          {item.clock_in ? item.clock_in.substring(0, 5) : '--:--'}
                        </Text>
                        <Text style={[
                          styles.gridSubText,
                          item.clock_in
                            ? (item.is_late ? { color: '#dc2626' } : { color: '#16a34a' })
                            : { color: theme.colors.textMuted }
                        ]} numberOfLines={1}>
                          {item.clock_in
                            ? (item.is_late ? formatDurationBadge(item.late_minutes, 'Telat') : 'Tepat Waktu')
                            : '--'}
                        </Text>
                      </View>

                      {/* Kolom 2: Mulai Istirahat */}
                      <View style={styles.timeGridCol}>
                        <View style={styles.timeGridColHeader}>
                          <View style={[styles.gridDot, { backgroundColor: '#f59e0b' }]} />
                          <Text style={styles.gridLabel} numberOfLines={1}>Mulai Ist.</Text>
                        </View>
                        <Text style={styles.gridTime}>
                          {item.break_start ? item.break_start.substring(0, 5) : '--:--'}
                        </Text>
                        <Text style={[
                          styles.gridSubText,
                          item.break_start ? { color: '#16a34a' } : { color: theme.colors.textMuted }
                        ]} numberOfLines={1}>
                          {item.break_start ? 'Tepat Waktu' : '--'}
                        </Text>
                      </View>

                      {/* Kolom 3: Selesai Istirahat */}
                      <View style={[
                        styles.timeGridCol,
                        item.break_end && breakLateInfo?.isLate
                          ? { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1 }
                          : item.break_start && !item.break_end
                            ? { backgroundColor: '#fffbeb', borderColor: '#fef3c7', borderWidth: 1 }
                            : null
                      ]}>
                        <View style={styles.timeGridColHeader}>
                          <View style={[styles.gridDot, { backgroundColor: '#0ea5e9' }]} />
                          <Text style={styles.gridLabel} numberOfLines={1}>Selesai Ist.</Text>
                        </View>
                        <Text style={[
                          styles.gridTime,
                          item.break_end && breakLateInfo?.isLate && { color: '#dc2626' }
                        ]}>
                          {item.break_end ? item.break_end.substring(0, 5) : '--:--'}
                        </Text>
                        <Text style={[
                          styles.gridSubText,
                          item.break_end
                            ? (breakLateInfo?.isLate ? { color: '#dc2626' } : { color: '#16a34a' })
                            : item.break_start
                              ? { color: '#b45309' }
                              : { color: theme.colors.textMuted }
                        ]} numberOfLines={1}>
                          {item.break_end
                            ? (breakLateInfo?.isLate ? formatDurationBadge(breakLateInfo.lateMinutes, 'Telat') : 'Tepat Waktu')
                            : item.break_start
                              ? 'Rehat'
                              : '--'}
                        </Text>
                      </View>

                      {/* Kolom 4: Pulang */}
                      {(() => {
                        const isEarly = isItemEarlyLeave(item);
                        return (
                          <View style={[
                            styles.timeGridCol,
                            item.clock_out && isEarly && { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1 }
                          ]}>
                            <View style={styles.timeGridColHeader}>
                              <View style={[styles.gridDot, { backgroundColor: theme.colors.danger }]} />
                              <Text style={styles.gridLabel} numberOfLines={1}>Pulang</Text>
                            </View>
                            <Text style={[
                              styles.gridTime,
                              item.clock_out && isEarly && { color: '#b45309' }
                            ]}>
                              {item.clock_out ? item.clock_out.substring(0, 5) : '--:--'}
                            </Text>
                            <Text style={[
                              styles.gridSubText,
                              item.clock_out
                                ? (isEarly ? { color: '#b45309' } : { color: '#16a34a' })
                                : { color: theme.colors.textMuted }
                            ]} numberOfLines={1}>
                              {item.clock_out
                                ? (isEarly ? formatDurationBadge(item.early_leave_minutes, 'Cepat') : 'Tepat Waktu')
                                : '--'}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>

                    {/* Chips Info Tambahan (Lembur, Catatan) */}
                    {showExtraRow && (
                      <View style={styles.historyChipsRow}>
                        {hasOvertime ? (
                          <View style={styles.chipOvertime}>
                            <MaterialIcons name="more-time" size={11} color="#3730a3" style={{ marginRight: 3 }} />
                            <Text style={styles.chipOvertimeText}>Lembur {parseFloat(item.overtime_hours!).toFixed(1)} Jam</Text>
                          </View>
                        ) : null}

                        {hasNotes ? (
                          <View style={styles.chipNotes}>
                            <MaterialIcons name="notes" size={11} color={theme.colors.textMuted} style={{ marginRight: 3 }} />
                            <Text style={styles.chipNotesText} numberOfLines={1}>{item.notes}</Text>
                          </View>
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </View>

      </ScrollView>

      {/* FILTER BULAN & TAHUN MODAL */}
      <Modal visible={showFilterModal} animationType="fade" transparent={true}>
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowFilterModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pilih Periode Presensi</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.filterSectionTitle}>Pilih Bulan</Text>
            <View style={styles.monthChipGrid}>
              {MONTH_NAMES_INDONESIA.map((name, idx) => {
                const monthNum = idx + 1;
                const isSelected = tempMonth === monthNum;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.monthChip, isSelected && styles.monthChipActive]}
                    onPress={() => setTempMonth(monthNum)}
                  >
                    <Text style={[styles.monthChipText, isSelected && styles.monthChipTextActive]}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.filterModalFooter}>
              <TouchableOpacity 
                style={styles.btnApplyFilter}
                onPress={() => {
                  setFilterMonth(tempMonth);
                  setFilterYear(tempYear);
                  setShowFilterModal(false);
                }}
              >
                <Text style={styles.btnApplyFilterText}>Terapkan</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* MODAL JADWAL LENGKAP 7 HARI */}
      <Modal visible={showWeeklyScheduleModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>Jadwal Jam Kerja Cabang</Text>
                <Text style={styles.modalSubtitle}>{effectiveBranchName} • Jadwal Operasional Mingguan</Text>
              </View>
              <TouchableOpacity onPress={() => setShowWeeklyScheduleModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
              {orderedSchedules.map((item) => {
                const isToday = item.day_of_week === currentDayOfWeek;
                const isClosed = Boolean(item.is_closed) || Boolean(item.is_rest) || (Array.isArray(workTimeData?.rest_days) && workTimeData.rest_days.includes(item.day_of_week));
                const startTime = item.work_start_time ? item.work_start_time.substring(0, 5) : '--:--';
                const endTime = item.work_end_time ? normalizeTimeString(item.work_end_time, item.work_start_time) : '--:--';
                const hasBreak = item.simultaneous_break_start && item.simultaneous_break_end;
                
                return (
                  <View 
                    key={item.day_of_week}
                    style={[
                      styles.weeklyScheduleRow,
                      isToday && styles.weeklyScheduleRowToday,
                      isClosed && styles.weeklyScheduleRowClosed
                    ]}
                  >
                    <View style={styles.weeklyScheduleDayCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.weeklyScheduleDayName, isToday && { color: theme.colors.primary, fontWeight: '700' }]}>
                          {DAY_NAMES[item.day_of_week]}
                        </Text>
                        {isToday && (
                          <View style={styles.todaySmallBadge}>
                            <Text style={styles.todaySmallBadgeText}>Hari Ini</Text>
                          </View>
                        )}
                      </View>
                      <View style={[
                        styles.weeklyStatusBadge,
                        isClosed ? { backgroundColor: '#fee2e2' } : { backgroundColor: '#dcfce7' }
                      ]}>
                        <Text style={[
                          styles.weeklyStatusBadgeText,
                          isClosed ? { color: '#991b1b' } : { color: '#166534' }
                        ]}>
                          {isClosed ? 'Libur' : 'Buka'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.weeklyScheduleDetailCol}>
                      {isClosed ? (
                        <Text style={styles.weeklyScheduleClosedText}>Libur / Tutup</Text>
                      ) : (
                        <>
                          <Text style={styles.weeklyScheduleTimeText}>
                            {startTime} - {endTime} WIB
                          </Text>
                          <Text style={styles.weeklyScheduleSubDetail}>
                            Batas Dispensasi: {item.dispensation_time ? item.dispensation_time.substring(0, 5) : 'Tepat Waktu'}
                          </Text>
                          {hasBreak ? (
                            <Text style={styles.weeklyScheduleBreakDetail}>
                              Istirahat: {item.simultaneous_break_start?.substring(0, 5)} - {item.simultaneous_break_end?.substring(0, 5)} WIB {item.day_of_week === 5 ? '(Sholat Jumat)' : ''}
                            </Text>
                          ) : (item.kantor_break_until || item.kantor_break_from) ? (
                            <Text style={styles.weeklyScheduleBreakDetail}>
                              Istirahat: {item.kantor_break_from ? item.kantor_break_from.substring(0, 5) : '12:00'} - {item.kantor_break_until ? item.kantor_break_until.substring(0, 5) : '15:00'} WIB (Maks. {item.kantor_break_duration ?? 60}m)
                            </Text>
                          ) : null}
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.filterModalFooter}>
              <TouchableOpacity 
                style={styles.btnApplyFilter}
                onPress={() => setShowWeeklyScheduleModal(false)}
              >
                <Text style={styles.btnApplyFilterText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  
  headerContainer: {
    backgroundColor: theme.colors.primary,
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: theme.spacing.l,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center'
  },
  headerMainTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  dateText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  timeText: { color: '#fff', fontSize: 48, fontWeight: 'bold', letterSpacing: -1.5, marginBottom: 16 },
  
  globalNoticeBanner: {
    backgroundColor: '#fff1f2',
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    borderRadius: theme.radius.m,
    padding: theme.spacing.m,
    width: '100%',
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#dc2626',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  globalNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5
  },
  globalNoticeTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#991b1b',
    flex: 1
  },
  globalNoticeDesc: {
    fontSize: 12,
    color: '#7f1d1d',
    lineHeight: 18,
    marginBottom: 8
  },
  globalNoticeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffe4e6',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6
  },
  globalNoticeSub: {
    fontSize: 11,
    color: '#991b1b',
    flex: 1
  },

  unifiedCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.l,
    padding: theme.spacing.m,
    width: '100%',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  unifiedCardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12
  },
  locationIconWrap: { 
    width: 42, 
    height: 42, 
    borderRadius: 21, 
    backgroundColor: '#eff6ff', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 10 
  },
  locationTitle: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text, marginBottom: 2 },
  branchTypeBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6
  },
  branchTypeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.primary
  },
  locationSubText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
  locationSubTextSuccess: { fontSize: 12, color: '#10b981', fontWeight: '600' },
  locationSubTextErr: { fontSize: 12, color: '#f43f5e', fontWeight: 'bold' },
  refreshLocBtn: { padding: 4 },

  scheduleDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  scheduleDayOpen: {
    backgroundColor: '#dcfce7'
  },
  scheduleDayClosed: {
    backgroundColor: '#fee2e2'
  },
  scheduleDayText: {
    fontSize: 11,
    fontWeight: 'bold'
  },
  scheduleTextOpen: {
    color: '#15803d'
  },
  scheduleTextClosed: {
    color: '#b91c1c'
  },
  scheduleGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  scheduleBox: {
    flex: 1,
    alignItems: 'center'
  },
  scheduleBoxLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginBottom: 2
  },
  scheduleBoxTime: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  scheduleBoxSub: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginTop: 2
  },
  scheduleDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#f1f5f9'
  },

  breakScheduleCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  breakCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#fef3c7',
  },
  breakCardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  breakScheduleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  breakScheduleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  breakStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    gap: 4,
  },
  breakStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  breakStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  breakCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 9,
  },
  breakTimeCol: {
    flex: 1,
  },
  breakTimeLabel: {
    fontSize: 10.5,
    color: '#b45309',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  breakScheduleTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#78350f',
  },
  breakTimeDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#fde68a',
    marginHorizontal: 10,
  },
  breakRecordedTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#78350f',
  },

  activeBreakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: theme.spacing.l,
    marginTop: 14,
    elevation: 2,
    shadowColor: '#d97706',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }
  },
  activeBreakIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  activeBreakTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 2
  },
  activeBreakDesc: {
    fontSize: 12,
    color: '#b45309',
    lineHeight: 17
  },

  proximityAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: theme.spacing.l,
    marginTop: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }
  },
  proximityAlertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  proximityAlertTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2
  },
  proximityAlertDesc: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16
  },

  smartButtonContainer: {
    paddingHorizontal: theme.spacing.l,
    marginTop: 18
  },
  smartBtn: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  smartBtnCompleted: {
    backgroundColor: '#059669',
    elevation: 1,
    shadowOpacity: 0.06
  },
  smartBtnDisabled: {
    backgroundColor: '#94a3b8',
    elevation: 0,
    shadowOpacity: 0
  },
  smartBtnContent: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  smartBtnIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  smartBtnTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: -0.2
  },
  smartBtnSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 3,
    fontWeight: '500',
    lineHeight: 16
  },
  smartBtnArrowWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  skipCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f1f5f9'
  },
  skipCheckoutText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500'
  },

  historySection: {
    paddingHorizontal: theme.spacing.l,
    marginTop: 26
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  historyTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.text },
  filterBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0e7ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  filterText: { fontSize: 12, fontWeight: 'bold', color: theme.colors.primary, marginRight: 4 },

  listContainer: { backgroundColor: theme.colors.card, borderRadius: theme.radius.m, elevation: 1, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  listItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: theme.colors.card
  },
  listItemToday: {
    backgroundColor: '#f8faff'
  },
  emptyText: { color: theme.colors.textMuted, marginTop: 8, fontSize: 13 },

  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  historyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8
  },
  historyDateBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8
  },
  historyDateBadgeToday: {
    backgroundColor: '#e0e7ff'
  },
  historyDateBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#334155'
  },
  historyDateBadgeTextToday: {
    color: theme.colors.primary
  },
  historyDateDayName: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text
  },
  todayTag: {
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    marginLeft: 6
  },
  todayTagText: {
    color: '#fff',
    fontSize: 8.5,
    fontWeight: 'bold'
  },

  historyGridRow: {
    flexDirection: 'row',
    gap: 6
  },
  timeGridCol: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timeGridColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3
  },
  gridDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 3.5
  },
  gridLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: theme.colors.textMuted
  },
  gridTime: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  gridSubText: {
    fontSize: 8.5,
    fontWeight: 'bold',
    marginTop: 1.5
  },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: 'bold' },

  historyChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc'
  },
  chipLate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  chipLateText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#b91c1c'
  },
  chipEarly: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  chipEarlyText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#b45309'
  },
  chipOvertime: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  chipOvertimeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#3730a3'
  },
  chipNotes: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '100%'
  },
  chipNotesText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontStyle: 'italic'
  },
  chipRadiusOk: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5
  },
  chipRadiusOkText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#15803d'
  },
  chipRadiusErr: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5
  },
  chipRadiusErrText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#b91c1c'
  },
  chipDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  outsideRadiusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: theme.radius.m,
    padding: theme.spacing.m,
    marginHorizontal: theme.spacing.l,
    marginTop: 12
  },
  outsideRadiusTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#991b1b',
    marginBottom: 3
  },
  outsideRadiusDesc: {
    fontSize: 12,
    color: '#b91c1c',
    lineHeight: 18
  },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: theme.spacing.l },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.text },
  modalPromptText: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 6 },
  inputLabel: { fontSize: 13, fontWeight: 'bold', color: theme.colors.text, marginBottom: 6 },
  notesInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.s,
    padding: theme.spacing.m,
    height: 70,
    textAlignVertical: 'top',
    fontSize: 14,
    marginBottom: 16
  },
  btnSubmitModal: { paddingVertical: 14, borderRadius: theme.radius.m, alignItems: 'center' },
  btnSubmitModalText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  // Month Chip filter styles
  filterSectionTitle: { fontSize: 13, fontWeight: 'bold', color: theme.colors.text, marginBottom: 10 },
  monthChipGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  monthChip: { width: '31%', paddingVertical: 10, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 12, margin: '1%', borderWidth: 1, borderColor: 'transparent' },
  monthChipActive: { backgroundColor: '#e0e7ff', borderColor: theme.colors.primary },
  monthChipText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
  monthChipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  filterModalFooter: { marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  btnApplyFilter: { backgroundColor: theme.colors.primary, paddingVertical: 12, borderRadius: theme.radius.m, alignItems: 'center' },
  btnApplyFilterText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  viewWeeklyScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10
  },
  viewWeeklyScheduleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary
  },
  modalSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2
  },
  weeklyScheduleRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8
  },
  weeklyScheduleRowToday: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac'
  },
  weeklyScheduleRowClosed: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca'
  },
  weeklyScheduleDayCol: {
    width: 100,
    justifyContent: 'center'
  },
  weeklyScheduleDayName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  todaySmallBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4
  },
  todaySmallBadgeText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold'
  },
  weeklyStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4
  },
  weeklyStatusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold'
  },
  weeklyScheduleDetailCol: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 8
  },
  weeklyScheduleClosedText: {
    fontSize: 13,
    color: '#991b1b',
    fontWeight: '600'
  },
  weeklyScheduleTimeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  weeklyScheduleSubDetail: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2
  },
  weeklyScheduleBreakDetail: {
    fontSize: 11,
    color: '#d97706',
    fontWeight: '500',
    marginTop: 2
  }
});