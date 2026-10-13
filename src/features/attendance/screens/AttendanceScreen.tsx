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

const MONTH_NAMES_INDONESIA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

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
  notes?: string | null;
  overtime_hours?: string | null;
  is_late?: boolean | null;
  late_minutes?: number | null;
  is_early_leave?: boolean | null;
  early_leave_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
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
  closed_days?: number[];
  today?: string;
  day_name?: string;
  is_closed_today?: boolean;
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
      } catch (_) {}
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
    const y = time.getFullYear();
    const m = (time.getMonth() + 1).toString().padStart(2, '0');
    const d = time.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [time]);

  const todayRecord = useMemo(() => {
    return history.find(item => item.date === todayStr);
  }, [history, todayStr]);

  const hasClockedInToday = Boolean(todayRecord?.clock_in);
  const hasClockedOutToday = Boolean(todayRecord?.clock_out);

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
    if (workTimeData?.work_end_time) {
      return workTimeData.work_end_time.substring(0, 5);
    }
    return '17:00';
  }, [workTimeData]);

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

  // Sub-label tombol Check Out
  const checkOutSubLabel = useMemo(() => {
    if (hasClockedOutToday) {
      return `Sudah (${todayRecord?.clock_out?.substring(0, 5)})`;
    }
    if (!hasClockedInToday) {
      return 'Perlu Check In';
    }
    if (!isEndTimeReached) {
      return `Pulang Awal (Jam ${workEndLabel})`;
    }
    return 'Selesai Kerja';
  }, [hasClockedOutToday, todayRecord, hasClockedInToday, isEndTimeReached, workEndLabel]);

  // Trigger Action Check-in / Check-out Langsung
  const handleTriggerAction = (type: 'Check In' | 'Check Out') => {
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

    // 4. Validasi Jam Kerja: Check Out
    if (type === 'Check Out') {
      if (!hasClockedInToday) {
        showToast({
          title: 'Belum Check In',
          message: 'Anda harus melakukan Check In terlebih dahulu sebelum Check Out.',
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

    // 5. Konfirmasi Langsung Sekali Klik
    const isCheckIn = type === 'Check In';
    const isClosed = workTimeData?.is_closed_today;
    const closedWarning = isClosed
      ? `\n\n⚠️ Catatan: Hari ini adalah hari libur / toko tutup (${workTimeData?.day_name || 'Libur'}).`
      : '';

    showConfirm({
      title: isCheckIn ? 'Konfirmasi Absensi Masuk' : 'Konfirmasi Absensi Pulang',
      message: `Apakah Anda ingin mencatat ${isCheckIn ? 'Check In (Masuk)' : 'Check Out (Pulang)'} sekarang?\n\nWaktu: ${formattedTime}${closedWarning}`,
      confirmText: isCheckIn ? 'Ya, Check In' : 'Ya, Check Out',
      cancelText: 'Batal',
      type: isCheckIn ? 'info' : 'danger',
      onConfirm: async () => {
        await executeAttendance(type);
      }
    });
  };

  // Eksekusi Kirim Presensi ke API Langsung
  const executeAttendance = async (type: 'Check In' | 'Check Out') => {
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

      const isCheckIn = type === 'Check In';
      const endpoint = isCheckIn ? '/api/my/presensi/check-in' : '/api/my/presensi/check-out';
      
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
    } catch (err) {
      showToast({
        title: 'Error Koneksi',
        message: 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string, item?: AttendanceItem) => {
    if (item?.is_late && item?.is_early_leave) {
      return { bg: '#fee2e2', text: '#991b1b', label: 'Telat & Cepat' };
    }
    if (item?.is_late) {
      const lateTxt = item.late_minutes ? `Telat ${item.late_minutes}m` : 'Terlambat';
      return { bg: '#fee2e2', text: '#991b1b', label: lateTxt };
    }
    if (item?.is_early_leave) {
      const earlyTxt = item.early_leave_minutes ? `Cepat ${item.early_leave_minutes}m` : 'Pulang Cepat';
      return { bg: '#fef3c7', text: '#92400e', label: earlyTxt };
    }
    const s = (status || '').toLowerCase();
    if (s === 'hadir' || s === 'tepat waktu') {
      return { bg: '#dcfce7', text: '#166534', label: 'Tepat Waktu' };
    }
    if (s === 'terlambat') {
      return { bg: '#fee2e2', text: '#991b1b', label: 'Terlambat' };
    }
    if (s === 'pulang cepat') {
      return { bg: '#fef3c7', text: '#92400e', label: 'Pulang Cepat' };
    }
    if (s === 'lembur') {
      return { bg: '#e0e7ff', text: '#3730a3', label: 'Lembur' };
    }
    return { bg: '#f1f5f9', text: '#475569', label: status || 'Hadir' };
  };

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
        <View style={styles.headerContainer}>
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
                  workTimeData?.is_closed_today ? styles.scheduleDayClosed : styles.scheduleDayOpen,
                  { marginRight: 4 }
                ]}>
                  <MaterialIcons 
                    name={workTimeData?.is_closed_today ? 'event-busy' : 'event-available'} 
                    size={12} 
                    color={workTimeData?.is_closed_today ? '#b91c1c' : '#15803d'} 
                    style={{ marginRight: 3 }} 
                  />
                  <Text style={[
                    styles.scheduleDayText, 
                    workTimeData?.is_closed_today ? styles.scheduleTextClosed : styles.scheduleTextOpen
                  ]}>
                    {workTimeData?.is_closed_today 
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

            {/* BARIS BAWAH: JADWAL JAM KERJA */}
            <View style={styles.scheduleGrid}>
              <View style={styles.scheduleBox}>
                <Text style={styles.scheduleBoxLabel}>Jam Masuk</Text>
                <Text style={styles.scheduleBoxTime}>
                  {workTimeData?.work_start_time ? workTimeData.work_start_time.substring(0, 5) : '08:00'}
                </Text>
                <Text style={styles.scheduleBoxSub}>
                  {workTimeData?.dispensation_time 
                    ? `Batas: ${workTimeData.dispensation_time.substring(0, 5)}` 
                    : 'Tepat Waktu'}
                </Text>
              </View>

              <View style={styles.scheduleDivider} />

              <View style={styles.scheduleBox}>
                <Text style={styles.scheduleBoxLabel}>Jam Pulang</Text>
                <Text style={styles.scheduleBoxTime}>
                  {workTimeData?.work_end_time ? workTimeData.work_end_time.substring(0, 5) : '17:00'}
                </Text>
                <Text style={styles.scheduleBoxSub}>WIB</Text>
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
          </View>
        </View>

        {/* ACTION BUTTONS (CHECK IN / CHECK OUT) */}
        <View style={styles.actionRow}>
          {/* TOMBOL CHECK IN */}
          <TouchableOpacity 
            style={[
              styles.actionBtn, 
              styles.btnIn, 
              (!isBranchLocationConfigured || isOutsideRadius || hasClockedInToday || isMockGps || !currentCoords) && styles.btnDisabled
            ]}
            onPress={() => handleTriggerAction('Check In')}
            disabled={!isBranchLocationConfigured || isOutsideRadius || hasClockedInToday || isMockGps || !currentCoords || isSubmitting}
            activeOpacity={0.8}
          >
            <View style={[styles.btnIconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <MaterialIcons name="login" size={28} color="#fff" />
            </View>
            <Text style={styles.btnTitle}>Check In</Text>
            <Text style={styles.btnSub}>
              {!isBranchLocationConfigured
                ? 'Lokasi Belum Diatur'
                : isOutsideRadius
                  ? `Luar Radius (${distanceInfo?.distance}m)`
                  : hasClockedInToday 
                    ? (todayRecord?.is_late 
                        ? `Sudah (${todayRecord?.clock_in?.substring(0, 5)}) • Telat ${todayRecord.late_minutes ? `${todayRecord.late_minutes}m` : ''}` 
                        : `Sudah (${todayRecord?.clock_in?.substring(0, 5)}) • Tepat`)
                    : 'Mulai Kerja'}
            </Text>
          </TouchableOpacity>

          {/* TOMBOL CHECK OUT */}
          <TouchableOpacity 
            style={[
              styles.actionBtn, 
              styles.btnOut, 
              (!isBranchLocationConfigured || isOutsideRadius || !hasClockedInToday || hasClockedOutToday || isMockGps || !currentCoords) && styles.btnDisabled
            ]}
            onPress={() => handleTriggerAction('Check Out')}
            disabled={!isBranchLocationConfigured || isOutsideRadius || !hasClockedInToday || hasClockedOutToday || isMockGps || !currentCoords || isSubmitting}
            activeOpacity={0.8}
          >
            <View style={[styles.btnIconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <MaterialIcons name="logout" size={28} color="#fff" />
            </View>
            <Text style={styles.btnTitle}>Check Out</Text>
            <Text style={styles.btnSub}>
              {!isBranchLocationConfigured
                ? 'Lokasi Belum Diatur'
                : isOutsideRadius
                  ? `Luar Radius (${distanceInfo?.distance}m)`
                  : hasClockedOutToday 
                    ? (todayRecord?.is_early_leave
                        ? `Sudah (${todayRecord?.clock_out?.substring(0, 5)}) • Cepat ${todayRecord.early_leave_minutes ? `${todayRecord.early_leave_minutes}m` : ''}`
                        : `Sudah (${todayRecord?.clock_out?.substring(0, 5)})`)
                    : checkOutSubLabel}
            </Text>
          </TouchableOpacity>
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
                const parts = (item.date || '').split('-');
                const day = parts[2] || '--';
                const monthIdx = parseInt(parts[1] || '1', 10) - 1;
                const monthStr = MONTH_NAMES_INDONESIA[monthIdx] ? MONTH_NAMES_INDONESIA[monthIdx].substring(0, 3) : '---';
                const isToday = item.date === todayStr;
                const hasOvertime = Boolean(item.overtime_hours && parseFloat(item.overtime_hours) > 0);
                const hasNotes = Boolean(item.notes);
                const hasRadius = item.is_within_radius !== null && item.is_within_radius !== undefined;
                const showExtraRow = hasRadius || hasOvertime || hasNotes;

                return (
                  <View 
                    key={item.id || index} 
                    style={[
                      styles.listItem, 
                      isToday && styles.listItemToday,
                      index === history.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    <View style={[styles.dateBadge, isToday && styles.dateBadgeToday]}>
                      <Text style={[styles.dateBadgeDay, isToday && styles.dateBadgeDayToday]}>{day}</Text>
                      <Text style={[styles.dateBadgeMonth, isToday && styles.dateBadgeMonthToday]}>{monthStr}</Text>
                      {isToday && (
                        <View style={styles.todayBadgeTag}>
                          <Text style={styles.todayBadgeTagText}>HARI INI</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.historyContent}>
                      {/* Baris Jam Masuk */}
                      <View style={styles.timeRow}>
                        <View style={styles.timeRowLeft}>
                          <View style={styles.timeLabelWrap}>
                            <View style={[styles.dot, { backgroundColor: theme.colors.success }]} />
                            <Text style={styles.timeLabel}>Masuk</Text>
                          </View>
                          <Text style={styles.timeValue}>{item.clock_in ? item.clock_in.substring(0, 5) : '--:--'}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                          <Text style={[styles.statusText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
                        </View>
                      </View>

                      {/* Divider Line */}
                      <View style={styles.timeDivider} />

                      {/* Baris Jam Keluar */}
                      <View style={styles.timeRow}>
                        <View style={styles.timeRowLeft}>
                          <View style={styles.timeLabelWrap}>
                            <View style={[styles.dot, { backgroundColor: theme.colors.danger }]} />
                            <Text style={styles.timeLabel}>Keluar</Text>
                          </View>
                          <Text style={styles.timeValue}>{item.clock_out ? item.clock_out.substring(0, 5) : '--:--'}</Text>
                        </View>
                      </View>

                      {/* Chips Info Tambahan (Radius, Lembur, Catatan) */}
                      {showExtraRow && (
                        <View style={styles.historyChipsRow}>
                          {item.is_within_radius === true ? (
                            <View style={styles.chipRadiusOk}>
                              <MaterialIcons name="check-circle" size={11} color="#15803d" style={{ marginRight: 3 }} />
                              <Text style={styles.chipRadiusOkText}>Radius Kantor</Text>
                            </View>
                          ) : item.is_within_radius === false ? (
                            <View style={styles.chipRadiusErr}>
                              <MaterialIcons name="wrong-location" size={11} color="#b91c1c" style={{ marginRight: 3 }} />
                              <Text style={styles.chipRadiusErrText}>Di Luar Radius</Text>
                            </View>
                          ) : null}

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

  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.l,
    marginTop: 18,
    justifyContent: 'space-between'
  },
  actionBtn: {
    flex: 1,
    padding: theme.spacing.l,
    borderRadius: theme.radius.l,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    marginHorizontal: theme.spacing.xs,
    justifyContent: 'center'
  },
  btnIn: { backgroundColor: '#10b981' },
  btnOut: { backgroundColor: '#f43f5e' },
  btnDisabled: { backgroundColor: '#cbd5e1', elevation: 0, shadowOpacity: 0 },
  
  btnIconWrap: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  btnTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  btnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 3 },

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
  listItem: { flexDirection: 'row', alignItems: 'flex-start', padding: theme.spacing.m, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: theme.colors.card },
  listItemToday: { backgroundColor: '#f8faff', borderLeftWidth: 3.5, borderLeftColor: theme.colors.primary },
  emptyText: { color: theme.colors.textMuted, marginTop: 8, fontSize: 13 },

  dateBadge: { backgroundColor: '#f1f5f9', padding: 8, borderRadius: 8, alignItems: 'center', minWidth: 48, marginRight: theme.spacing.m },
  dateBadgeToday: { backgroundColor: '#e0e7ff' },
  dateBadgeDay: { fontSize: 17, fontWeight: 'bold', color: theme.colors.primary },
  dateBadgeDayToday: { color: theme.colors.primary },
  dateBadgeMonth: { fontSize: 10, color: theme.colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' },
  dateBadgeMonthToday: { color: theme.colors.primary },
  todayBadgeTag: { backgroundColor: theme.colors.primary, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, marginTop: 3, alignItems: 'center' },
  todayBadgeTagText: { color: '#fff', fontSize: 7, fontWeight: 'bold' },

  historyContent: { flex: 1, justifyContent: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  timeLabelWrap: { flexDirection: 'row', alignItems: 'center', width: 62 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  timeLabel: { fontSize: 12, color: theme.colors.textMuted },
  
  timeValue: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  notesText: { fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic', maxWidth: 120 },
  
  timeDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 6, marginLeft: 16 },

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
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  chipRadiusOkText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#15803d'
  },
  chipRadiusErr: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  chipRadiusErrText: {
    fontSize: 11,
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
  btnApplyFilterText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});