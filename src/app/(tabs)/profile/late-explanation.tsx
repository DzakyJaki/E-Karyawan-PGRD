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
  Modal,
  KeyboardAvoidingView
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../../core/theme';
import { useToast } from '../../../core/ToastContext';
import { useConfirm } from '../../../core/ConfirmContext';
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
  is_break_late?: boolean | null;
  break_late_minutes?: number | null;
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
  status?: 'draft' | 'pending' | 'approved' | 'rejected' | 'menunggu' | 'disetujui' | 'ditolak' | string;
  catatan?: string | null;
  catatan_penolakan?: string | null;
  admin_note?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LateExplanationDraft {
  id?: number;
  attendance_id: number;
  attendance_date?: string;
  clock_in?: string | null;
  clock_out?: string | null;
  late_type: LateType;
  alasan: string;
  attachmentUri?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  saved_at: string;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const STORAGE_KEY_HISTORY = '@late_explanations_history_v1';
const STORAGE_KEY_DRAFTS = '@late_explanations_drafts_v1';

export default function LateExplanationScreen() {
  const searchParams = useLocalSearchParams<{ attendance_id?: string; tab?: string }>();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

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

  // Local Drafts State: map attendance_id -> LateExplanationDraft
  const [drafts, setDrafts] = useState<Record<number, LateExplanationDraft>>({});

  // Form Fields
  const [lateType, setLateType] = useState<LateType>('masuk');
  const [alasan, setAlasan] = useState('');
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentMime, setAttachmentMime] = useState<string | null>(null);
  const [attachmentSize, setAttachmentSize] = useState<number | null>(null);

  // Form Errors
  const [formErrors, setFormErrors] = useState<{ alasan?: string; attendance?: string }>({});

  // Image Preview Modal State
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string>('Bukti Foto');

  // Helper: Format date string YYYY-MM-DD to Indonesian
  const formatDateIndo = (dateStr?: string, shortMonth: boolean = false) => {
    if (!dateStr) return '--';
    const parts = dateStr.split(' ')[0].split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m, d);
      const dayName = DAY_NAMES_ID[dateObj.getDay()] || '';
      const rawMonth = MONTH_NAMES_ID[m] || parts[1];
      const monthName = shortMonth ? rawMonth.substring(0, 3) : rawMonth;
      return `${dayName}, ${d} ${monthName} ${y}`;
    }
    return dateStr;
  };

  // Helper: Format date-time string YYYY-MM-DD HH:mm:ss to Indonesian
  const formatDateTimeIndo = (dateTimeStr?: string | null) => {
    if (!dateTimeStr) return '';
    try {
      const clean = dateTimeStr.replace('T', ' ').replace('Z', '');
      const [datePart, timePart] = clean.split(' ');
      const p = datePart.split('-');
      if (p.length === 3) {
        const d = parseInt(p[2], 10);
        const m = parseInt(p[1], 10) - 1;
        const y = p[0];
        const monthShort = MONTH_NAMES_ID[m] ? MONTH_NAMES_ID[m].substring(0, 3) : p[1];
        const timeShort = timePart ? timePart.substring(0, 5) : '';
        return `${d} ${monthShort} ${y}${timeShort ? `, ${timeShort} WIB` : ''}`;
      }
    } catch {}
    return dateTimeStr.substring(0, 16);
  };

  // Riwayat Pengajuan State: Hide / Show (Collapsible)
  const [expandedHistoryKeys, setExpandedHistoryKeys] = useState<Record<string, boolean>>({});

  const toggleExpandHistory = (key: string) => {
    setExpandedHistoryKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
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
      item.is_break_late === true ||
      (typeof item.break_late_minutes === 'number' && item.break_late_minutes > 0) ||
      (item.break_late_status &&
        !item.break_late_status.toLowerCase().includes('tepat') &&
        (item.break_late_status.toLowerCase().includes('telat') ||
         item.break_late_status.toLowerCase().includes('lambat') ||
         item.break_late_status.toLowerCase().includes('menit')))
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

  // Helper: Format file size
  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Helper: Ambil URL lengkap untuk berkas lampiran
  const getAttachmentFullUrl = useCallback((rawUrl?: string | null): string => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('file://')) {
      return rawUrl;
    }
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
    const cleanBase = apiUrl.replace(/\/+$/, '');
    const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
    const hasStorage = cleanPath.startsWith('/storage/');
    return `${cleanBase}${hasStorage ? cleanPath : `/storage${cleanPath}`}`;
  }, []);

  // Helper: Buka modal popup pratinjau gambar (bukan buka link eksternal)
  const openImageModal = useCallback((imageUrl?: string | null, title?: string) => {
    if (!imageUrl) return;
    const fullUrl = getAttachmentFullUrl(imageUrl);
    setPreviewImageUrl(fullUrl);
    setPreviewImageTitle(title || 'Bukti Foto Keterlambatan');
    setPreviewModalVisible(true);
  }, [getAttachmentFullUrl]);

  // Helper: Status pengajuan form untuk suatu presensi
  // Aturan:
  // 1. Jika draft -> tetap tampil di formulir (bisa diedit / dihapus)
  // 2. Jika diajukan (pending) -> terkunci (tidak tampil lagi di formulir)
  // 3. Jika disetujui (approved) -> terkunci permanen
  // 4. Jika ditolak 1 kali -> kembali ke formulir untuk kesempatan perbaikan
  // 5. Jika ditolak >= 2 kali -> terkunci (hanya ada di riwayat)
  const getAttendanceSubmissionStatus = useCallback((attendanceId: number) => {
    const exps = historyList.filter(h => h.attendance_id === attendanceId);
    const hasDraft = Boolean(drafts[attendanceId]);

    if (exps.length === 0) {
      return {
        hasSubmitted: false,
        hasPending: false,
        hasApproved: false,
        hasDraft,
        rejectedCount: 0,
        canResubmit: true,
        lastExplanation: null
      };
    }

    const hasPending = exps.some(e => {
      const s = (e.status || '').toLowerCase();
      return (s.includes('pending') || s.includes('menunggu')) && !s.includes('draft');
    });

    const hasApproved = exps.some(e => {
      const s = (e.status || '').toLowerCase();
      return s.includes('approv') || s.includes('setuju');
    });

    const rejectedExps = exps.filter(e => {
      const s = (e.status || '').toLowerCase();
      return s.includes('reject') || s.includes('tolak');
    });
    const rejectedCount = rejectedExps.length;

    // Dapat diajukan jika: tidak pending, tidak approved, dan jumlah penolakan < 2
    const canResubmit = !hasPending && !hasApproved && rejectedCount < 2;

    const sortedExps = [...exps].sort((a, b) => {
      const dateA = a.created_at || '';
      const dateB = b.created_at || '';
      return dateB.localeCompare(dateA);
    });

    return {
      hasSubmitted: true,
      hasPending,
      hasApproved,
      hasDraft,
      rejectedCount,
      canResubmit,
      lastExplanation: sortedExps[0] || null
    };
  }, [historyList, drafts]);

  // Menampilkan catatan presensi yang masih boleh diajukan formulir keterlambatannya
  const lateAttendances = useMemo(() => {
    return attendances
      .filter(item => {
        const diff = getDaysDiff(item.date);
        // Jangan tampilkan tanggal masa depan
        if (diff < 0) return false;

        // HANYA yang memiliki keterlambatan (masuk, istirahat, atau pulang cepat)
        const { isLate } = checkIsAttendanceLate(item);
        if (!isLate) return false;

        // Saring berdasarkan status pengajuan:
        // - Jika sedang pending / approved / ditolak >= 2x -> tidak tampil di formulir
        // - Jika belum diajukan ATAU ditolak 1x -> tampil di formulir
        const statusInfo = getAttendanceSubmissionStatus(item.id);
        return statusInfo.canResubmit;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendances, getDaysDiff, checkIsAttendanceLate, getAttendanceSubmissionStatus]);

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

  // Helper: Load local cached drafts
  const loadLocalDrafts = async (): Promise<Record<number, LateExplanationDraft>> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_DRAFTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {};
  };

  // Helper: Save draft for an attendance
  const saveDraft = async (
    attendanceId: number,
    draftData: Omit<LateExplanationDraft, 'attendance_id' | 'saved_at'>
  ) => {
    try {
      const att = attendances.find(a => a.id === attendanceId) || lateAttendances.find(a => a.id === attendanceId);
      const updatedDrafts = {
        ...drafts,
        [attendanceId]: {
          attendance_id: attendanceId,
          attendance_date: att?.date,
          clock_in: att?.clock_in,
          clock_out: att?.clock_out,
          ...draftData,
          saved_at: new Date().toISOString()
        }
      };
      await AsyncStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(updatedDrafts));
      setDrafts(updatedDrafts);
      showToast({
        title: 'Draft Tersimpan',
        message: 'Pengajuan disimpan sebagai draft. Anda dapat mengedit atau menghapusnya kapan saja.',
        type: 'success'
      });
    } catch {
      showToast({
        title: 'Gagal Menyimpan Draft',
        message: 'Terjadi kesalahan saat menyimpan draft lokal.',
        type: 'error'
      });
    }
  };

  // Helper: Hapus draft dari server backend (DELETE /api/my/presensi/late-explanation/{draftId})
  const deleteDraftFromServer = async (draftId: number): Promise<{ ok: boolean; message?: string }> => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      };

      // Coba endpoint /api/my/presensi/late-explanation/{draftId}
      let res = await fetch(`${apiUrl}/api/my/presensi/late-explanation/${draftId}`, {
        method: 'DELETE',
        headers
      });

      // Fallback tanpa /my jika 404
      if (res.status === 404) {
        res = await fetch(`${apiUrl}/api/presensi/late-explanation/${draftId}`, {
          method: 'DELETE',
          headers
        });
      }

      const json = await res.json().catch(() => ({}));
      return {
        ok: res.ok,
        message: json.message || (res.ok ? 'Draft berhasil dihapus dari server.' : 'Gagal menghapus draft.')
      };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Gagal menghubungi server' };
    }
  };

  // Helper: Remove draft for an attendance
  const removeDraft = async (attendanceId: number, silent = false) => {
    const doDelete = async () => {
      try {
        // Cek apakah draft ini memiliki ID di server
        const existingServerDraft = historyList.find(
          h => h.attendance_id === attendanceId && (h.status || '').toLowerCase().includes('draft')
        );
        const draftId = existingServerDraft?.id || drafts[attendanceId]?.id;

        if (draftId) {
          await deleteDraftFromServer(draftId);
        }

        const next = { ...drafts };
        delete next[attendanceId];
        await AsyncStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(next));
        setDrafts(next);

        // Hapus juga record draft dari historyList agar tampilan riwayat langsung bersih
        setHistoryList(prev => prev.filter(h => !(h.attendance_id === attendanceId && (h.status || '').toLowerCase().includes('draft'))));

        if (selectedAttendanceId === attendanceId) {
          setAlasan('');
          setAttachmentUri(null);
          setAttachmentName(null);
          setAttachmentMime(null);
          setAttachmentSize(null);
        }

        if (!silent) {
          showToast({
            title: 'Draft Dihapus',
            message: 'Draft pengajuan berhasil dihapus dari server dan perangkat.',
            type: 'info'
          });
        }

        // Sinkronkan ulang riwayat presensi
        fetchAllExplanationsHistory(attendances);
      } catch {}
    };

    if (silent) {
      await doDelete();
    } else {
      showConfirm({
        title: 'Hapus Draft Pengajuan?',
        message: 'Draft pengajuan untuk tanggal ini akan dihapus secara permanen dari server dan perangkat Anda.',
        type: 'danger',
        confirmText: 'Hapus Draft',
        cancelText: 'Batal',
        onConfirm: doDelete
      });
    }
  };

  // Gabungan Riwayat Pengajuan (Draft Lokal + Server Explanations)
  const displayHistoryList = useMemo(() => {
    // Buat item riwayat dari draft lokal
    const draftItems: LateExplanationItem[] = Object.values(drafts).map(d => ({
      id: d.id,
      attendance_id: d.attendance_id,
      attendance_date: d.attendance_date,
      clock_in: d.clock_in,
      clock_out: d.clock_out,
      late_type: d.late_type,
      alasan: d.alasan,
      bukti_file: d.attachmentUri,
      status: 'draft',
      created_at: d.saved_at,
      updated_at: d.saved_at
    }));

    // Saring: Jangan tampilkan draft lokal jika attendance_id tersebut sudah ada di historyList
    // baik yang draft (id sama) maupun yang sudah resmi diajukan (pending/approved)
    const validDrafts = draftItems.filter(d => {
      return !historyList.some(
        h => h.attendance_id === d.attendance_id && (h.id === d.id || (h.status && !h.status.toLowerCase().includes('draft')))
      );
    });

    const combined = [...validDrafts, ...historyList];
    return combined.sort((a, b) => {
      const dateA = a.created_at || a.attendance_date || '';
      const dateB = b.created_at || b.attendance_date || '';
      return dateB.localeCompare(dateA);
    });
  }, [drafts, historyList]);

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

  // Fetch Full History of Late Explanations dari backend (GET /api/my/presensi/{attendanceId}/late-explanation)
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

      // 2. Kumpulkan attendance_id yang perlu dicek ke backend:
      // - Seluruh presensi yang memiliki keterlambatan / pulang cepat
      // - Seluruh attendance_id yang pernah tersimpan di local history
      const attIdsToQuery = new Set<number>();
      currentAttendances.forEach(att => {
        if (att.id && checkIsAttendanceLate(att).isLate) {
          attIdsToQuery.add(att.id);
        }
      });
      localItems.forEach(item => {
        if (item.attendance_id) attIdsToQuery.add(item.attendance_id);
      });

      // 3. Panggil GET /api/my/presensi/{attendanceId}/late-explanation
      const fetchedExplanations: LateExplanationItem[] = [];
      const successfullyFetchedAttIds = new Set<number>();

      await Promise.all(
        Array.from(attIdsToQuery).map(async attId => {
          try {
            let res = await fetch(`${apiUrl}/api/my/presensi/${attId}/late-explanation`, { headers });
            if (res.status === 404) {
              res = await fetch(`${apiUrl}/api/presensi/${attId}/late-explanation`, { headers });
            }
            if (res.ok) {
              successfullyFetchedAttIds.add(attId);
              const json = await res.json();
              const att = currentAttendances.find(a => a.id === attId) || json.attendance;

              // Format Backend: { attendance: {...}, explanations: [...] }
              if (json && Array.isArray(json.explanations)) {
                json.explanations.forEach((exp: any) => {
                  fetchedExplanations.push({
                    id: exp.id,
                    attendance_id: exp.attendance_id || attId,
                    attendance_date: att?.date || json.attendance?.date,
                    clock_in: att?.clock_in || json.attendance?.clock_in,
                    clock_out: att?.clock_out || json.attendance?.clock_out,
                    late_type: (exp.late_type as LateType) || 'masuk',
                    alasan: exp.alasan || '',
                    bukti_file: exp.bukti_file || null,
                    status: exp.status || 'pending',
                    catatan_penolakan: exp.catatan_penolakan || null,
                    catatan: exp.catatan_penolakan || exp.catatan || exp.admin_note || null,
                    admin_note: exp.catatan_penolakan || exp.admin_note || null,
                    reviewed_at: exp.reviewed_at || exp.late_approved_at || exp.approved_at || exp.rejected_at || json.attendance?.late_approved_at || null,
                    reviewed_by: exp.reviewed_by || exp.late_approved_by || exp.approved_by || json.attendance?.late_approved_by || null,
                    created_at: exp.created_at || null,
                    updated_at: exp.updated_at || null
                  });
                });
              } else if (json && (json.attendance_id || json.id)) {
                // Format alternatif jika single record
                const d = json.data || json;
                fetchedExplanations.push({
                  id: d.id,
                  attendance_id: d.attendance_id || attId,
                  attendance_date: att?.date || d.attendance_date,
                  clock_in: att?.clock_in || d.clock_in,
                  clock_out: att?.clock_out || d.clock_out,
                  late_type: (d.late_type as LateType) || 'masuk',
                  alasan: d.alasan || '',
                  bukti_file: d.bukti_file || null,
                  status: d.status || 'pending',
                  catatan_penolakan: d.catatan_penolakan || null,
                  catatan: d.catatan_penolakan || d.catatan || d.admin_note || null,
                  admin_note: d.catatan_penolakan || d.admin_note || null,
                  reviewed_at: d.reviewed_at || d.late_approved_at || d.approved_at || d.rejected_at || json.attendance?.late_approved_at || null,
                  reviewed_by: d.reviewed_by || d.late_approved_by || d.approved_by || json.attendance?.late_approved_by || null,
                  created_at: d.created_at || null,
                  updated_at: d.updated_at || null
                });
              }
            }
          } catch (err) {
            console.log(`Error checking explanation for attendance ${attId}:`, err);
          }
        })
      );

      // 4. Gabungkan data server dengan localItems:
      // Server adalah sumber utama (Single Source of Truth).
      // Item lokal lama untuk attendance_id yang berhasil di-fetch dari server DIBUANG agar tidak terjadi duplikasi.
      const finalItemsMap = new Map<string, LateExplanationItem>();

      // Masukkan item dari server (prioritas utama)
      fetchedExplanations.forEach(item => {
        const key = item.id ? `id_${item.id}` : `att_${item.attendance_id}_${item.late_type}_${item.created_at || ''}`;
        finalItemsMap.set(key, item);
      });

      // Masukkan item lokal HANYA jika attendance_id tersebut BELUM berhasil diambil dari server (misal offline)
      localItems.forEach(item => {
        if (!successfullyFetchedAttIds.has(item.attendance_id)) {
          const key = item.id ? `id_${item.id}` : `att_${item.attendance_id}_${item.late_type}_${item.created_at || ''}`;
          if (!finalItemsMap.has(key)) {
            finalItemsMap.set(key, item);
          }
        }
      });

      const finalHistory = Array.from(finalItemsMap.values());

      // Urutkan riwayat dari yang terbaru
      finalHistory.sort((a, b) => {
        const dateA = a.created_at || a.attendance_date || '';
        const dateB = b.created_at || b.attendance_date || '';
        return dateB.localeCompare(dateA);
      });

      setHistoryList(finalHistory);
      await AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(finalHistory));

      // Sinkronkan draft dari server ke state drafts
      const serverDrafts: Record<number, LateExplanationDraft> = {};
      finalHistory.forEach(item => {
        if (item.status && item.status.toLowerCase().includes('draft')) {
          serverDrafts[item.attendance_id] = {
            id: item.id,
            attendance_id: item.attendance_id,
            attendance_date: item.attendance_date,
            clock_in: item.clock_in,
            clock_out: item.clock_out,
            late_type: item.late_type,
            alasan: item.alasan,
            attachmentUri: item.bukti_file,
            saved_at: item.updated_at || item.created_at || new Date().toISOString()
          };
        }
      });

      setDrafts(prev => {
        const next = { ...prev };
        successfullyFetchedAttIds.forEach(attId => {
          const hasServerDraft = finalHistory.some(
            h => h.attendance_id === attId && (h.status || '').toLowerCase().includes('draft')
          );
          if (!hasServerDraft && next[attId]?.id) {
            delete next[attId];
          }
        });
        const merged = { ...next, ...serverDrafts };
        AsyncStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(merged)).catch(() => {});
        return merged;
      });
    } catch (err) {
      console.log('Error fetching explanation history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [checkIsAttendanceLate]);

  // Initial Load
  useEffect(() => {
    const init = async () => {
      const local = await loadLocalHistory();
      const localDrafts = await loadLocalDrafts();
      setDrafts(localDrafts);
      setHistoryList(local);
      await fetchAttendances();
    };
    init();
  }, [fetchAttendances]);

  // Refresh history whenever attendances data is loaded or refreshed
  useEffect(() => {
    if (attendances.length > 0) {
      fetchAllExplanationsHistory(attendances);
    }
  }, [attendances, fetchAllExplanationsHistory]);

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

  // Otomatis tentukan jenis keterlambatan & muat draft jika ada dari presensi yang dipilih
  useEffect(() => {
    if (selectedAttendanceId) {
      setFormErrors({});
      // Cek apakah ada draft tersimpan untuk presensi ini
      if (drafts[selectedAttendanceId]) {
        const d = drafts[selectedAttendanceId];
        setLateType(d.late_type);
        setAlasan(d.alasan || '');
        setAttachmentUri(d.attachmentUri || null);
        setAttachmentName(d.attachmentName || null);
        setAttachmentMime(d.attachmentMime || null);
        setAttachmentSize(d.attachmentSize || null);
      } else {
        const target = lateAttendances.find(a => a.id === selectedAttendanceId) || attendances.find(a => a.id === selectedAttendanceId);
        if (target) {
          const { primaryType } = detectLateType(target);
          setLateType(primaryType);
        }
        setAlasan('');
        setAttachmentUri(null);
        setAttachmentName(null);
        setAttachmentMime(null);
        setAttachmentSize(null);
      }
    }
  }, [selectedAttendanceId, lateAttendances, attendances, detectLateType, drafts]);

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

  // Save Draft Handler (Dapat diedit & dihapus kapan saja selama masih draft)
  // Update: POST {{baseUrl}}/api/my/presensi/late-explanation/{{lateExplanationDraftId}}
  // Create: POST {{baseUrl}}/api/my/presensi/late-explanation
  const handleSaveDraft = async () => {
    if (!selectedAttendanceId) {
      showToast({
        title: 'Pilih Presensi',
        message: 'Silakan pilih tanggal presensi terlebih dahulu sebelum menyimpan draft.',
        type: 'warning'
      });
      return;
    }

    if (!alasan.trim()) {
      showToast({
        title: 'Alasan Belum Diisi',
        message: 'Tuliskan catatan atau draf alasan keterlambatan Anda sebelum menyimpan.',
        type: 'warning'
      });
      return;
    }

    setSubmitting(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');

      // Cek apakah draft ini sudah memiliki ID di server
      const existingServerDraft = historyList.find(
        h => h.attendance_id === selectedAttendanceId && (h.status || '').toLowerCase().includes('draft')
      );
      const draftId = existingServerDraft?.id || drafts[selectedAttendanceId]?.id;

      const formData = new FormData();
      formData.append('late_type', lateType);
      formData.append('alasan', alasan.trim());
      formData.append('status', 'draft');
      formData.append('is_draft', '1');

      if (!draftId) {
        formData.append('attendance_id', String(selectedAttendanceId));
      }

      // Lampirkan file jika ada dan merupakan file lokal baru
      if (
        attachmentUri &&
        (attachmentUri.startsWith('file://') || attachmentUri.startsWith('content://') || !attachmentUri.startsWith('http'))
      ) {
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

      let res: { ok: boolean; status: number; data: any };
      if (draftId) {
        // UPDATE DRAFT: POST {{baseUrl}}/api/my/presensi/late-explanation/{{lateExplanationDraftId}}
        let updateUrl = `${apiUrl}/api/my/presensi/late-explanation/${draftId}`;
        res = await uploadLateExplanationMultipart(updateUrl, formData, token);
        if (res.status === 404) {
          updateUrl = `${apiUrl}/api/presensi/late-explanation/${draftId}`;
          res = await uploadLateExplanationMultipart(updateUrl, formData, token);
        }
      } else {
        // CREATE DRAFT: POST {{baseUrl}}/api/my/presensi/late-explanation
        let createUrl = `${apiUrl}/api/my/presensi/late-explanation`;
        res = await uploadLateExplanationMultipart(createUrl, formData, token);
        if (res.status === 404) {
          createUrl = `${apiUrl}/api/presensi/late-explanation`;
          res = await uploadLateExplanationMultipart(createUrl, formData, token);
        }
      }

      const returnedId = res.data?.id || res.data?.explanation?.id || res.data?.data?.id || draftId;
      const returnedFile = res.data?.bukti_file || res.data?.explanation?.bukti_file || attachmentUri;

      await saveDraft(selectedAttendanceId, {
        id: returnedId,
        late_type: lateType,
        alasan: alasan.trim(),
        attachmentUri: returnedFile || null,
        attachmentName: attachmentName || null,
        attachmentMime: attachmentMime || null,
        attachmentSize: attachmentSize || null
      });

      showToast({
        title: draftId ? 'Draft Diperbarui' : 'Draft Tersimpan',
        message: 'Draft pengajuan berhasil disimpan di server. Anda dapat mengedit atau menghapusnya kapan saja.',
        type: 'success'
      });

      fetchAllExplanationsHistory(attendances);
    } catch {
      // Simpan lokal sebagai fallback bila jaringan bermasalah
      await saveDraft(selectedAttendanceId, {
        late_type: lateType,
        alasan: alasan.trim(),
        attachmentUri: attachmentUri || null,
        attachmentName: attachmentName || null,
        attachmentMime: attachmentMime || null,
        attachmentSize: attachmentSize || null
      });
      showToast({
        title: 'Draft Disimpan Lokal',
        message: 'Draft tersimpan di perangkat Anda.',
        type: 'info'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Handler (Mengirim ke backend, status menjadi pending dan TERKUNCI)
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

      // Cek apakah ada draft yang sudah memiliki ID di server
      const existingServerDraft = historyList.find(
        h => h.attendance_id === selectedAttendanceId && (h.status || '').toLowerCase().includes('draft')
      );
      const draftId = existingServerDraft?.id || drafts[selectedAttendanceId!]?.id;

      const formData = new FormData();
      formData.append('late_type', lateType);
      formData.append('alasan', alasan.trim());
      formData.append('status', 'pending');
      formData.append('action', 'submit');
      formData.append('is_draft', '0');

      if (!draftId) {
        formData.append('attendance_id', String(selectedAttendanceId));
      }

      // Kirim lampiran foto jika ada dan merupakan file lokal baru
      if (
        attachmentUri &&
        (attachmentUri.startsWith('file://') || attachmentUri.startsWith('content://') || !attachmentUri.startsWith('http'))
      ) {
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

      let res: { ok: boolean; status: number; data: any };

      if (draftId) {
        // Jika sebelumnya berstatus draft di server, update dan ajukan draft tersebut
        let updateUrl = `${apiUrl}/api/my/presensi/late-explanation/${draftId}`;
        res = await uploadLateExplanationMultipart(updateUrl, formData, token);
        if (res.status === 404) {
          updateUrl = `${apiUrl}/api/presensi/late-explanation/${draftId}`;
          res = await uploadLateExplanationMultipart(updateUrl, formData, token);
        }

        // Jika update tidak berhasil, coba submit via create endpoint
        if (!res.ok) {
          formData.append('attendance_id', String(selectedAttendanceId));
          let targetUrl = `${apiUrl}/api/my/presensi/late-explanation`;
          res = await uploadLateExplanationMultipart(targetUrl, formData, token);
          if (res.status === 404) {
            targetUrl = `${apiUrl}/api/presensi/late-explanation`;
            res = await uploadLateExplanationMultipart(targetUrl, formData, token);
          }
        }
      } else {
        // Jika belum ada draft di server, buat pengajuan baru
        formData.append('attendance_id', String(selectedAttendanceId));
        let targetUrl = `${apiUrl}/api/my/presensi/late-explanation`;
        res = await uploadLateExplanationMultipart(targetUrl, formData, token);
        if (res.status === 404) {
          targetUrl = `${apiUrl}/api/presensi/late-explanation`;
          res = await uploadLateExplanationMultipart(targetUrl, formData, token);
        }
      }

      if (res.ok) {
        showToast({
          title: 'Berhasil Diajukan',
          message: 'Klarifikasi keterlambatan berhasil diajukan dan terkunci menunggu review personalia.',
          type: 'success'
        });

        // Hapus draft lokal untuk presensi ini jika ada (sudah resmi diajukan)
        await removeDraft(selectedAttendanceId!, true);

        // Temukan record presensi untuk menyimpan data tanggal
        const selectedAtt = attendances.find(a => a.id === selectedAttendanceId);
        const expId = res.data?.id || res.data?.explanation?.id || res.data?.data?.id || draftId;

        const savedItem: LateExplanationItem = {
          id: expId || undefined,
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

        // Segera sinkronkan ulang seluruh riwayat dari backend
        fetchAllExplanationsHistory(attendances);

        // Beralih ke Tab Riwayat untuk melihat hasil pengajuan (terkunci)
        setActiveTab('riwayat');
      } else {
        const errData = res.data || {};
        let errorMsg = errData.message || 'Gagal mengirim form pengajuan presensi';
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
          {displayHistoryList.length > 0 && (
            <View style={styles.tabCountBadge}>
              <Text style={styles.tabCountBadgeText}>{displayHistoryList.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
                  <Text style={styles.heroTitle}>Form Pengajuan Presensi</Text>
                  <Text style={styles.heroSubtitle}>
                    Formulir administrasi penjelasan alasan telat masuk kerja, telat masuk istirahat, atau pulang cepat.
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

                    const statusInfo = getAttendanceSubmissionStatus(item.id);
                    const isResubmit = statusInfo.rejectedCount === 1;
                    const isDraft = Boolean(drafts[item.id]);

                    let badgeText = '';
                    let badgeBg = '';
                    let badgeColor = '';
                    let isPersonalia = false;

                    if (isDraft) {
                      badgeText = 'Draft';
                      badgeBg = '#e0f2fe';
                      badgeColor = '#0369a1';
                    } else if (isResubmit) {
                      badgeText = 'Pengajuan Ulang';
                      badgeBg = '#fef3c7';
                      badgeColor = '#b45309';
                    } else if (isExpired) {
                      badgeText = 'Hubungi Personalia';
                      badgeBg = '#fee2e2';
                      badgeColor = '#dc2626';
                      isPersonalia = true;
                    } else if (isToday) {
                      badgeText = 'Sisa 3 Hari';
                      badgeBg = '#dcfce7';
                      badgeColor = '#15803d';
                    } else if (diff === 1) {
                      badgeText = 'Sisa 2 Hari';
                      badgeBg = '#dbeafe';
                      badgeColor = '#1d4ed8';
                    } else if (diff === 2) {
                      badgeText = 'Sisa 1 Hari';
                      badgeBg = '#fef3c7';
                      badgeColor = '#b45309';
                    } else if (diff === 3) {
                      badgeText = 'Batas Terakhir!';
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
                        <View style={styles.cardMainRow}>
                          {/* Radio Button Kolom Kiri */}
                          <View style={[
                            styles.radioCircle,
                            isSelected && (isExpired ? styles.radioCircleActiveExpired : styles.radioCircleActive),
                            isExpired && !isSelected && styles.radioCircleExpired
                          ]}>
                            {isSelected && (
                              <View style={[styles.radioDot, isExpired && { backgroundColor: '#dc2626' }]} />
                            )}
                          </View>

                          {/* Kolom Kanan Konten */}
                          <View style={styles.cardContentCol}>
                            {/* Baris 1: Tanggal Rapi (Bulan Ringkas) & Badge Batas/Status */}
                            <View style={styles.optionHeaderRow}>
                              <Text
                                style={[
                                  styles.optionDateText,
                                  isSelected && { color: isExpired ? '#dc2626' : theme.colors.primary, fontWeight: '700' }
                                ]}
                                numberOfLines={1}
                              >
                                {formatDateIndo(item.date, true)}
                              </Text>

                              <View style={[styles.remainingBadge, { backgroundColor: badgeBg }]}>
                                {isPersonalia && (
                                  <MaterialIcons name="support-agent" size={12} color={badgeColor} style={{ marginRight: 3 }} />
                                )}
                                {isDraft && (
                                  <MaterialIcons name="edit-note" size={14} color={badgeColor} style={{ marginRight: 2 }} />
                                )}
                                <Text style={[styles.remainingBadgeText, { color: badgeColor, fontWeight: (isPersonalia || isDraft) ? '700' : '600' }]}>
                                  {badgeText}
                                </Text>
                              </View>
                            </View>

                            {/* Baris 2: Pill Terpadu Jam & Status Terlambat */}
                            <View style={styles.optionDetailsRow}>
                              {/* 1. Kondisi Telat Masuk */}
                              {isLateMasuk && (
                                <View style={[styles.lateDetailPill, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                                  <MaterialIcons name="login" size={12} color="#991b1b" style={{ marginRight: 4 }} />
                                  <Text style={styles.lateDetailPillTime}>
                                    Masuk: <Text style={{ fontWeight: '700', color: '#991b1b' }}>{item.clock_in ? item.clock_in.substring(0, 5) : '--:--'}</Text>
                                  </Text>
                                  <View style={[styles.lateDetailDivider, { backgroundColor: '#fca5a5' }]} />
                                  <Text style={[styles.lateDetailPillBadge, { color: '#991b1b' }]}>
                                    Telat {item.late_minutes ? `${item.late_minutes}m` : ''}
                                  </Text>
                                </View>
                              )}

                              {/* 2. Kondisi Telat Masuk Istirahat */}
                              {isLateBreak && (
                                <View style={[styles.lateDetailPill, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
                                  <MaterialIcons name="restaurant" size={12} color="#c2410c" style={{ marginRight: 4 }} />
                                  <Text style={[styles.lateDetailPillTime, { color: '#9a3412' }]}>
                                    Masuk Istirahat: <Text style={{ fontWeight: '700', color: '#9a3412' }}>{item.break_end ? item.break_end.substring(0, 5) : item.break_start ? item.break_start.substring(0, 5) : '--:--'}</Text>
                                  </Text>
                                  <View style={[styles.lateDetailDivider, { backgroundColor: '#fdba74' }]} />
                                  <Text style={[styles.lateDetailPillBadge, { color: '#c2410c' }]}>
                                    Telat {item.break_late_minutes ? `${item.break_late_minutes}m` : ''}
                                  </Text>
                                </View>
                              )}

                              {/* 3. Kondisi Pulang Cepat */}
                              {isEarlyLeave && (
                                <View style={[styles.lateDetailPill, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                                  <MaterialIcons name="logout" size={12} color="#b45309" style={{ marginRight: 4 }} />
                                  <Text style={[styles.lateDetailPillTime, { color: '#92400e' }]}>
                                    Pulang: <Text style={{ fontWeight: '700', color: '#92400e' }}>{item.clock_out ? item.clock_out.substring(0, 5) : '--:--'}</Text>
                                  </Text>
                                  <View style={[styles.lateDetailDivider, { backgroundColor: '#fcd34d' }]} />
                                  <Text style={[styles.lateDetailPillBadge, { color: '#b45309' }]}>
                                    Cepat {item.early_leave_minutes ? `${item.early_leave_minutes}m` : ''}
                                  </Text>
                                </View>
                              )}

                              {/* 4. Fallback jika tidak ada flag spesifik */}
                              {!isLateMasuk && !isLateBreak && !isEarlyLeave && item.clock_in && (
                                <View style={[styles.lateDetailPill, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
                                  <MaterialIcons name="schedule" size={12} color="#475569" style={{ marginRight: 4 }} />
                                  <Text style={styles.lateDetailPillTime}>
                                    Jam: <Text style={{ fontWeight: '700' }}>{item.clock_in.substring(0, 5)}</Text>
                                  </Text>
                                </View>
                              )}

                              {/* Indikator Status Pengajuan Form / Draft Jika Ada */}
                              {(() => {
                                if (drafts[item.id]) {
                                  return (
                                    <View
                                      style={[
                                        styles.lateDetailPill,
                                        { backgroundColor: '#e0f2fe', borderColor: '#bae6fd' }
                                      ]}
                                    >
                                      <MaterialIcons
                                        name="edit-note"
                                        size={12}
                                        color="#0369a1"
                                        style={{ marginRight: 3 }}
                                      />
                                      <Text style={[styles.lateDetailPillBadge, { color: '#0369a1', fontWeight: '700' }]}>
                                        Draft Tersimpan
                                      </Text>
                                    </View>
                                  );
                                }

                                const itemExp = historyList.find(h => h.attendance_id === item.id);
                                if (!itemExp) return null;
                                const st = (itemExp.status || 'pending').toLowerCase();
                                const isApp = st.includes('approv') || st.includes('setuju');
                                const isRej = st.includes('reject') || st.includes('tolak');

                                return (
                                  <View
                                    style={[
                                      styles.lateDetailPill,
                                      {
                                        backgroundColor: isApp ? '#dcfce7' : isRej ? '#fee2e2' : '#fef3c7',
                                        borderColor: isApp ? '#86efac' : isRej ? '#fca5a5' : '#fde68a'
                                      }
                                    ]}
                                  >
                                    <MaterialIcons
                                      name={isApp ? 'check-circle' : isRej ? 'cancel' : 'hourglass-top'}
                                      size={11}
                                      color={isApp ? '#15803d' : isRej ? '#b91c1c' : '#b45309'}
                                      style={{ marginRight: 3 }}
                                    />
                                    <Text
                                      style={[
                                        styles.lateDetailPillBadge,
                                        { color: isApp ? '#15803d' : isRej ? '#b91c1c' : '#b45309' }
                                      ]}
                                    >
                                      {isApp ? 'Disetujui' : isRej ? 'Ditolak' : 'Sudah Diajukan'}
                                    </Text>
                                  </View>
                                );
                              })()}
                            </View>
                          </View>
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

                {/* BANNER DRAFT TERSIMPAN (JIKA ADA DRAFT UNTUK PRESENSI INI) */}
                {drafts[selectedAttendance.id] && (
                  <View style={styles.draftNoticeBanner}>
                    <View style={styles.draftNoticeHeader}>
                      <View style={styles.draftNoticeTitleRow}>
                        <MaterialIcons name="edit-document" size={17} color="#0369a1" style={{ marginRight: 6 }} />
                        <Text style={styles.draftNoticeTitle}>Draft Formulir Tersimpan</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.btnDeleteDraftMini}
                        onPress={() => removeDraft(selectedAttendance.id)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="delete-outline" size={15} color="#ef4444" style={{ marginRight: 4 }} />
                        <Text style={styles.btnDeleteDraftMiniText}>Hapus Draft</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.draftNoticeDesc}>
                      {drafts[selectedAttendance.id]?.id
                        ? `Tersimpan di server (Draft ID: #${drafts[selectedAttendance.id]?.id}). Anda dapat mengedit, memperbarui, atau menghapus draft ini sebelum diajukan.`
                        : `Tersimpan di perangkat Anda (${formatDateTimeIndo(drafts[selectedAttendance.id]?.saved_at)}). Anda dapat mengedit isi form atau menghapus draft ini.`}
                    </Text>
                  </View>
                )}

                {/* BANNER PENGAJUAN ULANG (JIKA SEBELUMNYA DITOLAK 1 KALI) */}
                {(() => {
                  const st = selectedAttendance ? getAttendanceSubmissionStatus(selectedAttendance.id) : null;
                  if (!st || st.rejectedCount !== 1 || !st.lastExplanation) return null;

                  return (
                    <View style={styles.resubmitNoticeBox}>
                      <View style={styles.resubmitHeaderRow}>
                        <MaterialIcons name="replay" size={18} color="#b45309" style={{ marginRight: 6 }} />
                        <Text style={styles.resubmitNoticeTitle}>Pengajuan Ulang (Kesempatan ke-2 / Terakhir)</Text>
                      </View>
                      <Text style={styles.resubmitNoticeDesc}>
                        Pengajuan sebelumnya ditolak oleh personelia. Silakan lengkapi alasan atau foto bukti yang lebih jelas.
                      </Text>
                      {st.lastExplanation.catatan_penolakan ? (
                        <View style={styles.resubmitRejectNoteBox}>
                          <Text style={styles.resubmitRejectNoteLabel}>Catatan Penolakan dari Personelia:</Text>
                          <Text style={styles.resubmitRejectNoteText}>
                            {st.lastExplanation.catatan_penolakan}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })()}

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
                      Masuk Istirahat
                    </Text>
                    <Text style={styles.lateTypeBtnSubtitle}>Telat Masuk Istirahat</Text>
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
                      <TouchableOpacity
                        onPress={() => openImageModal(attachmentUri, 'Bukti Foto yang Dipilih')}
                        activeOpacity={0.8}
                      >
                        <Image source={{ uri: attachmentUri }} style={styles.previewThumbnail} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.previewInfo}
                        onPress={() => openImageModal(attachmentUri, 'Bukti Foto yang Dipilih')}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.previewFileName} numberOfLines={1}>
                          {attachmentName || 'bukti_foto.jpg'}
                        </Text>
                        <Text style={styles.previewFileSize}>
                          {formatBytes(attachmentSize)} (Ketuk untuk melihat foto)
                        </Text>
                      </TouchableOpacity>

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

                {/* TOMBOL AKSI: SIMPAN DRAFT & AJUKAN SEKARANG */}
                <View style={styles.formActionButtonsContainer}>
                  <View style={styles.formActionButtonsRow}>
                    <TouchableOpacity
                      style={[styles.btnSaveDraft, submitting && { opacity: 0.6 }]}
                      onPress={handleSaveDraft}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="save" size={18} color="#0284c7" style={{ marginRight: 6 }} />
                      <Text style={styles.btnSaveDraftText}>
                        {drafts[selectedAttendance.id] ? 'Perbarui Draft' : 'Simpan Draft'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnSubmit, submitting && { opacity: 0.7 }]}
                      onPress={handleSubmit}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      {submitting ? (
                        <View style={styles.submitLoadingRow}>
                          <ActivityIndicator size="small" color="#ffffff" />
                          <Text style={styles.btnSubmitText}>Mengirim...</Text>
                        </View>
                      ) : (
                        <View style={styles.submitLoadingRow}>
                          <MaterialIcons name="send" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={styles.btnSubmitText}>Ajukan Sekarang</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.submitHintContainer}>
                    <MaterialIcons name="lock-outline" size={14} color="#64748b" style={{ marginRight: 5, marginTop: 1 }} />
                    <Text style={styles.submitHintText}>
                      Draft dapat diedit atau dihapus kapan saja. Saat diajukan, pengajuan berubah menjadi <Text style={{ fontWeight: '700', color: '#b45309' }}>Pending</Text> dan <Text style={{ fontWeight: '700', color: '#1e293b' }}>terkunci</Text> (tidak dapat diubah lagi).
                    </Text>
                  </View>
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
            ) : displayHistoryList.length === 0 ? (
              <View style={styles.emptyHistoryBox}>
                <MaterialCommunityIcons name="clipboard-text-clock-outline" size={54} color={theme.colors.textMuted} />
                <Text style={styles.emptyHistoryTitle}>Belum Ada Riwayat Pengajuan</Text>
                <Text style={styles.emptyHistoryDesc}>
                  Anda belum pernah mengajukan formulir klarifikasi keterlambatan atau menyimpan draft.
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
              <View>
                <View style={styles.historyListWrapper}>
                  {displayHistoryList.map((item, index) => {
                    const s = (item.status || 'pending').toLowerCase();
                    const isDraft = s.includes('draft');
                    const isApp = s.includes('approv') || s.includes('setuju') || s.includes('terima');
                    const isRej = s.includes('reject') || s.includes('tolak');
                    const isPending = !isDraft && !isApp && !isRej;

                    let bgStatus = '#fef3c7';
                    let colStatus = '#b45309';
                    let shortStatus = 'Menunggu';
                    let fullStatus = 'Masih menunggu review personelia';
                    let statusIcon: 'schedule' | 'check-circle' | 'cancel' | 'edit-note' = 'schedule';

                    if (isDraft) {
                      bgStatus = '#e0f2fe';
                      colStatus = '#0369a1';
                      shortStatus = 'Draft';
                      fullStatus = 'Draft Tersimpan (Belum Diajukan)';
                      statusIcon = 'edit-note';
                    } else if (isApp) {
                      bgStatus = '#dcfce7';
                      colStatus = '#15803d';
                      shortStatus = 'Disetujui';
                      fullStatus = item.late_type === 'masuk'
                        ? 'Disetujui personelia (tidak dipotong gaji)'
                        : 'Disetujui personelia';
                      statusIcon = 'check-circle';
                    } else if (isRej) {
                      bgStatus = '#fee2e2';
                      colStatus = '#b91c1c';
                      shortStatus = 'Ditolak';
                      fullStatus = 'Ditolak personelia';
                      statusIcon = 'cancel';
                    }

                    const itemKey = isDraft
                      ? `draft_${item.attendance_id}`
                      : item.id ? `id_${item.id}` : `att_${item.attendance_id}_${item.late_type}_${index}`;
                    const isExpanded = expandedHistoryKeys[itemKey] ?? (displayHistoryList.length === 1 || index === 0);

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
                      typeLabel = 'Telat Masuk Istirahat';
                      typeIcon = 'restaurant';
                      typeBg = '#ffedd5';
                      typeColor = '#9a3412';
                    }

                    const hasAdminNote = Boolean(item.catatan || item.admin_note || item.catatan_penolakan);

                    return (
                      <View key={itemKey} style={styles.historyItemCard}>
                        {/* HEADER KARTU (BISA DIKETUK UNTUK HIDE/SHOW) */}
                        <TouchableOpacity
                          style={styles.historyCardHeaderTouchable}
                          onPress={() => toggleExpandHistory(itemKey)}
                          activeOpacity={0.7}
                        >
                          {/* Baris 1: Tanggal & Badge Status Compact + Chevron */}
                          <View style={styles.historyHeaderTopRow}>
                            <View style={styles.historyDateWrapper}>
                              <MaterialIcons name="event" size={17} color={theme.colors.primary} style={{ marginRight: 6 }} />
                              <Text style={styles.historyDateTitle} numberOfLines={1}>
                                {formatDateIndo(item.attendance_date)}
                              </Text>
                            </View>
                            <View style={styles.historyHeaderRightBadges}>
                              <View style={[styles.statusBadgeCompact, { backgroundColor: bgStatus }]}>
                                <MaterialIcons name={statusIcon} size={12} color={colStatus} style={{ marginRight: 3 }} />
                                <Text style={[styles.statusBadgeText, { color: colStatus }]}>{shortStatus}</Text>
                              </View>
                              <View style={[styles.chevronBox, isExpanded && styles.chevronBoxActive]}>
                                <MaterialIcons
                                  name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                                  size={18}
                                  color={isExpanded ? theme.colors.primary : '#64748b'}
                                />
                              </View>
                            </View>
                          </View>

                          {/* Baris 2: Sub-Header Jenis Keterlambatan & Waktu Pengajuan */}
                          <View style={styles.historyTypeRow}>
                            <View style={[styles.historyTypeBadge, { backgroundColor: typeBg }]}>
                              <MaterialIcons
                                name={typeIcon}
                                size={12}
                                color={typeColor}
                                style={{ marginRight: 4 }}
                              />
                              <Text style={[styles.historyTypeBadgeText, { color: typeColor }]}>
                                {typeLabel}
                              </Text>
                            </View>

                            {item.created_at && (
                              <Text style={styles.historyCreatedDate}>
                                {isDraft ? 'Disimpan: ' : 'Diajukan: '}{formatDateTimeIndo(item.created_at)}
                              </Text>
                            )}
                          </View>

                          {/* Baris 3: Cuplikan Alasan saat Tertutup (Hide / Collapsed) */}
                          {!isExpanded && (
                            <View style={styles.historyCollapsedPreviewBox}>
                              <Text style={styles.historyCollapsedReasonText} numberOfLines={2}>
                                <Text style={{ fontWeight: '700', color: '#64748b' }}>Alasan: </Text>
                                {item.alasan}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        {/* DETAIL LENGKAP SAAT TERBUKA (SHOW / EXPANDED) */}
                        {isExpanded && (
                          <View style={styles.historyExpandedContent}>
                            <View style={styles.historyDivider} />

                            {/* Status Lengkap Personelia */}
                            <View
                              style={[
                                styles.historyFullStatusBox,
                                { backgroundColor: bgStatus, borderColor: colStatus + '40' }
                              ]}
                            >
                              <MaterialIcons
                                name={statusIcon}
                                size={16}
                                color={colStatus}
                                style={{ marginRight: 6, marginTop: 1 }}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.historyFullStatusTitle, { color: colStatus }]}>
                                  {fullStatus}
                                </Text>
                                <Text style={[styles.historyFullStatusSubtitle, { color: colStatus }]}>
                                  {isDraft
                                    ? `Draft tersimpan${item.id ? ` di server (#${item.id})` : ' di perangkat'}. Silakan lanjutkan edit atau ajukan di tab Formulir.`
                                    : isApp
                                    ? 'Pengajuan klarifikasi telah disetujui oleh tim personalia.'
                                    : isRej
                                    ? 'Pengajuan ditolak. Silakan periksa catatan penolakan di bawah.'
                                    : 'Pengajuan telah dikirim dan terkunci menunggu review tim personalia.'}
                                </Text>
                                {Boolean(item.reviewed_at || (isApp || isRej ? item.updated_at : null)) && (
                                  <Text style={[styles.historyFullStatusSubtitle, { color: colStatus, marginTop: 4, fontWeight: '700' }]}>
                                    Ditinjau pada: {formatDateTimeIndo(item.reviewed_at || item.updated_at)}
                                  </Text>
                                )}
                              </View>
                            </View>

                            {/* Aksi Khusus untuk Draft: Lanjutkan Edit atau Hapus */}
                            {isDraft && (
                              <View style={styles.historyDraftActionsRow}>
                                <TouchableOpacity
                                  style={styles.btnDraftActionEdit}
                                  onPress={() => {
                                    setSelectedAttendanceId(item.attendance_id);
                                    setActiveTab('form');
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <MaterialIcons name="edit" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                                  <Text style={styles.btnDraftActionEditText}>Lanjutkan Edit / Ajukan</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.btnDraftActionDelete}
                                  onPress={() => removeDraft(item.attendance_id)}
                                  activeOpacity={0.8}
                                >
                                  <MaterialIcons name="delete-outline" size={16} color="#ef4444" style={{ marginRight: 4 }} />
                                  <Text style={styles.btnDraftActionDeleteText}>Hapus Draft</Text>
                                </TouchableOpacity>
                              </View>
                            )}

                            {/* Tanda Pengajuan Terkunci untuk Status Pending & Approved */}
                            {isPending && (
                              <View style={styles.lockedNoticeRow}>
                                <MaterialIcons name="lock" size={14} color="#b45309" style={{ marginRight: 6 }} />
                                <Text style={styles.lockedNoticeText}>
                                  Terkunci: Pengajuan telah dikirim dan menunggu persetujuan personalia (tidak dapat diedit atau dihapus).
                                </Text>
                              </View>
                            )}

                            {isApp && (
                              <View style={[styles.lockedNoticeRow, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                                <MaterialIcons name="lock" size={14} color="#15803d" style={{ marginRight: 6 }} />
                                <Text style={[styles.lockedNoticeText, { color: '#15803d' }]}>
                                  Terkunci: Pengajuan telah disetujui personalia dan tersimpan permanen.
                                </Text>
                              </View>
                            )}

                            {/* Alasan Lengkap */}
                            <View style={styles.historyReasonBox}>
                              <Text style={styles.historyReasonLabel}>Alasan Keterlambatan:</Text>
                              <Text style={styles.historyReasonContent}>{item.alasan}</Text>
                            </View>

                            {/* Lampiran Foto Bukti */}
                            {item.bukti_file && (
                              <View style={styles.historyFileRow}>
                                <TouchableOpacity
                                  onPress={() =>
                                    openImageModal(item.bukti_file, `Bukti Foto - ${formatDateIndo(item.attendance_date)}`)
                                  }
                                  activeOpacity={0.8}
                                >
                                  <Image
                                    source={{ uri: getAttachmentFullUrl(item.bukti_file) }}
                                    style={styles.historyThumbnail}
                                  />
                                </TouchableOpacity>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                  <Text style={styles.historyFileName} numberOfLines={1}>
                                    Foto Bukti Keterlambatan
                                  </Text>
                                  <Text style={styles.historyFileSub}>Ketuk untuk melihat foto</Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.btnViewFile}
                                  onPress={() =>
                                    openImageModal(item.bukti_file, `Bukti Foto - ${formatDateIndo(item.attendance_date)}`)
                                  }
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.btnViewFileText}>Lihat Foto</Text>
                                </TouchableOpacity>
                              </View>
                            )}

                            {/* Tanggapan / Catatan Penolakan dari Personelia */}
                            {hasAdminNote && (
                              <View
                                style={[
                                  styles.historyAdminNoteBox,
                                  isRej ? { backgroundColor: '#fee2e2', borderColor: '#fca5a5' } : null
                                ]}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                  <MaterialIcons
                                    name={isRej ? 'error-outline' : 'chat'}
                                    size={15}
                                    color={isRej ? '#991b1b' : '#b45309'}
                                    style={{ marginRight: 5 }}
                                  />
                                  <Text
                                    style={[
                                      styles.historyAdminNoteTitle,
                                      isRej ? { color: '#991b1b' } : null
                                    ]}
                                  >
                                    {isRej ? 'Catatan Penolakan dari Personelia:' : 'Tanggapan Personelia:'}
                                  </Text>
                                </View>
                                <Text
                                  style={[
                                    styles.historyAdminNoteText,
                                    isRej ? { color: '#7f1d1d' } : null
                                  ]}
                                >
                                  {item.catatan_penolakan || item.catatan || item.admin_note}
                                </Text>

                                {/* Tanggal & Waktu Review (reviewed_at) */}
                                {Boolean(item.reviewed_at || (isApp || isRej ? item.updated_at : null)) && (
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      marginTop: 8,
                                      paddingTop: 6,
                                      borderTopWidth: 1,
                                      borderTopColor: isRej ? '#fca5a5' : '#fed7aa'
                                    }}
                                  >
                                    <MaterialIcons
                                      name="event-available"
                                      size={13}
                                      color={isRej ? '#991b1b' : '#b45309'}
                                      style={{ marginRight: 4 }}
                                    />
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: '600',
                                        color: isRej ? '#991b1b' : '#b45309'
                                      }}
                                    >
                                      Ditinjau pada: {formatDateTimeIndo(item.reviewed_at || item.updated_at)}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            )}

                            {/* Tombol Ajukan Ulang jika Ditolak 1 Kali */}
                            {isRej && (() => {
                              const statusInfo = getAttendanceSubmissionStatus(item.attendance_id);
                              if (statusInfo.rejectedCount === 1) {
                                return (
                                  <View style={{ marginTop: 12 }}>
                                    <TouchableOpacity
                                      style={styles.btnResubmitFromHistory}
                                      onPress={() => {
                                        setSelectedAttendanceId(item.attendance_id);
                                        setActiveTab('form');
                                      }}
                                      activeOpacity={0.8}
                                    >
                                      <MaterialIcons name="replay" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                                      <Text style={styles.btnResubmitFromHistoryText}>Ajukan Ulang Formulir (Perbaikan)</Text>
                                    </TouchableOpacity>
                                  </View>
                                );
                              } else {
                                return (
                                  <View style={[styles.lockedNoticeRow, { backgroundColor: '#fef2f2', borderColor: '#fecaca', marginTop: 10 }]}>
                                    <MaterialIcons name="lock" size={14} color="#b91c1c" style={{ marginRight: 6 }} />
                                    <Text style={[styles.lockedNoticeText, { color: '#b91c1c' }]}>
                                      Terkunci: Batas kesempatan pengajuan (2x) telah habis.
                                    </Text>
                                  </View>
                                );
                              }
                            })()}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>

      {/* POPUP MODAL LIHAT FOTO BUKTI (BUKAN BUKA LINK) */}
      <Modal
        visible={previewModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <MaterialIcons name="image" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                  {previewImageTitle}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseCircle}
                onPress={() => setPreviewModalVisible(false)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="close" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Modal Image Body */}
            <View style={styles.modalImageContainer}>
              {previewImageUrl ? (
                <Image
                  source={{ uri: previewImageUrl }}
                  style={styles.modalFullImage}
                  resizeMode="contain"
                />
              ) : null}
            </View>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPreviewModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCloseButtonText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2
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
  cardContentCol: {
    flex: 1
  },
  optionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  optionDateText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
    marginRight: 8
  },
  remainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12
  },
  remainingBadgeText: {
    fontSize: 10.5,
    fontWeight: '700'
  },
  optionDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2
  },
  lateDetailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3.5
  },
  lateDetailPillTime: {
    fontSize: 11.5,
    color: '#334155'
  },
  lateDetailDivider: {
    width: 1,
    height: 11,
    marginHorizontal: 6
  },
  lateDetailPillBadge: {
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13.5,
    color: '#0f172a',
    minHeight: 85,
    textAlignVertical: 'top'
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

  // DRAFT & FORM ACTION BUTTONS
  draftNoticeBanner: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16
  },
  draftNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  draftNoticeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  draftNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1'
  },
  btnDeleteDraftMini: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#fee2e2'
  },
  btnDeleteDraftMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ef4444'
  },
  draftNoticeDesc: {
    fontSize: 12,
    color: '#0369a1',
    lineHeight: 17
  },
  formActionButtonsContainer: {
    marginTop: 22
  },
  formActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  btnSaveDraft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 13,
    elevation: 1
  },
  btnSaveDraftText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0284c7'
  },
  btnSubmit: {
    flex: 1.2,
    backgroundColor: '#ea580c',
    borderRadius: 12,
    paddingVertical: 13.5,
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
    fontSize: 13.5,
    fontWeight: '700',
    color: '#ffffff'
  },
  submitHintContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 4
  },
  submitHintText: {
    flex: 1,
    fontSize: 11.5,
    color: '#64748b',
    lineHeight: 16
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

  // TAB 2: ACCORDION RIWAYAT
  historyListWrapper: {
    gap: 12
  },
  historyItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }
  },
  historyCardHeaderTouchable: {
    width: '100%'
  },
  historyHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  historyDateWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8
  },
  historyDateTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1e293b'
  },
  historyHeaderRightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statusBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  chevronBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chevronBoxActive: {
    backgroundColor: '#e0e7ff'
  },
  historyTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  historyTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6
  },
  historyTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  historyCreatedDate: {
    fontSize: 11,
    color: '#94a3b8'
  },

  // PREVIEW COLLAPSED
  historyCollapsedPreviewBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 9,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  historyCollapsedReasonText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17
  },
  // EXPANDED CONTENT
  historyExpandedContent: {
    marginTop: 6
  },
  historyDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginBottom: 10
  },
  historyFullStatusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10
  },
  historyFullStatusTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 2
  },
  historyFullStatusSubtitle: {
    fontSize: 11,
    opacity: 0.9,
    lineHeight: 15
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
  },
  historyThumbnail: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#cbd5e1'
  },
  historyFileSub: {
    fontSize: 10.5,
    color: '#64748b'
  },
  alreadySubmittedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16
  },
  alreadySubmittedTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 2
  },
  alreadySubmittedDesc: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
    fontStyle: 'italic',
    marginBottom: 6
  },
  btnViewInHistory: {
    alignSelf: 'flex-start',
    paddingVertical: 2
  },
  btnViewInHistoryText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.colors.primary
  },
  resubmitNoticeBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16
  },
  resubmitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  resubmitNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309'
  },
  resubmitNoticeDesc: {
    fontSize: 12,
    color: '#78350f',
    lineHeight: 17,
    marginBottom: 6
  },
  resubmitRejectNoteBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fef3c7',
    padding: 8,
    marginTop: 4
  },
  resubmitRejectNoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    marginBottom: 2
  },
  resubmitRejectNoteText: {
    fontSize: 12,
    color: '#991b1b',
    lineHeight: 16
  },
  historyDraftActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12
  },
  btnDraftActionEdit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingVertical: 9
  },
  btnDraftActionEditText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff'
  },
  btnDraftActionDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  btnDraftActionDeleteText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ef4444'
  },
  lockedNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#92400e',
    lineHeight: 16
  },
  btnResubmitFromHistory: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#b45309',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  btnResubmitFromHistoryText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalBox: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155'
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  modalHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff'
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalImageContainer: {
    width: '100%',
    height: 380,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalFullImage: {
    width: '100%',
    height: '100%'
  },
  modalFooter: {
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#334155'
  },
  modalCloseButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8
  },
  modalCloseButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  }
});
