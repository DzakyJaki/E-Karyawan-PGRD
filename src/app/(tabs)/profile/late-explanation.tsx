import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
  Linking
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { theme } from '../../../core/theme';
import { useToast } from '../../../core/ToastContext';
import { suspendAppLock, resumeAppLock } from '../../../components/AppLock';

interface AttendanceRecord {
  id: number;
  employee_id?: number;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_start?: string | null;
  break_end?: string | null;
  status?: string;
  is_late?: boolean | null;
  late_minutes?: number | null;
  late_status?: string | null;
  break_late_status?: string | null;
  is_early_leave?: boolean | null;
  early_leave_minutes?: number | null;
  early_leave_status?: string | null;
  notes?: string | null;
}

export type LateType = 'masuk' | 'istirahat' | 'pulang_cepat';

export interface LateExplanationItem {
  id?: number;
  attendance_id: number;
  attendance_date?: string;
  clock_in?: string | null;
  clock_out?: string | null;
  late_type: LateType;
  alasan: string;
  bukti_file?: string | null;
  status?: 'pending' | 'approved' | 'rejected' | 'menunggu' | 'disetujui' | 'ditolak' | string;
  catatan?: string | null;
  admin_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const STORAGE_KEY_HISTORY = '@late_explanations_history_v1';

export default function LateExplanationScreen() {
  const searchParams = useLocalSearchParams<{ attendance_id?: string; tab?: string }>();
  const { showToast } = useToast();

  // Active Tab: 'form' | 'riwayat'
  const [activeTab, setActiveTab] = useState<'form' | 'riwayat'>(
    searchParams.tab === 'riwayat' ? 'riwayat' : 'form'
  );

  // Loading States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Attendance Records
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<number | null>(
    searchParams.attendance_id ? parseInt(searchParams.attendance_id, 10) : null
  );

  // Riwayat Pengajuan State
  const [historyList, setHistoryList] = useState<LateExplanationItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form Fields
  const [lateType, setLateType] = useState<LateType>('masuk');
  const [alasan, setAlasan] = useState('');
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentMime, setAttachmentMime] = useState<string | null>(null);
  const [attachmentSize, setAttachmentSize] = useState<number | null>(null);

  // Form Errors
  const [formErrors, setFormErrors] = useState<{ alasan?: string; attendance?: string }>({});

  // Helper: Format date string YYYY-MM-DD to Indonesian
  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return '--';
    const parts = dateStr.split(' ')[0].split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m, d);
      const dayName = DAY_NAMES_ID[dateObj.getDay()] || '';
      const monthName = MONTH_NAMES_ID[m] || parts[1];
      return `${dayName}, ${d} ${monthName} ${y}`;
    }
    return dateStr;
  };

  // Helper: Difference in days between today and attendance date
  // 0 = Hari ini, 1 = Kemarin, 2 = 2 hari lalu, 3 = 3 hari lalu
  const getDaysDiff = useCallback((dateStr: string): number => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        target.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - target.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
    } catch {}
    return 999;
  }, []);

  // Helper: Memeriksa apakah suatu presensi memiliki keterlambatan / ketidaksesuaian jam (masuk, istirahat, atau pulang cepat)
  const checkIsAttendanceLate = useCallback((item: AttendanceRecord) => {
    const isLateMasuk = Boolean(
      item.is_late === true ||
      (typeof item.late_minutes === 'number' && item.late_minutes > 0) ||
      (item.late_status &&
        !item.late_status.toLowerCase().includes('tepat') &&
        (item.late_status.toLowerCase().includes('telat') ||
         item.late_status.toLowerCase().includes('lambat') ||
         item.late_status.toLowerCase().includes('menit'))) ||
      (item.status &&
        (item.status.toLowerCase().includes('terlambat') || item.status.toLowerCase().includes('telat')))
    );

    const isLateBreak = Boolean(
      item.break_late_status &&
      !item.break_late_status.toLowerCase().includes('tepat') &&
      (item.break_late_status.toLowerCase().includes('telat') ||
       item.break_late_status.toLowerCase().includes('lambat') ||
       item.break_late_status.toLowerCase().includes('menit'))
    );

    const isEarlyLeave = Boolean(
      item.is_early_leave === true ||
      (typeof item.early_leave_minutes === 'number' && item.early_leave_minutes > 0) ||
      (item.early_leave_status &&
        !item.early_leave_status.toLowerCase().includes('tepat') &&
        (item.early_leave_status.toLowerCase().includes('cepat') ||
         item.early_leave_status.toLowerCase().includes('pulang') ||
         item.early_leave_status.toLowerCase().includes('menit'))) ||
      (item.status && item.status.toLowerCase().includes('cepat'))
    );

    return {
      isLate: isLateMasuk || isLateBreak || isEarlyLeave,
      isLateMasuk,
      isLateBreak,
      isEarlyLeave
    };
  }, []);

  // Deteksi otomatis jenis keterlambatan dari record presensi
  const detectLateType = useCallback((item: AttendanceRecord): { primaryType: LateType; detectedTypes: LateType[] } => {
    const { isLateMasuk, isLateBreak, isEarlyLeave } = checkIsAttendanceLate(item);
    const detectedTypes: LateType[] = [];

    if (isLateMasuk) detectedTypes.push('masuk');
    if (isEarlyLeave) detectedTypes.push('pulang_cepat');
    if (isLateBreak) detectedTypes.push('istirahat');

    // Tentukan jenis utama
    let primaryType: LateType = 'masuk';
    if (isLateMasuk) {
      primaryType = 'masuk';
    } else if (isEarlyLeave) {
      primaryType = 'pulang_cepat';
    } else if (isLateBreak) {
      primaryType = 'istirahat';
    }

    return {
      primaryType,
      detectedTypes: detectedTypes.length > 0 ? detectedTypes : ['masuk']
    };
  }, [checkIsAttendanceLate]);

  // Menampilkan seluruh presensi yang tercatat terlambat / pulang cepat
  const lateAttendances = useMemo(() => {
    return attendances
      .filter(item => {
        const diff = getDaysDiff(item.date);
        // Jangan tampilkan tanggal masa depan
        if (diff < 0) return false;

        // HANYA yang memiliki keterlambatan (masuk, istirahat, atau pulang cepat)
        const { isLate } = checkIsAttendanceLate(item);
        return isLate;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendances, getDaysDiff, checkIsAttendanceLate]);

  // Helper: Format file size
  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Helper: Load local cached explanation history
  const loadLocalHistory = async (): Promise<LateExplanationItem[]> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };

  // Helper: Save item to local cached explanation history
  const saveToLocalHistory = async (newItem: LateExplanationItem) => {
    try {
      const existing = await loadLocalHistory();
      const filtered = existing.filter(item => item.attendance_id !== newItem.attendance_id);
      const updated = [newItem, ...filtered];
      await AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
      setHistoryList(updated);
    } catch {}
  };

  // Fetch Attendance History from Server (Current Month + Previous Month if date <= 3)
  const fetchAttendances = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      };

      // 1. Fetch bulan sekarang
      const urlsToFetch = [`${apiUrl}/api/my/presensi?month=${currentMonth}&year=${currentYear}`];

      // 2. Jika awal bulan (tanggal 1, 2, atau 3), fetch juga bulan sebelumnya untuk mencakup rentang 3 hari
      if (now.getDate() <= 3) {
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
        urlsToFetch.push(`${apiUrl}/api/my/presensi?month=${prevMonth}&year=${prevYear}`);
      }

      const results = await Promise.allSettled(
        urlsToFetch.map(url => fetch(url, { headers }).then(r => r.json()))
      );

      const mergedList: AttendanceRecord[] = [];
      const seenIds = new Set<number>();

      results.forEach(res => {
        if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.data)) {
          res.value.data.forEach((item: AttendanceRecord) => {
            if (item && item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              mergedList.push(item);
            }
          });
        }
      });

      setAttendances(mergedList);

      // Otomatis pilih item jika belum ada yang terpilih
      if (!selectedAttendanceId && mergedList.length > 0) {
        const lateList = mergedList.filter(item => {
          const diff = getDaysDiff(item.date);
          return diff >= 0 && checkIsAttendanceLate(item).isLate;
        });

        // Utamakan yang masih dalam batas 3 hari agar langsung dapat diajukan
        const validWithin3Days = lateList.find(item => getDaysDiff(item.date) <= 3);

        if (validWithin3Days) {
          setSelectedAttendanceId(validWithin3Days.id);
        } else if (lateList.length > 0) {
          setSelectedAttendanceId(lateList[0].id);
        }
      }
    } catch (err) {
      console.log('Error fetching attendances for late explanation:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getDaysDiff, selectedAttendanceId, checkIsAttendanceLate]);

  // Fetch Full History of Late Explanations
  const fetchAllExplanationsHistory = useCallback(async (currentAttendances: AttendanceRecord[]) => {
    setLoadingHistory(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      };

      // 1. Ambil data lokal terlebih dahulu
      const localItems = await loadLocalHistory();

      // 2. Coba fetch list dari backend jika tersedia (mis. GET /api/my/presensi/late-explanation)
      let backendList: LateExplanationItem[] = [];
      try {
        let res = await fetch(`${apiUrl}/api/my/presensi/late-explanation`, { headers });
        if (res.status === 404) {
          res = await fetch(`${apiUrl}/api/presensi/late-explanation`, { headers });
        }
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.data)) {
            backendList = json.data;
          } else if (Array.isArray(json)) {
            backendList = json;
          }
        }
      } catch {}

      // 3. Untuk setiap item lokal yang berstatus pending/menunggu, refresh status dari GET /presensi/{attendanceId}/late-explanation
      const itemsToCheck = backendList.length > 0 ? backendList : localItems;
      const refreshedItems: LateExplanationItem[] = await Promise.all(
        itemsToCheck.map(async item => {
          try {
            let res = await fetch(`${apiUrl}/api/my/presensi/${item.attendance_id}/late-explanation`, { headers });
            if (res.status === 404) {
              res = await fetch(`${apiUrl}/api/presensi/${item.attendance_id}/late-explanation`, { headers });
            }
            if (res.ok) {
              const json = await res.json();
              const d = json.data || json;
              if (d && (d.attendance_id || d.id)) {
                return {
                  ...item,
                  ...d,
                  attendance_id: item.attendance_id
                };
              }
            }
          } catch {}
          return item;
        })
      );

      // 4. Perkaya dengan informasi tanggal & jam dari attendances list
      const enrichedList = refreshedItems.map(item => {
        const att = currentAttendances.find(a => a.id === item.attendance_id);
        return {
          ...item,
          attendance_date: item.attendance_date || att?.date,
          clock_in: item.clock_in || att?.clock_in,
          clock_out: item.clock_out || att?.clock_out
        };
      });

      // Urutkan riwayat dari yang terbaru
      enrichedList.sort((a, b) => {
        const dateA = a.created_at || a.attendance_date || '';
        const dateB = b.created_at || b.attendance_date || '';
        return dateB.localeCompare(dateA);
      });

      setHistoryList(enrichedList);
      await AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(enrichedList));
    } catch (err) {
      console.log('Error fetching explanation history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    const init = async () => {
      const local = await loadLocalHistory();
      setHistoryList(local);
      await fetchAttendances();
    };
    init();
  }, [fetchAttendances]);

  // When attendances loaded or tab changed to 'riwayat', refresh history
  useEffect(() => {
    if (activeTab === 'riwayat' && attendances.length > 0) {
      fetchAllExplanationsHistory(attendances);
    }
  }, [activeTab, attendances, fetchAllExplanationsHistory]);

  // Pastikan selectedAttendanceId selalu memilih presensi terlambat yang ada dalam daftar
  useEffect(() => {
    if (lateAttendances.length > 0) {
      const isValid = lateAttendances.some(a => a.id === selectedAttendanceId);
      if (!isValid) {
        const validItem = lateAttendances.find(a => getDaysDiff(a.date) <= 3) || lateAttendances[0];
        setSelectedAttendanceId(validItem.id);
      }
    } else {
      setSelectedAttendanceId(null);
    }
  }, [lateAttendances, selectedAttendanceId, getDaysDiff]);

  // Otomatis tentukan jenis keterlambatan (masuk / istirahat / pulang_cepat) dari presensi yang dipilih
  useEffect(() => {
    if (selectedAttendanceId) {
      setFormErrors({});
      const target = lateAttendances.find(a => a.id === selectedAttendanceId) || attendances.find(a => a.id === selectedAttendanceId);
      if (target) {
        const { primaryType } = detectLateType(target);
        setLateType(primaryType);
      }
    }
  }, [selectedAttendanceId, lateAttendances, attendances, detectLateType]);

  // Data presensi yang saat ini dipilih
  const selectedAttendance = useMemo(() => {
    if (!selectedAttendanceId) return null;
    return lateAttendances.find(a => a.id === selectedAttendanceId) || attendances.find(a => a.id === selectedAttendanceId) || null;
  }, [selectedAttendanceId, lateAttendances, attendances]);

  // Apakah presensi terpilih melebihi batas 3 hari
  const isSelectedExpired = useMemo(() => {
    if (!selectedAttendance) return false;
    return getDaysDiff(selectedAttendance.date) > 3;
  }, [selectedAttendance, getDaysDiff]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAttendances();
    if (activeTab === 'riwayat') {
      await fetchAllExplanationsHistory(attendances);
    }
    setRefreshing(false);
  };

  // Helper untuk membuka berkas lampiran
  const openAttachmentFile = async (rawUrl?: string | null) => {
    if (!rawUrl) return;
    try {
      let fullUrl = rawUrl;
      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
        const cleanBase = apiUrl.replace(/\/+$/, '');
        const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
        const hasStorage = cleanPath.startsWith('/storage/');
        fullUrl = `${cleanBase}${hasStorage ? cleanPath : `/storage${cleanPath}`}`;
      }

      const isPdf = fullUrl.toLowerCase().includes('.pdf');
      if (isPdf) {
        await WebBrowser.openBrowserAsync(fullUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          toolbarColor: theme.colors.primary,
          showTitle: true
        });
      } else {
        const canOpen = await Linking.canOpenURL(fullUrl);
        if (canOpen) {
          await Linking.openURL(fullUrl);
        } else {
          await WebBrowser.openBrowserAsync(fullUrl);
        }
      }
    } catch {
      showToast({ title: 'Gagal Membuka Berkas', message: 'Tautan berkas tidak valid atau tidak dapat diakses.', type: 'error' });
    }
  };

  // Attachments handlers
  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({
          title: 'Izin Galeri',
          message: 'Izin akses galeri dibutuhkan untuk memilih foto bukti.',
          type: 'warning'
        });
        return;
      }

      suspendAppLock();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 4096 * 1024) {
          showToast({
            title: 'Berkas Terlalu Besar',
            message: `Ukuran foto melebihi batas maksimal 4 MB (${formatBytes(asset.fileSize)}).`,
            type: 'error'
          });
          return;
        }
        setAttachmentUri(asset.uri);
        setAttachmentName(asset.fileName || 'bukti_foto.jpg');
        setAttachmentMime(asset.mimeType || 'image/jpeg');
        setAttachmentSize(asset.fileSize || null);
      }
    } catch {
      showToast({ title: 'Error', message: 'Gagal memilih gambar dari galeri.', type: 'error' });
    } finally {
      resumeAppLock(3000);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showToast({
          title: 'Izin Kamera',
          message: 'Izin akses kamera dibutuhkan untuk memotret bukti.',
          type: 'warning'
        });
        return;
      }

      suspendAppLock();
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 4096 * 1024) {
          showToast({
            title: 'Berkas Terlalu Besar',
            message: `Ukuran foto melebihi batas maksimal 4 MB (${formatBytes(asset.fileSize)}).`,
            type: 'error'
          });
          return;
        }
        setAttachmentUri(asset.uri);
        setAttachmentName('bukti_kamera.jpg');
        setAttachmentMime('image/jpeg');
        setAttachmentSize(asset.fileSize || null);
      }
    } catch {
      showToast({ title: 'Error', message: 'Gagal membuka kamera.', type: 'error' });
    } finally {
      resumeAppLock(3000);
    }
  };

  const removeAttachment = () => {
    setAttachmentUri(null);
    setAttachmentName(null);
    setAttachmentMime(null);
    setAttachmentSize(null);
  };

  // Upload Form Data via XMLHttpRequest (Proper Boundary & Network Handling)
  const uploadLateExplanationMultipart = (
    url: string,
    formData: FormData,
    token: string | null
  ): Promise<{ ok: boolean; status: number; data: any }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 60000;
      xhr.open('POST', url);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.setRequestHeader('Accept', 'application/json');

      xhr.onload = () => {
        let parsedData: any = {};
        try {
          parsedData = JSON.parse(xhr.responseText);
        } catch {
          parsedData = { message: xhr.responseText || 'Gagal memproses respons server' };
        }
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          data: parsedData
        });
      };

      xhr.onerror = () => {
        reject(new Error('Koneksi internet bermasalah atau server tidak dapat dihubungi.'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Waktu pengiriman habis (timeout), periksa jaringan Anda.'));
      };

      xhr.send(formData);
    });
  };

  // Submit Handler
  const handleSubmit = async () => {
    const errors: { alasan?: string; attendance?: string } = {};

    if (!selectedAttendanceId) {
      errors.attendance = 'Silakan pilih tanggal presensi terlebih dahulu';
    }

    if (!alasan.trim()) {
      errors.alasan = 'Alasan keterlambatan wajib diisi';
    } else if (alasan.trim().length < 5) {
      errors.alasan = 'Alasan keterlambatan minimal 5 karakter';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      showToast({
        title: 'Form Belum Lengkap',
        message: 'Harap periksa kolom yang ditandai merah.',
        type: 'warning'
      });
      return;
    }

    setFormErrors({});
    setSubmitting(true);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');

      const formData = new FormData();
      formData.append('attendance_id', String(selectedAttendanceId));
      formData.append('late_type', lateType);
      formData.append('alasan', alasan.trim());

      // Kirim lampiran foto jika ada
      if (attachmentUri) {
        const safeName = attachmentName || 'bukti_foto.jpg';
        const mimeType = attachmentMime || 'image/jpeg';

        const normalizedUri =
          Platform.OS === 'android' && !attachmentUri.startsWith('file://') && !attachmentUri.startsWith('content://')
            ? `file://${attachmentUri}`
            : attachmentUri;

        formData.append('bukti_file', {
          uri: normalizedUri,
          name: safeName,
          type: mimeType
        } as any);
      }

      // Coba endpoint /api/my/presensi/late-explanation terlebih dahulu
      let targetUrl = `${apiUrl}/api/my/presensi/late-explanation`;
      let res = await uploadLateExplanationMultipart(targetUrl, formData, token);

      // Fallback jika 404 ke /api/presensi/late-explanation
      if (res.status === 404) {
        targetUrl = `${apiUrl}/api/presensi/late-explanation`;
        res = await uploadLateExplanationMultipart(targetUrl, formData, token);
      }

      if (res.ok) {
        showToast({
          title: 'Berhasil Terkirim',
          message: 'Klarifikasi keterlambatan berhasil diajukan kepada manajemen.',
          type: 'success'
        });

        // Temukan record presensi untuk menyimpan data tanggal
        const selectedAtt = attendances.find(a => a.id === selectedAttendanceId);
        const savedItem: LateExplanationItem = {
          attendance_id: selectedAttendanceId!,
          attendance_date: selectedAtt?.date,
          clock_in: selectedAtt?.clock_in,
          clock_out: selectedAtt?.clock_out,
          late_type: lateType,
          alasan: alasan.trim(),
          bukti_file: res.data?.bukti_file || attachmentUri,
          status: res.data?.status || 'pending',
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        await saveToLocalHistory(savedItem);

        // Reset form fields
        setAlasan('');
        setAttachmentUri(null);
        setAttachmentName(null);
        setAttachmentMime(null);
        setAttachmentSize(null);

        // Beralih ke Tab Riwayat untuk melihat hasil pengajuan
        setActiveTab('riwayat');
      } else {
        const errData = res.data || {};
        let errorMsg = errData.message || 'Gagal mengirim form keterlambatan';
        if (errData.errors && typeof errData.errors === 'object') {
          const detailList = Object.values(errData.errors).flat().join('\n');
          if (detailList) errorMsg = detailList;
        }
        showToast({
          title: 'Pengajuan Gagal',
          message: errorMsg,
          type: 'error'
        });
      }
    } catch (err: any) {
      showToast({
        title: 'Error',
        message: err?.message || 'Gagal menghubungi server.',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* TWO TABS NAVIGATION BAR */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'form' && styles.tabButtonActive]}
          onPress={() => setActiveTab('form')}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="edit-document"
            size={19}
            color={activeTab === 'form' ? theme.colors.primary : theme.colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'form' && styles.tabTextActive]}>
            Formulir Pengajuan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'riwayat' && styles.tabButtonActive]}
          onPress={() => setActiveTab('riwayat')}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="history"
            size={20}
            color={activeTab === 'riwayat' ? theme.colors.primary : theme.colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'riwayat' && styles.tabTextActive]}>
            Riwayat Pengajuan
          </Text>
          {historyList.length > 0 && (
            <View style={styles.tabCountBadge}>
              <Text style={styles.tabCountBadgeText}>{historyList.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* ========================================================================= */}
        {/* TAB 1: FORMULIR PENGAJUAN                                                */}
        {/* ========================================================================= */}
        {activeTab === 'form' ? (
          <View>
            {/* HERO NOTICE BANNER */}
            <View style={styles.heroCard}>
              <View style={styles.heroHeaderRow}>
                <View style={styles.heroIconBadge}>
                  <MaterialIcons name="history-toggle-off" size={28} color="#ffffff" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.heroTitle}>Klarifikasi Keterlambatan</Text>
                  <Text style={styles.heroSubtitle}>
                    Formulir administrasi penjelasan alasan keterlambatan jam masuk kerja atau kembali dari istirahat.
                  </Text>
                </View>
              </View>

              {/* PERIODE ATURAN 3 HARI */}
              <View style={styles.ruleNoticeBox}>
                <MaterialIcons name="schedule" size={18} color="#ea580c" style={{ marginTop: 2, marginRight: 8 }} />
                <Text style={styles.ruleNoticeText}>
                  <Text style={{ fontWeight: '700' }}>Ketentuan Pengajuan:</Text> Klarifikasi keterlambatan mandiri hanya dapat diajukan{' '}
                  <Text style={{ fontWeight: '700', color: '#ea580c' }}>maksimal 3 hari</Text> setelah tanggal presensi. Jika lebih dari 3 hari, silakan{' '}
                  <Text style={{ fontWeight: '700', color: '#dc2626' }}>hubungi personalia</Text>.
                </Text>
              </View>
            </View>

            {/* SECTION: PILIH PRESENSI YANG TERLAMBAT */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <MaterialIcons name="event-available" size={20} color={theme.colors.primary} />
                <Text style={styles.sectionTitle}>Pilih Presensi yang Terlambat</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Daftar presensi yang terlambat atau pulang cepat. Keterlambatan lebih dari 3 hari berlabel Hubungi Personalia:
              </Text>

              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.loadingText}>Memuat data presensi...</Text>
                </View>
              ) : lateAttendances.length === 0 ? (
                <View style={styles.emptyBox}>
                  <MaterialIcons name="check-circle" size={48} color="#10b981" />
                  <Text style={styles.emptyTitle}>Tidak Ada Presensi Terlambat</Text>
                  <Text style={styles.emptyDesc}>
                    Tidak ditemukan catatan presensi yang terlambat atau pulang cepat. Kehadiran Anda tercatat tepat waktu!
                  </Text>
                </View>
              ) : (
                <View style={styles.attendanceListWrapper}>
                  {lateAttendances.map(item => {
                    const isSelected = item.id === selectedAttendanceId;
                    const diff = getDaysDiff(item.date);
                    const isExpired = diff > 3;
                    const isToday = diff === 0;

                    const { isLateMasuk, isLateBreak, isEarlyLeave } = checkIsAttendanceLate(item);

                    let badgeText = '';
                    let badgeBg = '';
                    let badgeColor = '';
                    let isPersonalia = false;

                    if (isExpired) {
                      badgeText = 'Hubungi Personalia';
                      badgeBg = '#fee2e2';
                      badgeColor = '#dc2626';
                      isPersonalia = true;
                    } else if (isToday) {
                      badgeText = 'Hari Ini (Sisa 3 hari)';
                      badgeBg = '#dcfce7';
                      badgeColor = '#15803d';
                    } else if (diff === 1) {
                      badgeText = 'Kemarin (Sisa 2 hari)';
                      badgeBg = '#dbeafe';
                      badgeColor = '#1d4ed8';
                    } else if (diff === 2) {
                      badgeText = '2 hari lalu (Sisa 1 hari)';
                      badgeBg = '#fef3c7';
                      badgeColor = '#b45309';
                    } else if (diff === 3) {
                      badgeText = '3 hari lalu (Batas Terakhir!)';
                      badgeBg = '#ffedd5';
                      badgeColor = '#ea580c';
                    }

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.attendanceOptionCard,
                          isSelected && (isExpired ? styles.attendanceOptionCardActiveExpired : styles.attendanceOptionCardActive),
                          isExpired && !isSelected && styles.attendanceOptionCardExpired
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setSelectedAttendanceId(item.id);
                          if (isExpired) {
                            showToast({
                              title: 'Keterlambatan > 3 Hari',
                              message: 'Presensi ini melebihi batas waktu 3 hari. Harap hubungi bagian personalia.',
                              type: 'warning'
                            });
                          }
                        }}
                      >
                        <View style={styles.optionHeaderRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <View style={[
                              styles.radioCircle,
                              isSelected && (isExpired ? styles.radioCircleActiveExpired : styles.radioCircleActive),
                              isExpired && !isSelected && styles.radioCircleExpired
                            ]}>
                              {isSelected && (
                                <View style={[styles.radioDot, isExpired && { backgroundColor: '#dc2626' }]} />
                              )}
                            </View>
                            <Text style={[
                              styles.optionDateText,
                              isSelected && { color: isExpired ? '#dc2626' : theme.colors.primary, fontWeight: '700' }
                            ]}>
                              {formatDateIndo(item.date)}
                            </Text>
                          </View>
                          <View style={[styles.remainingBadge, { backgroundColor: badgeBg }]}>
                            {isPersonalia && (
                              <MaterialIcons name="support-agent" size={13} color={badgeColor} style={{ marginRight: 3 }} />
                            )}
                            <Text style={[styles.remainingBadgeText, { color: badgeColor, fontWeight: isPersonalia ? '700' : '600' }]}>
                              {badgeText}
                            </Text>
                          </View>
                        </View>

                        {/* Detail Jam & Status Terlambat */}
                        <View style={styles.optionDetailsRow}>
                          <View style={styles.timeTag}>
                            <MaterialIcons name="login" size={13} color={theme.colors.textMuted} />
                            <Text style={styles.timeTagText}>
                              Masuk: <Text style={{ fontWeight: '600' }}>{item.clock_in ? item.clock_in.substring(0, 5) : '--:--'}</Text>
                            </Text>
                          </View>

                          {item.clock_out && (
                            <View style={styles.timeTag}>
                              <MaterialIcons name="logout" size={13} color={theme.colors.textMuted} />
                              <Text style={styles.timeTagText}>
                                Pulang: <Text style={{ fontWeight: '600' }}>{item.clock_out.substring(0, 5)}</Text>
                              </Text>
                            </View>
                          )}

                          {item.break_end && (
                            <View style={styles.timeTag}>
                              <MaterialIcons name="restaurant" size={13} color={theme.colors.textMuted} />
                              <Text style={styles.timeTagText}>
                                Istirahat: <Text style={{ fontWeight: '600' }}>{item.break_end.substring(0, 5)}</Text>
                              </Text>
                            </View>
                          )}

                          {isLateMasuk && (
                            <View style={[styles.lateTag, { backgroundColor: '#fee2e2' }]}>
                              <Text style={[styles.lateTagText, { color: '#991b1b' }]}>
                                Telat Masuk {item.late_minutes ? `${item.late_minutes}m` : ''}
                              </Text>
                            </View>
                          )}

                          {isLateBreak && (
                            <View style={[styles.lateTag, { backgroundColor: '#ffedd5' }]}>
                              <Text style={[styles.lateTagText, { color: '#9a3412' }]}>
                                Telat Istirahat
                              </Text>
                            </View>
                          )}

                          {isEarlyLeave && (
                            <View style={[styles.lateTag, { backgroundColor: '#fef3c7' }]}>
                              <Text style={[styles.lateTagText, { color: '#92400e' }]}>
                                Pulang Cepat {item.early_leave_minutes ? `${item.early_leave_minutes}m` : ''}
                              </Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {formErrors.attendance && (
                <Text style={styles.errorTextHelper}>{formErrors.attendance}</Text>
              )}
            </View>

            {/* JIKA PRESENSI LEBIH DARI 3 HARI: TAMPILKAN HUBUNGI PERSONALIA */}
            {selectedAttendance && isSelectedExpired ? (
              <View style={styles.expiredCard}>
                <View style={styles.expiredHeaderRow}>
                  <View style={styles.expiredIconBadge}>
                    <MaterialIcons name="support-agent" size={28} color="#dc2626" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.expiredPill}>
                      <Text style={styles.expiredPillText}>Lebih dari 3 Hari</Text>
                    </View>
                    <Text style={styles.expiredCardTitle}>Hubungi Personalia</Text>
                  </View>
                </View>

                <Text style={styles.expiredCardDesc}>
                  Keterlambatan pada tanggal{' '}
                  <Text style={{ fontWeight: '700', color: '#1e293b' }}>
                    {formatDateIndo(selectedAttendance.date)}
                  </Text>{' '}
                  telah melewati batas waktu pengajuan mandiri (lebih dari 3 hari).
                </Text>

                <View style={styles.expiredCalloutBox}>
                  <MaterialIcons name="info" size={20} color="#b91c1c" style={{ marginTop: 2, marginRight: 8 }} />
                  <Text style={styles.expiredCalloutText}>
                    Formulir pengajuan mandiri ditutup untuk tanggal ini. Silakan hubungi bagian{' '}
                    <Text style={{ fontWeight: '700', color: '#991b1b' }}>Personalia / HRD</Text> secara langsung agar dapat diproses dan ditinjau secara manual.
                  </Text>
                </View>
              </View>
            ) : selectedAttendance && !isSelectedExpired ? (
              /* FORMULIR INPUT KLARIFIKASI (JIKA MASIH <= 3 HARI) */
              <View style={styles.formCard}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialIcons name="edit-note" size={22} color={theme.colors.primary} />
                  <Text style={styles.sectionTitle}>Detail Alasan & Berkas</Text>
                </View>

                {/* 1. PILIHAN JENIS KETERLAMBATAN (OTOMATIS BERDASARKAN PRESENSI) */}
                <View style={styles.lateTypeHeaderRow}>
                  <Text style={styles.inputLabel}>
                    Jenis Keterlambatan <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <View style={styles.autoDetectedBadge}>
                    <MaterialIcons name="auto-awesome" size={12} color="#ea580c" style={{ marginRight: 3 }} />
                    <Text style={styles.autoDetectedBadgeText}>Otomatis Terpilih</Text>
                  </View>
                </View>
                <Text style={styles.inputHint}>
                  Jenis disesuaikan otomatis dengan catatan presensi {formatDateIndo(selectedAttendance.date)}.
                </Text>
                <View style={styles.lateTypeGrid}>
                  <TouchableOpacity
                    style={[
                      styles.lateTypeBtn,
                      lateType === 'masuk' && styles.lateTypeBtnActive
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setLateType('masuk')}
                  >
                    <MaterialIcons
                      name="login"
                      size={20}
                      color={lateType === 'masuk' ? '#ea580c' : theme.colors.textMuted}
                    />
                    <Text style={[styles.lateTypeBtnTitle, lateType === 'masuk' && styles.lateTypeBtnTitleActive]}>
                      Masuk
                    </Text>
                    <Text style={styles.lateTypeBtnSubtitle}>Telat Masuk</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.lateTypeBtn,
                      lateType === 'istirahat' && styles.lateTypeBtnActive
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setLateType('istirahat')}
                  >
                    <MaterialIcons
                      name="restaurant"
                      size={20}
                      color={lateType === 'istirahat' ? '#ea580c' : theme.colors.textMuted}
                    />
                    <Text style={[styles.lateTypeBtnTitle, lateType === 'istirahat' && styles.lateTypeBtnTitleActive]}>
                      Istirahat
                    </Text>
                    <Text style={styles.lateTypeBtnSubtitle}>Telat Istirahat</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.lateTypeBtn,
                      lateType === 'pulang_cepat' && styles.lateTypeBtnActive
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setLateType('pulang_cepat')}
                  >
                    <MaterialIcons
                      name="logout"
                      size={20}
                      color={lateType === 'pulang_cepat' ? '#ea580c' : theme.colors.textMuted}
                    />
                    <Text style={[styles.lateTypeBtnTitle, lateType === 'pulang_cepat' && styles.lateTypeBtnTitleActive]}>
                      Pulang Cepat
                    </Text>
                    <Text style={styles.lateTypeBtnSubtitle}>Pulang Awal</Text>
                  </TouchableOpacity>
                </View>

                {/* 2. ALASAN KETERLAMBATAN */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.inputLabel}>
                      Alasan Keterlambatan <Text style={styles.requiredStar}>*</Text>
                    </Text>
                    <Text style={styles.charCounter}>{alasan.length} karakter</Text>
                  </View>
                  <TextInput
                    style={[
                      styles.textAreaInput,
                      formErrors.alasan ? styles.inputError : null
                    ]}
                    placeholder="Tuliskan alasan keterlambatan secara jelas dan jujur (mis. kendala transportasi, cuaca buruk, urusan darurat, dsb)..."
                    placeholderTextColor={theme.colors.textMuted}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    value={alasan}
                    onChangeText={text => {
                      setAlasan(text);
                      if (formErrors.alasan) setFormErrors(prev => ({ ...prev, alasan: undefined }));
                    }}
                  />
                  {formErrors.alasan && (
                    <Text style={styles.errorTextHelper}>{formErrors.alasan}</Text>
                  )}
                </View>

                {/* 3. BUKTI FOTO (OPSIONAL - MAKS 4 MB) */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.inputLabel}>Bukti Foto Pendukung</Text>
                    <Text style={styles.optionalBadge}>Opsional (Foto Maks. 4 MB)</Text>
                  </View>
                  <Text style={styles.inputHint}>
                    Format: Foto JPG, JPEG, PNG, atau WEBP (foto kendala di jalan, situasi cuaca, surat dokter, dsb).
                  </Text>

                  {/* Action Buttons: Kamera, Galeri */}
                  <View style={styles.pickerActionsRow}>
                    <TouchableOpacity
                      style={styles.pickerBtn}
                      onPress={handleTakePhoto}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="photo-camera" size={19} color={theme.colors.primary} />
                      <Text style={styles.pickerBtnText}>Ambil Foto (Kamera)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.pickerBtn}
                      onPress={handlePickImage}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="photo-library" size={19} color={theme.colors.primary} />
                      <Text style={styles.pickerBtnText}>Pilih dari Galeri</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Attachment Preview Card */}
                  {attachmentUri && (
                    <View style={styles.attachmentPreviewCard}>
                      <Image source={{ uri: attachmentUri }} style={styles.previewThumbnail} />

                      <View style={styles.previewInfo}>
                        <Text style={styles.previewFileName} numberOfLines={1}>
                          {attachmentName || 'bukti_foto.jpg'}
                        </Text>
                        <Text style={styles.previewFileSize}>
                          {formatBytes(attachmentSize)}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.btnRemoveAttachment}
                        onPress={removeAttachment}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="close" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* SUBMIT BUTTON */}
                <View style={styles.submitWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.btnSubmit,
                      submitting && { opacity: 0.7 }
                    ]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    {submitting ? (
                      <View style={styles.submitLoadingRow}>
                        <ActivityIndicator size="small" color="#ffffff" />
                        <Text style={styles.btnSubmitText}>Mengirim Form...</Text>
                      </View>
                    ) : (
                      <View style={styles.submitLoadingRow}>
                        <MaterialIcons name="send" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.btnSubmitText}>Kirim Form Keterlambatan</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          /* ========================================================================= */
          /* TAB 2: RIWAYAT PENGAJUAN FORM                                            */
          /* ========================================================================= */
          <View>
            {loadingHistory ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Memuat riwayat pengajuan...</Text>
              </View>
            ) : historyList.length === 0 ? (
              <View style={styles.emptyHistoryBox}>
                <MaterialCommunityIcons name="clipboard-text-clock-outline" size={54} color={theme.colors.textMuted} />
                <Text style={styles.emptyHistoryTitle}>Belum Ada Riwayat Pengajuan</Text>
                <Text style={styles.emptyHistoryDesc}>
                  Anda belum pernah mengajukan formulir klarifikasi keterlambatan.
                </Text>
                <TouchableOpacity
                  style={styles.btnGoToForm}
                  onPress={() => setActiveTab('form')}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="add" size={18} color="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.btnGoToFormText}>Buat Pengajuan Baru</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.historyListWrapper}>
                {historyList.map((item, index) => {
                  const s = (item.status || 'pending').toLowerCase();
                  let bgStatus = '#fef3c7';
                  let colStatus = '#b45309';
                  let labelStatus = 'Menunggu Persetujuan';

                  if (s.includes('approv') || s.includes('setuju') || s.includes('terima')) {
                    bgStatus = '#dcfce7';
                    colStatus = '#15803d';
                    labelStatus = 'Disetujui HRD';
                  } else if (s.includes('reject') || s.includes('tolak')) {
                    bgStatus = '#fee2e2';
                    colStatus = '#b91c1c';
                    labelStatus = 'Ditolak';
                  }

                  return (
                    <View key={item.id || `${item.attendance_id}-${index}`} style={styles.historyItemCard}>
                      {/* Header Item: Tanggal & Status Badge */}
                      <View style={styles.historyCardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <MaterialIcons name="event" size={16} color={theme.colors.primary} style={{ marginRight: 6 }} />
                          <Text style={styles.historyDateTitle}>
                            {formatDateIndo(item.attendance_date)}
                          </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: bgStatus }]}>
                          <Text style={[styles.statusBadgeText, { color: colStatus }]}>{labelStatus}</Text>
                        </View>
                      </View>

                      {/* Sub-Header: Jenis Keterlambatan */}
                      <View style={styles.historyTypeRow}>
                        {(() => {
                          let typeLabel = 'Terlambat Masuk';
                          let typeIcon: 'login' | 'restaurant' | 'logout' = 'login';
                          let typeBg = '#fee2e2';
                          let typeColor = '#991b1b';

                          if (item.late_type === 'pulang_cepat') {
                            typeLabel = 'Pulang Cepat';
                            typeIcon = 'logout';
                            typeBg = '#fef3c7';
                            typeColor = '#92400e';
                          } else if (item.late_type === 'istirahat') {
                            typeLabel = 'Terlambat Istirahat';
                            typeIcon = 'restaurant';
                            typeBg = '#ffedd5';
                            typeColor = '#9a3412';
                          }

                          return (
                            <View style={[styles.historyTypeBadge, { backgroundColor: typeBg }]}>
                              <MaterialIcons
                                name={typeIcon}
                                size={13}
                                color={typeColor}
                                style={{ marginRight: 4 }}
                              />
                              <Text style={[styles.historyTypeBadgeText, { color: typeColor }]}>
                                {typeLabel}
                              </Text>
                            </View>
                          );
                        })()}

                        {item.created_at && (
                          <Text style={styles.historyCreatedDate}>
                            Diajukan: {item.created_at.substring(0, 16)}
                          </Text>
                        )}
                      </View>

                      {/* Alasan */}
                      <View style={styles.historyReasonBox}>
                        <Text style={styles.historyReasonLabel}>Alasan:</Text>
                        <Text style={styles.historyReasonContent}>{item.alasan}</Text>
                      </View>

                      {/* Lampiran Foto Bukti */}
                      {item.bukti_file && (
                        <View style={styles.historyFileRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <MaterialIcons
                              name="image"
                              size={18}
                              color={theme.colors.primary}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.historyFileName} numberOfLines={1}>
                              Foto Bukti Keterlambatan
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.btnViewFile}
                            onPress={() => openAttachmentFile(item.bukti_file)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.btnViewFileText}>Lihat Foto</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Tanggapan / Catatan HRD */}
                      {(item.catatan || item.admin_note) && (
                        <View style={styles.historyAdminNoteBox}>
                          <Text style={styles.historyAdminNoteTitle}>Tanggapan HRD:</Text>
                          <Text style={styles.historyAdminNoteText}>
                            {item.catatan || item.admin_note}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },

  // TWO TABS NAVIGATION
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    borderRadius: theme.radius.m,
    padding: 4
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.s
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginLeft: 6
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: '700'
  },
  tabCountBadge: {
    backgroundColor: '#ea580c',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6
  },
  tabCountBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },

  scrollContainer: {
    flex: 1
  },
  scrollContent: {
    padding: 16
  },

  // HERO CARD
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  heroIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#ea580c',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#ea580c',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a'
  },
  heroSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 18
  },
  ruleNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 12,
    padding: 12
  },
  ruleNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#9a3412',
    lineHeight: 17
  },

  // SECTION CARD
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 8
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 14,
    marginLeft: 28
  },

  // ATTENDANCE SELECTION LIST
  attendanceListWrapper: {
    gap: 10
  },
  attendanceOptionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 12
  },
  attendanceOptionCardActive: {
    backgroundColor: '#eff6ff',
    borderColor: theme.colors.primary
  },
  attendanceOptionCardExpired: {
    backgroundColor: '#fffbfa',
    borderColor: '#fed7aa'
  },
  attendanceOptionCardActiveExpired: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444'
  },
  optionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  radioCircleActive: {
    borderColor: theme.colors.primary
  },
  radioCircleExpired: {
    borderColor: '#fca5a5'
  },
  radioCircleActiveExpired: {
    borderColor: '#ef4444'
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary
  },
  optionDateText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155'
  },
  remainingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20
  },
  remainingBadgeText: {
    fontSize: 11,
    fontWeight: '600'
  },
  optionDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginLeft: 30
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  timeTagText: {
    fontSize: 11.5,
    color: '#475569',
    marginLeft: 4
  },
  lateTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  lateTagText: {
    fontSize: 11,
    fontWeight: '700'
  },

  // LOADING & EMPTY
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b'
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17
  },

  // EXPIRED PERSONALIA CARD
  expiredCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    elevation: 2,
    shadowColor: '#dc2626',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: 16
  },
  expiredHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  expiredIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  expiredPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 4
  },
  expiredPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#b91c1c'
  },
  expiredCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991b1b'
  },
  expiredCardDesc: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    marginBottom: 14
  },
  expiredCalloutBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 12
  },
  expiredCalloutText: {
    flex: 1,
    fontSize: 12.5,
    color: '#991b1b',
    lineHeight: 18
  },

  lateTypeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  autoDetectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12
  },
  autoDetectedBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#ea580c'
  },

  // FORM CARD
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }
  },
  inputGroup: {
    marginTop: 16
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6
  },
  requiredStar: {
    color: '#ef4444'
  },
  charCounter: {
    fontSize: 11,
    color: '#94a3b8'
  },
  optionalBadge: {
    fontSize: 11,
    color: '#64748b'
  },
  inputHint: {
    fontSize: 11.5,
    color: '#64748b',
    marginBottom: 10,
    lineHeight: 16
  },

  // LATE TYPE GRID
  lateTypeGrid: {
    flexDirection: 'row',
    gap: 12
  },
  lateTypeBtn: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 12,
    alignItems: 'center'
  },
  lateTypeBtnActive: {
    backgroundColor: '#fff7ed',
    borderColor: '#ea580c'
  },
  lateTypeBtnTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
    marginTop: 6
  },
  lateTypeBtnTitleActive: {
    color: '#ea580c'
  },
  lateTypeBtnSubtitle: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 2
  },

  // TEXT AREA INPUT
  textAreaInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    fontSize: 13.5,
    color: '#0f172a',
    minHeight: 90
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2'
  },
  errorTextHelper: {
    fontSize: 11.5,
    color: '#ef4444',
    marginTop: 4
  },

  // PICKER ACTIONS
  pickerActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6
  },
  pickerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },

  // ATTACHMENT PREVIEW
  attachmentPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10
  },
  previewThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#e2e8f0'
  },
  previewPdfBadge: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewInfo: {
    flex: 1,
    marginLeft: 12
  },
  previewFileName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1e293b'
  },
  previewFileSize: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  btnRemoveAttachment: {
    padding: 8
  },

  // SUBMIT BUTTONS
  submitWrapper: {
    marginTop: 22
  },
  btnSubmit: {
    backgroundColor: '#ea580c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#ea580c',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 }
  },
  submitLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff'
  },

  // TAB 2: RIWAYAT STYLES
  emptyHistoryBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 10
  },
  emptyHistoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginTop: 14
  },
  emptyHistoryDesc: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    marginBottom: 20
  },
  btnGoToForm: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10
  },
  btnGoToFormText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },

  historyListWrapper: {
    gap: 12
  },
  historyItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  historyDateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b'
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  historyTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  historyTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  historyTypeBadgeText: {
    fontSize: 11.5,
    fontWeight: '700'
  },
  historyCreatedDate: {
    fontSize: 11,
    color: '#94a3b8'
  },
  historyReasonBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 10
  },
  historyReasonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 2
  },
  historyReasonContent: {
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18
  },
  historyFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8
  },
  historyFileName: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600'
  },
  btnViewFile: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  btnViewFileText: {
    fontSize: 11.5,
    color: '#1d4ed8',
    fontWeight: '700'
  },
  historyAdminNoteBox: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    padding: 10,
    marginTop: 4
  },
  historyAdminNoteTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 2
  },
  historyAdminNoteText: {
    fontSize: 12,
    color: '#78350f',
    lineHeight: 16
  }
});
