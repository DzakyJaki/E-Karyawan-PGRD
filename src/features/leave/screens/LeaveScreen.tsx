import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useConfirm } from '../../../core/ConfirmContext';
import { theme } from '../../../core/theme';
import * as ToastContext from '../../../core/ToastContext';
import { suspendAppLock, resumeAppLock } from '../../../components/AppLock';

const SCREEN_WIDTH = Dimensions.get('window').width;

const MONTH_NAMES_INDONESIA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

interface LeaveBalance {
  id: number;
  leave_type: string;
  is_paid_leave: boolean;
  year: number;
  allocated: number;
  used: number;
  pending?: number;
  remaining: number;
}

interface LeaveItem {
  id: number;
  employee_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  attachment_url: string | null;
  status: string;
  approver_id: number | null;
  created_at: string;
  updated_at: string;
  leave_type?: {
    id: number;
    name: string;
    default_quota: number;
    is_paid_leave: boolean;
    is_carry_forward: boolean;
    requires_attachment: boolean;
  };
  approver?: {
    id: number;
    name: string;
  };
}

interface LeaveTypeMeta {
  id: number;
  name: string;
  is_paid_leave: boolean;
  default_quota: number;
  requires_attachment: boolean;
}

// -------------------------------------------------------------------
// ZoomableImage: pinch-to-zoom + pan menggunakan PanResponder native
// Bekerja di dalam Modal tanpa GestureHandlerRootView
// -------------------------------------------------------------------
function ZoomableImage({ uri, maxWidth }: { uri: string; maxWidth: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Animated values
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Mutable refs untuk tracking gesture state
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);
  const initialDistance = useRef(0);
  const isMultiTouch = useRef(false);

  const getDistance = (touches: { pageX: number; pageY: number }[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          isMultiTouch.current = true;
          initialDistance.current = getDistance([
            { pageX: touches[0].pageX, pageY: touches[0].pageY },
            { pageX: touches[1].pageX, pageY: touches[1].pageY },
          ]);
        } else {
          isMultiTouch.current = false;
        }
        // Stop any running animations
        scale.stopAnimation();
        translateX.stopAnimation();
        translateY.stopAnimation();
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          // Pinch zoom
          isMultiTouch.current = true;
          const currentDist = getDistance([
            { pageX: touches[0].pageX, pageY: touches[0].pageY },
            { pageX: touches[1].pageX, pageY: touches[1].pageY },
          ]);
          if (initialDistance.current > 0) {
            const ratio = currentDist / initialDistance.current;
            const newScale = Math.max(1, Math.min(lastScale.current * ratio, 5));
            scale.setValue(newScale);
          }
        } else if (!isMultiTouch.current && lastScale.current > 1) {
          // Pan hanya saat sudah di-zoom
          translateX.setValue(lastTranslateX.current + gestureState.dx);
          translateY.setValue(lastTranslateY.current + gestureState.dy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Simpan nilai akhir scale
        scale.stopAnimation((val) => { lastScale.current = val; });
        if (isMultiTouch.current) {
          // Setelah pinch, reset initialDistance
          initialDistance.current = 0;
          isMultiTouch.current = false;
          // Jika scale kecil banget, reset ke 1
          if (lastScale.current < 1.05) {
            lastScale.current = 1;
            lastTranslateX.current = 0;
            lastTranslateY.current = 0;
            Animated.parallel([
              Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
              Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
              Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
            ]).start();
          }
        } else {
          // Simpan posisi pan
          lastTranslateX.current += gestureState.dx;
          lastTranslateY.current += gestureState.dy;
        }
      },
    })
  ).current;

  // Reset saat URI berubah
  useEffect(() => {
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
  }, [uri, scale, translateX, translateY]);

  const imgHeight = maxWidth * 0.78;

  return (
    <View
      style={{ width: maxWidth, height: imgHeight, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
      {...panResponder.panHandlers}
    >
      {loading && !error && (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ position: 'absolute' }} />
      )}
      {error ? (
        <View style={{ alignItems: 'center', padding: 24 }}>
          <MaterialIcons name="broken-image" size={52} color="#9ca3af" />
          <Text style={{ color: '#9ca3af', marginTop: 10, textAlign: 'center', fontSize: 13 }}>
            Gagal memuat gambar
          </Text>
        </View>
      ) : (
        <Animated.Image
          source={{ uri }}
          style={[
            { width: maxWidth, height: imgHeight },
            { transform: [{ scale }, { translateX }, { translateY }] }
          ]}
          resizeMode="contain"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}
    </View>
  );
}

export function LeaveScreen() {
  const { showConfirm } = useConfirm();
  const { showToast } = ToastContext.useToast();

  const [activeTab, setActiveTab] = useState<'jenis' | 'riwayat'>('jenis');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Year State for Balance
  const currentYearNum = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYearNum.toString());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const availableYears = [
    (currentYearNum - 1).toString(),
    currentYearNum.toString(),
    (currentYearNum + 1).toString()
  ];

  // Leave Balances, Leaves List, and Leave Types Meta (requires_attachment)
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leavesList, setLeavesList] = useState<LeaveItem[]>([]);
  const [leaveTypesMeta, setLeaveTypesMeta] = useState<LeaveTypeMeta[]>([]);

  // Filter States
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all'); // 'all' or 'YYYY-MM'
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempStatusFilter, setTempStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [tempMonthFilter, setTempMonthFilter] = useState<string>('all');

  // Form Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedLeaveType, setSelectedLeaveType] = useState<LeaveBalance | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  
  const [startDate, setStartDate] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  
  const [endDate, setEndDate] = useState(new Date());
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const [reason, setReason] = useState('');
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentMime, setAttachmentMime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
    attachment?: string;
  }>({});

  // Modal Preview Lampiran (Gambar atau Dokumen PDF)
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewData, setPreviewData] = useState<{
    url: string;
    title: string;
    isPdf: boolean;
    fileName: string;
  } | null>(null);

  const formatToYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parts[0];
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return `${d} ${MONTH_NAMES_INDONESIA[m] || parts[1]} ${y}`;
    }
    return dateStr;
  };

  const calculateDaysBetween = (start: Date, end: Date) => {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const diffTime = e.getTime() - s.getTime();
    if (diffTime < 0) return 1;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // Fetch Balances
  const fetchLeaveBalance = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${apiUrl}/api/my/cuti/saldo?year=${selectedYear}`, {
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
        if (json && Array.isArray(json.balances)) {
          setLeaveBalances(json.balances);
          if (!selectedLeaveType && json.balances.length > 0) {
            setSelectedLeaveType(json.balances[0]);
          }
        }
      }
    } catch (error) {
      console.log('Error fetch saldo cuti:', error);
    }
  }, [selectedYear, selectedLeaveType]);

  // Fetch Leave Requests (Ambil semua status untuk keperluan kalkulasi saldo disetujui)
  const fetchLeaveRequests = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      let url = `${apiUrl}/api/my/cuti?status=all`;
      let response = await fetch(url, {
        headers: { 
          Authorization: `Bearer ${token}`, 
          Accept: 'application/json' 
        }
      });

      if (!response.ok) {
        response = await fetch(`${apiUrl}/api/my/cuti`, {
          headers: { 
            Authorization: `Bearer ${token}`, 
            Accept: 'application/json' 
          }
        });
      }

      if (response.status === 401) {
        await AsyncStorage.clear();
        router.replace('/login');
        return;
      }

      const contentType = response.headers.get('content-type');
      if (response.ok && contentType && contentType.includes('application/json')) {
        const json = await response.json();
        let list: LeaveItem[] = [];
        if (Array.isArray(json.data)) {
          list = json.data;
        } else if (json.data && Array.isArray(json.data.data)) {
          list = json.data.data;
        } else if (Array.isArray(json.leaves)) {
          list = json.leaves;
        } else if (Array.isArray(json)) {
          list = json;
        }
        setLeavesList(list);
      }
    } catch (error) {
      console.log('Error fetch histori cuti:', error);
    }
  }, []);

  // Hitung saldo cuti yang terpakai dan sisa kuota:
  // ATURAN: Kuota HANYA dipotong setelah cuti DISETUJUI (approved / disetujui).
  // Status pending / menunggu TIDAK memotong kuota cuti.
  const computedBalances = React.useMemo(() => {
    return leaveBalances.map((balance) => {
      // 1. Cuti yang sudah disetujui (memotong kuota)
      const approvedDaysForType = leavesList
        .filter((l) => {
          const s = (l.status || '').toLowerCase().trim();
          const isApproved = s === 'approved' || s === 'disetujui' || s === 'approve';
          const itemYear = l.start_date ? l.start_date.substring(0, 4) : '';
          const isMatchingYear = !itemYear || itemYear === selectedYear;
          
          // Pencocokan fleksibel: ID atau Nama Jenis Cuti
          const isMatchingType = 
            l.leave_type_id === balance.id || 
            l.leave_type?.id === balance.id ||
            (balance as any).leave_type_id === l.leave_type_id ||
            (balance as any).leave_type_id === l.leave_type?.id ||
            Boolean(
              l.leave_type?.name && 
              balance.leave_type && 
              l.leave_type.name.trim().toLowerCase() === balance.leave_type.trim().toLowerCase()
            );

          return isApproved && isMatchingYear && isMatchingType;
        })
        .reduce((sum, l) => {
          let days = 0;
          if (l.total_days != null && !isNaN(parseFloat(l.total_days as any))) {
            days = parseFloat(l.total_days as any);
          } else if (l.start_date && l.end_date) {
            const start = new Date(l.start_date).getTime();
            const end = new Date(l.end_date).getTime();
            if (!isNaN(start) && !isNaN(end) && end >= start) {
              days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
            }
          }
          return sum + days;
        }, 0);

      // 2. Cuti yang masih diajukan / menunggu (belum memotong kuota)
      const pendingDaysForType = leavesList
        .filter((l) => {
          const s = (l.status || '').toLowerCase().trim();
          const isPending = s === 'pending' || s === 'menunggu' || s === 'diajukan';
          const itemYear = l.start_date ? l.start_date.substring(0, 4) : '';
          const isMatchingYear = !itemYear || itemYear === selectedYear;
          
          const isMatchingType = 
            l.leave_type_id === balance.id || 
            l.leave_type?.id === balance.id ||
            (balance as any).leave_type_id === l.leave_type_id ||
            (balance as any).leave_type_id === l.leave_type?.id ||
            Boolean(
              l.leave_type?.name && 
              balance.leave_type && 
              l.leave_type.name.trim().toLowerCase() === balance.leave_type.trim().toLowerCase()
            );

          return isPending && isMatchingYear && isMatchingType;
        })
        .reduce((sum, l) => {
          let days = 0;
          if (l.total_days != null && !isNaN(parseFloat(l.total_days as any))) {
            days = parseFloat(l.total_days as any);
          } else if (l.start_date && l.end_date) {
            const start = new Date(l.start_date).getTime();
            const end = new Date(l.end_date).getTime();
            if (!isNaN(start) && !isNaN(end) && end >= start) {
              days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
            }
          }
          return sum + days;
        }, 0);

      // Kuota HANYA dipotong oleh cuti yang telah disetujui (approved)
      const effectiveUsed = approvedDaysForType;
      
      // Jika jenis cuti memiliki alokasi kuota (> 0), hitung sisa kuota = alokasi - terpakai disetujui
      const allocatedQuota = balance.allocated || 0;
      const effectiveRemaining = allocatedQuota > 0 
        ? Math.max(0, allocatedQuota - effectiveUsed)
        : 0;

      return {
        ...balance,
        allocated: allocatedQuota,
        used: effectiveUsed,
        pending: pendingDaysForType,
        remaining: effectiveRemaining
      };
    });
  }, [leaveBalances, leavesList, selectedYear]);

  // Fetch Jenis Cuti Meta (/api/my/cuti/jenis) untuk mengetahui requires_attachment
  const fetchLeaveTypes = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${apiUrl}/api/my/cuti/jenis`, {
        headers: { 
          Authorization: `Bearer ${token}`, 
          Accept: 'application/json' 
        }
      });

      if (response.ok) {
        const json = await response.json();
        if (json && Array.isArray(json.data)) {
          setLeaveTypesMeta(json.data);
        }
      }
    } catch (err) {
      console.log('Error fetch jenis cuti:', err);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchLeaveBalance(), fetchLeaveRequests(), fetchLeaveTypes()]);
    setIsLoading(false);
  }, [fetchLeaveBalance, fetchLeaveRequests, fetchLeaveTypes]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchLeaveBalance(), fetchLeaveRequests(), fetchLeaveTypes()]);
    setRefreshing(false);
  }, [fetchLeaveBalance, fetchLeaveRequests, fetchLeaveTypes]);

  // Helper untuk mengecek apakah suatu jenis cuti mewajibkan upload lampiran (requires_attachment === true)
  const checkRequiresAttachment = useCallback((type: LeaveBalance | null | undefined): boolean => {
    if (!type) return false;
    const isTruthy = (val: any) => val === true || val === 1 || val === '1' || val === 'true';

    // 1. Cek langsung pada objek type jika properti requires_attachment sudah tersedia
    if ((type as any).requires_attachment !== undefined) {
      return isTruthy((type as any).requires_attachment);
    }
    if ((type as any).leave_type?.requires_attachment !== undefined) {
      return isTruthy((type as any).leave_type?.requires_attachment);
    }

    // 2. Cek pada metadata leaveTypesMeta (/api/my/cuti/jenis)
    const meta = leaveTypesMeta.find(t => 
      t.id === type.id || 
      t.id === (type as any).leave_type_id ||
      (Boolean(t.name && type.leave_type) && 
       t.name.trim().toLowerCase() === type.leave_type.trim().toLowerCase())
    );
    return isTruthy(meta?.requires_attachment);
  }, [leaveTypesMeta]);

  // Cek apakah jenis cuti yang dipilih saat ini mewajibkan upload lampiran file
  const isAttachmentRequired = useMemo(() => {
    return checkRequiresAttachment(selectedLeaveType);
  }, [selectedLeaveType, checkRequiresAttachment]);

  // Month filter choices from actual data
  const getAvailableMonths = () => {
    const months = new Set<string>();
    leavesList.forEach(item => {
      if (item.start_date && item.start_date.length >= 7) {
        months.add(item.start_date.substring(0, 7));
      }
    });
    const currentY = new Date().getFullYear();
    const currentM = (new Date().getMonth() + 1).toString().padStart(2, '0');
    months.add(`${currentY}-${currentM}`);
    return Array.from(months).sort().reverse();
  };

  const getMonthFilterLabel = () => {
    if (selectedMonthFilter === 'all') return 'Semua Bulan';
    const [y, m] = selectedMonthFilter.split('-');
    const idx = parseInt(m, 10) - 1;
    return `${MONTH_NAMES_INDONESIA[idx] || m} ${y}`;
  };

  const getStatusFilterLabel = () => {
    switch (selectedStatusFilter) {
      case 'approved': return 'Disetujui';
      case 'pending': return 'Menunggu';
      case 'rejected': return 'Ditolak';
      default: return 'Semua Status';
    }
  };

  // Filtered leaves according to selected status and month
  const filteredLeaves = leavesList.filter(item => {
    if (selectedStatusFilter !== 'all') {
      const s = (item.status || '').toLowerCase();
      if (selectedStatusFilter === 'approved' && s !== 'approved' && s !== 'disetujui') return false;
      if (selectedStatusFilter === 'pending' && s !== 'pending' && s !== 'menunggu') return false;
      if (selectedStatusFilter === 'rejected' && s !== 'rejected' && s !== 'ditolak') return false;
    }
    if (selectedMonthFilter !== 'all') {
      const itemMonth = (item.start_date || '').substring(0, 7);
      if (itemMonth !== selectedMonthFilter) return false;
    }
    return true;
  });

  // Helper untuk Mendeteksi File PDF
  const isPdfFile = (urlOrName?: string | null): boolean => {
    if (!urlOrName) return false;
    const clean = urlOrName.split('?')[0].toLowerCase();
    return clean.endsWith('.pdf') || clean.includes('.pdf') || clean === 'application/pdf';
  };

  // Native XMLHttpRequest upload untuk multipart form data (menghindari bug fetch/WinterCG di React Native)
  const uploadLeaveMultipart = (
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
      // Biarkan native client React Native mengatur Content-Type dan boundary otomatis

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
          data: parsedData,
        });
      };

      xhr.onerror = () => {
        reject(new Error('Koneksi internet bermasalah atau server tidak dapat dihubungi'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Waktu pengiriman habis (timeout), periksa koneksi Anda'));
      };

      xhr.send(formData);
    });
  };

  // Helper untuk Membangun Full URL Lampiran Backend
  // File attachment disimpan di /storage/ di Laravel (public disk)
  const getFullAttachmentUrl = (url?: string | null): string => {
    if (!url) return '';
    // Sudah URL lengkap atau skema lokal (file://, content://, data:)
    if (
      url.startsWith('http://') || 
      url.startsWith('https://') || 
      url.startsWith('file://') || 
      url.startsWith('content://') ||
      url.startsWith('data:')
    ) {
      return url;
    }
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
    const cleanBase = apiUrl.replace(/\/+$/, '');
    // Tambahkan /storage/ prefix jika path belum mengandung /storage
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    const hasStorage = cleanPath.startsWith('/storage/');
    return `${cleanBase}${hasStorage ? cleanPath : `/storage${cleanPath}`}`;
  };

  // Buka URL Lampiran
  // PDF: Gunakan expo-web-browser (in-app Chrome Custom Tabs / SFSafari)
  // Gambar: Buka di browser eksternal biasa
  const openExternalUrl = async (url: string) => {
    try {
      const full = getFullAttachmentUrl(url);
      if (isPdfFile(full)) {
        // Buka PDF di in-app browser (tidak keluar dari aplikasi)
        await WebBrowser.openBrowserAsync(full, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          toolbarColor: theme.colors.primary,
          showTitle: true,
        });
      } else {
        // Buka gambar di browser eksternal
        const supported = await Linking.canOpenURL(full);
        if (supported) {
          await Linking.openURL(full);
        } else {
          await WebBrowser.openBrowserAsync(full);
        }
      }
    } catch {
      showToast({ title: 'Error', message: 'Gagal membuka file lampiran', type: 'error' });
    }
  };

  // Handler Buka Modal Show File (Preview Gambar / PDF)
  const handleShowAttachment = (rawUrl: string, title?: string) => {
    const fullUrl = getFullAttachmentUrl(rawUrl);
    const isPdf = isPdfFile(rawUrl);
    const fileName = rawUrl.split('/').pop()?.split('?')[0] || (isPdf ? 'dokumen.pdf' : 'lampiran.jpg');
    setPreviewData({
      url: fullUrl,
      title: title || (isPdf ? 'Dokumen Lampiran (PDF)' : 'Foto Lampiran'),
      isPdf,
      fileName
    });
    setPreviewModalVisible(true);
  };

  // Image & Document Picker Functions
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({
          title: 'Izin Galeri',
          message: 'Izin akses galeri dibutuhkan untuk memilih foto surat/dokumen.',
          type: 'warning'
        });
        return;
      }

      suspendAppLock();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAttachmentUri(result.assets[0].uri);
        setAttachmentName(result.assets[0].fileName || 'foto_lampiran.jpg');
        setAttachmentMime('image/jpeg');
        setFormErrors(prev => ({ ...prev, attachment: undefined }));
      }
    } catch {
      showToast({ title: 'Error', message: 'Gagal membuka galeri', type: 'error' });
    } finally {
      resumeAppLock(3000);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showToast({
          title: 'Izin Kamera',
          message: 'Izin akses kamera dibutuhkan untuk memotret surat/dokumen.',
          type: 'warning'
        });
        return;
      }

      suspendAppLock();
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAttachmentUri(result.assets[0].uri);
        setAttachmentName('foto_kamera.jpg');
        setAttachmentMime('image/jpeg');
        setFormErrors(prev => ({ ...prev, attachment: undefined }));
      }
    } catch {
      showToast({ title: 'Error', message: 'Gagal membuka kamera', type: 'error' });
    } finally {
      resumeAppLock(3000);
    }
  };

  // Pilih Dokumen PDF / Berkas
  const pickDocument = async () => {
    try {
      suspendAppLock();
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setAttachmentUri(file.uri);
        const name = file.name || (file.mimeType?.includes('pdf') ? 'dokumen.pdf' : 'lampiran.jpg');
        setAttachmentName(name);
        setAttachmentMime(file.mimeType || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'));
        setFormErrors(prev => ({ ...prev, attachment: undefined }));
      }
    } catch {
      showToast({ title: 'Error', message: 'Gagal memilih dokumen berkas', type: 'error' });
    } finally {
      resumeAppLock(3000);
    }
  };

  // Open Form for New Leave
  const openNewLeaveModal = () => {
    setEditingId(null);
    setReason('');
    setFormErrors({});
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
    if (computedBalances.length > 0) {
      setSelectedLeaveType(computedBalances[0]);
    }
    setAttachmentUri(null);
    setAttachmentName(null);
    setAttachmentMime(null);
    setModalVisible(true);
  };

  // Open Form for Edit Leave
  const handleEdit = (item: LeaveItem) => {
    setEditingId(item.id);
    setReason(item.reason || '');
    setFormErrors({});
    if (item.start_date) {
      const parts = item.start_date.split('-');
      if (parts.length === 3) {
        setStartDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
      }
    }
    if (item.end_date) {
      const parts = item.end_date.split('-');
      if (parts.length === 3) {
        setEndDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
      }
    }

    // Pencocokan fleksibel jenis cuti (ID saldo, leave_type_id, atau nama)
    const foundType = computedBalances.find(b => 
      b.id === item.leave_type_id ||
      (b as any).leave_type_id === item.leave_type_id ||
      (item.leave_type && b.id === item.leave_type.id) ||
      (item.leave_type && (b as any).leave_type_id === item.leave_type.id) ||
      (Boolean(item.leave_type?.name && b.leave_type) &&
       b.leave_type.trim().toLowerCase() === item.leave_type!.name.trim().toLowerCase())
    );

    if (foundType) {
      setSelectedLeaveType(foundType);
    } else if (item.leave_type) {
      setSelectedLeaveType({
        id: item.leave_type.id,
        leave_type: item.leave_type.name,
        is_paid_leave: item.leave_type.is_paid_leave,
        year: new Date().getFullYear(),
        allocated: item.leave_type.default_quota || 0,
        used: 0,
        remaining: 0,
        requires_attachment: item.leave_type.requires_attachment
      } as any);
    }

    // Ambil URL lampiran dari berbagai kemungkinan key backend
    const rawAttachment = item.attachment_url || (item as any).attachment || (item as any).file_url || null;
    if (rawAttachment) {
      const fullUrl = getFullAttachmentUrl(rawAttachment);
      setAttachmentUri(fullUrl);
      const fn = rawAttachment.split('/').pop()?.split('?')[0] || (isPdfFile(rawAttachment) ? 'dokumen.pdf' : 'lampiran.jpg');
      setAttachmentName(fn);
      setAttachmentMime(isPdfFile(fn) ? 'application/pdf' : 'image/jpeg');
    } else {
      setAttachmentUri(null);
      setAttachmentName(null);
      setAttachmentMime(null);
    }
    setModalVisible(true);
  };

  // Delete Leave
  const handleDelete = (id: number) => {
    showConfirm({
      title: 'Hapus Pengajuan Cuti',
      message: 'Apakah Anda yakin ingin menghapus pengajuan cuti ini?',
      confirmText: 'Hapus',
      cancelText: 'Batal',
      type: 'danger',
      onConfirm: async () => {
        try {
          const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
          const token = await AsyncStorage.getItem('userToken');
          const response = await fetch(`${apiUrl}/api/my/cuti/${id}`, {
            method: 'DELETE',
            headers: { 
              Authorization: `Bearer ${token}`, 
              Accept: 'application/json' 
            }
          });

          if (response.ok) {
            showToast({ title: 'Sukses', message: 'Pengajuan cuti berhasil dihapus', type: 'success' });
            fetchLeaveRequests();
            fetchLeaveBalance();
          } else {
            const errData = await response.json().catch(() => ({}));
            showToast({ title: 'Gagal', message: errData.message || 'Tidak dapat menghapus cuti ini', type: 'error' });
          }
        } catch {
          showToast({ title: 'Error', message: 'Gagal menghubungi server', type: 'error' });
        }
      }
    });
  };

  // Submit Leave (Create or Update) via Multipart Form Data
  const handleSubmit = async () => {
    const errors: {
      leaveType?: string;
      startDate?: string;
      endDate?: string;
      reason?: string;
      attachment?: string;
    } = {};

    if (!selectedLeaveType) {
      errors.leaveType = 'Silakan pilih jenis cuti terlebih dahulu';
    }

    if (!reason.trim()) {
      errors.reason = 'Alasan pengajuan cuti wajib diisi';
    } else if (reason.trim().length < 3) {
      errors.reason = 'Alasan cuti minimal 3 karakter';
    }

    if (endDate.getTime() < startDate.getTime()) {
      errors.endDate = 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai';
    }

    // Validasi Lampiran Jika Diwajibkan (misal Cuti Sakit)
    if (isAttachmentRequired && !attachmentUri) {
      errors.attachment = `Jenis cuti "${selectedLeaveType?.leave_type || 'ini'}" mewajibkan lampiran foto surat dokter/berkas!`;
    }

    if (Object.keys(errors).length > 0 || !selectedLeaveType) {
      setFormErrors(errors);
      showToast({ 
        title: 'Form Belum Lengkap', 
        message: 'Harap periksa kolom yang ditandai merah', 
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
      const targetTypeId = (selectedLeaveType as any).leave_type_id ?? selectedLeaveType.id;
      formData.append('leave_type_id', String(targetTypeId));
      formData.append('start_date', formatToYMD(startDate));
      formData.append('end_date', formatToYMD(endDate));
      formData.append('reason', reason.trim());

      // Kirim lampiran jika ada file lokal baru yang dipilih (file:// atau content://)
      const isLocalNewFile = attachmentUri && (attachmentUri.startsWith('file://') || attachmentUri.startsWith('content://'));
      if (attachmentUri && isLocalNewFile) {
        const fallbackName = attachmentUri.split('/').pop()?.split('?')[0] || 'lampiran.jpg';
        const rawName = attachmentName || fallbackName;
        const isPdf = isPdfFile(rawName) || isPdfFile(attachmentUri) || attachmentMime === 'application/pdf';

        let safeName = rawName;
        if (isPdf && !safeName.toLowerCase().endsWith('.pdf')) {
          safeName = `${safeName}.pdf`;
        } else if (!isPdf && !safeName.toLowerCase().match(/\.(jpg|jpeg|png)$/i)) {
          safeName = `${safeName}.jpg`;
        }

        let mimeType = attachmentMime;
        if (!mimeType) {
          if (isPdf) {
            mimeType = 'application/pdf';
          } else if (safeName.toLowerCase().endsWith('.png')) {
            mimeType = 'image/png';
          } else {
            mimeType = 'image/jpeg';
          }
        }

        const normalizedUri = Platform.OS === 'android' && !attachmentUri.startsWith('file://') && !attachmentUri.startsWith('content://')
          ? `file://${attachmentUri}`
          : attachmentUri;

        formData.append('attachment', {
          uri: normalizedUri,
          name: safeName,
          type: mimeType
        } as any);
      }

      let url = `${apiUrl}/api/my/cuti`;
      if (editingId) {
        url = `${apiUrl}/api/my/cuti/${editingId}`;
        formData.append('_method', 'PUT');
      }

      const res = await uploadLeaveMultipart(url, formData, token);

      if (res.ok) {
        showToast({ 
          title: 'Sukses', 
          message: editingId ? 'Pengajuan cuti berhasil diperbarui' : 'Pengajuan cuti berhasil dikirim', 
          type: 'success' 
        });
        setModalVisible(false);
        fetchLeaveRequests();
        fetchLeaveBalance();
      } else {
        const errorData = res.data || {};
        let errorMsg = errorData.message || 'Terjadi kesalahan saat memproses permohonan cuti';
        if (errorData.errors && typeof errorData.errors === 'object') {
          const detailList = Object.values(errorData.errors).flat().join('\n');
          if (detailList) {
            errorMsg = detailList;
          }
        }
        showToast({ 
          title: 'Gagal', 
          message: errorMsg, 
          type: 'error' 
        });
      }
    } catch (err: any) {
      showToast({ 
        title: 'Error', 
        message: err?.message ? `Gagal: ${err.message}` : 'Gagal menghubungi server', 
        type: 'error' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isPendingStatus = (status?: string) => {
    const s = (status || '').toLowerCase();
    return s === 'pending' || s === 'menunggu';
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s === 'disetujui') {
      return { bg: theme.colors.success, label: 'Disetujui' };
    }
    if (s === 'rejected' || s === 'ditolak') {
      return { bg: theme.colors.danger, label: 'Ditolak' };
    }
    return { bg: theme.colors.warning, label: 'Menunggu' };
  };

  const renderRightActions = (item: LeaveItem) => {
    if (!isPendingStatus(item.status)) return null;

    return (
      <View style={styles.swipeActionsContainer}>
        <View style={styles.swipeActionView}>
          <TouchableOpacity 
            style={[styles.swipeBtnSquare, { backgroundColor: theme.colors.warning }]} 
            onPress={() => handleEdit(item)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="edit" size={24} color="#fff" />
            <Text style={styles.swipeText}>Ubah</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.swipeBtnSquare, { backgroundColor: theme.colors.danger }]} 
            onPress={() => handleDelete(item.id)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="delete" size={24} color="#fff" />
            <Text style={styles.swipeText}>Hapus</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {isLoading && !refreshing && (
        <View style={styles.floatingLoadingOverlay}>
          <View style={styles.floatingLoadingCard}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.floatingLoadingText}>Memuat Data Cuti...</Text>
          </View>
        </View>
      )}

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ padding: theme.spacing.m }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
      >
        
        {/* RINGKASAN KUOTA CUTI (DASHBOARD) */}
        <View style={{ marginBottom: theme.spacing.m }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.colors.text }}>Ringkasan Kuota Cuti</Text>
            
            {/* YEAR FILTER BTN */}
            <TouchableOpacity 
              style={styles.yearBadgeBtn}
              onPress={() => setShowYearPicker(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.yearBadgeText}>TAHUN {selectedYear}</Text>
              <MaterialIcons name="arrow-drop-down" size={18} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {computedBalances.length === 0 ? (
            <View style={[styles.donutCard, { width: '100%', justifyContent: 'center', alignItems: 'center', paddingVertical: 36 }]}>
              <MaterialIcons name="event-note" size={40} color={theme.colors.textMuted} />
              <Text style={{ color: theme.colors.textMuted, marginTop: 8 }}>Belum ada kuota cuti pada tahun {selectedYear}</Text>
            </View>
          ) : (
            <View style={[styles.donutCard, { width: '100%' }]}>
              {(() => {
                // 1. Ambil alokasi kuota dari balances
                const quotaBalances = computedBalances.filter(item => (item.allocated || 0) > 0);
                const quotaAllocated = quotaBalances.reduce((sum, item) => sum + (item.allocated || 0), 0);
                const quotaUsed = quotaBalances.reduce((sum, item) => sum + (item.used || 0), 0);

                // 2. Tambahkan alokasi dari jenis cuti meta (/api/my/cuti/jenis) yang belum tercatat di balances tahun ini
                const metaExtraAllocated = leaveTypesMeta.reduce((sum, meta) => {
                  const inBalances = computedBalances.some(b => 
                    b.id === meta.id || 
                    (b as any).leave_type_id === meta.id || 
                    (b.leave_type && b.leave_type.trim().toLowerCase() === meta.name.trim().toLowerCase())
                  );
                  if (!inBalances && (meta.default_quota || 0) > 0) {
                    return sum + meta.default_quota;
                  }
                  return sum;
                }, 0);

                const totalAllocated = quotaAllocated + metaExtraAllocated;

                // 3. Hanya pengajuan cuti yang disetujui (approved) yang memotong kuota
                const approvedLeavesUsed = leavesList
                  .filter((l) => {
                    const s = (l.status || '').toLowerCase().trim();
                    const itemYear = l.start_date ? l.start_date.substring(0, 4) : '';
                    const isMatchingYear = !itemYear || itemYear === selectedYear;
                    return (s === 'approved' || s === 'disetujui' || s === 'approve') && isMatchingYear;
                  })
                  .reduce((sum, l) => {
                    let days = 0;
                    if (l.total_days != null && !isNaN(parseFloat(l.total_days as any))) {
                      days = parseFloat(l.total_days as any);
                    } else if (l.start_date && l.end_date) {
                      const start = new Date(l.start_date).getTime();
                      const end = new Date(l.end_date).getTime();
                      if (!isNaN(start) && !isNaN(end) && end >= start) {
                        days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
                      }
                    }
                    return sum + days;
                  }, 0);

                const pendingLeavesDays = leavesList
                  .filter((l) => {
                    const s = (l.status || '').toLowerCase().trim();
                    const itemYear = l.start_date ? l.start_date.substring(0, 4) : '';
                    const isMatchingYear = !itemYear || itemYear === selectedYear;
                    return (s === 'pending' || s === 'menunggu' || s === 'diajukan') && isMatchingYear;
                  })
                  .reduce((sum, l) => {
                    let days = 0;
                    if (l.total_days != null && !isNaN(parseFloat(l.total_days as any))) {
                      days = parseFloat(l.total_days as any);
                    } else if (l.start_date && l.end_date) {
                      const start = new Date(l.start_date).getTime();
                      const end = new Date(l.end_date).getTime();
                      if (!isNaN(start) && !isNaN(end) && end >= start) {
                        days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
                      }
                    }
                    return sum + days;
                  }, 0);

                // Ambil terpakai dari permohonan yang disetujui
                const totalUsed = Math.max(quotaUsed, approvedLeavesUsed);

                // Rumus: Sisa = Total Kuota - Terpakai Disetujui
                const totalRemaining = Math.max(0, totalAllocated - totalUsed);
                return (
                  <>
                    <Text style={styles.donutCardTitle}>Total Seluruh Kuota Cuti</Text>
                    
                    <View style={styles.donutChartContainer}>
                      <View style={styles.donutBackground} />
                      <View style={[styles.donutForeground, { borderColor: '#2563eb' }]} />
                      
                      <View style={styles.donutInnerContent}>
                        <Text style={[styles.donutNumber, { color: '#2563eb' }]}>{totalRemaining}</Text>
                        <Text style={styles.donutLabel}>Sisa Hari</Text>
                      </View>
                    </View>

                    <View style={styles.donutStatsContainer}>
                      <View style={styles.donutStatBox}>
                        <Text style={styles.donutStatLabel}>Terpakai (Disetujui)</Text>
                        <Text style={[styles.donutStatValue, { color: theme.colors.warning }]}>{totalUsed} Hari</Text>
                      </View>
                      <View style={styles.donutStatDivider} />
                      <View style={styles.donutStatBox}>
                        <Text style={styles.donutStatLabel}>Total Kuota</Text>
                        <Text style={styles.donutStatValue}>{totalAllocated} Hari</Text>
                      </View>
                    </View>

                    {pendingLeavesDays > 0 && (
                      <View style={styles.pendingNoticeBadge}>
                        <MaterialIcons name="schedule" size={13} color="#d97706" style={{ marginRight: 4 }} />
                        <Text style={styles.pendingNoticeText}>
                          {pendingLeavesDays} Hari Menunggu Persetujuan (Belum Memotong Kuota)
                        </Text>
                      </View>
                    )}

                    {/* WAKTU RESET CUTI */}
                    <View style={styles.resetInfoContainer}>
                      <MaterialIcons name="event-available" size={16} color="#92400e" style={{ marginRight: 6 }} />
                      <Text style={styles.resetInfoText}>
                        Reset kuota berikutnya: <Text style={{ fontWeight: 'bold' }}>31 Desember {selectedYear}</Text>
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>
          )}
        </View>

        {/* TOMBOL AJUKAN CUTI */}
        <TouchableOpacity style={styles.btnAjukan} onPress={openNewLeaveModal} activeOpacity={0.85}>
          <MaterialIcons name="add-circle" size={22} color="#fff" />
          <Text style={styles.btnAjukanText}>Ajukan Cuti Baru</Text>
        </TouchableOpacity>

        {/* TABS SWITCHER */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'jenis' && styles.activeTabButton]}
            onPress={() => setActiveTab('jenis')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'jenis' && styles.activeTabText]}>Jenis & Kuota</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'riwayat' && styles.activeTabButton]}
            onPress={() => setActiveTab('riwayat')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'riwayat' && styles.activeTabText]}>
              Riwayat Pengajuan ({leavesList.length})
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* TAB 1: JENIS & KUOTA CUTI */}
        {activeTab === 'jenis' && (
          <View style={styles.tabContentCard}>
            {computedBalances.length === 0 ? (
               <Text style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.textMuted }}>
                 Belum ada rincian jenis cuti
               </Text>
            ) : (
              computedBalances.map((item, idx) => (
                <View 
                  key={item.id || idx} 
                  style={[
                    styles.otherLeaveRow, 
                    idx !== computedBalances.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                    <View style={[styles.otherLeaveDot, !item.is_paid_leave && { backgroundColor: theme.colors.warning }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.otherLeaveName}>{item.leave_type}</Text>
                      <Text style={styles.otherLeaveUnit}>
                        Alokasi: {item.allocated} Hari {!item.is_paid_leave ? '(Unpaid)' : '(Paid)'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.otherLeaveRemaining}>{item.remaining} Sisa</Text>
                    <Text style={[styles.otherLeaveUnit, { color: theme.colors.warning }]}>{item.used} Terpakai</Text>
                    {Boolean(item.pending && item.pending > 0) && (
                      <Text style={{ fontSize: 10, color: '#d97706', marginTop: 2, fontWeight: '600' }}>
                        {item.pending} Menunggu
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 2: RIWAYAT CUTI */}
        {activeTab === 'riwayat' && (
          <View>
            {/* HEADER FILTER */}
            <View style={styles.historyHeaderCard}>
              <View>
                <Text style={styles.historyTitle}>Riwayat Cuti</Text>
                {(selectedMonthFilter !== 'all' || selectedStatusFilter !== 'all') && (
                  <Text style={{ fontSize: 12, color: theme.colors.primary, marginTop: 2, fontWeight: '600' }}>
                    {getMonthFilterLabel()} • {getStatusFilterLabel()}
                  </Text>
                )}
              </View>

              <TouchableOpacity 
                style={[
                  styles.filterBtn, 
                  (selectedMonthFilter !== 'all' || selectedStatusFilter !== 'all') && { backgroundColor: theme.colors.primary }
                ]}
                onPress={() => {
                  setTempStatusFilter(selectedStatusFilter);
                  setTempMonthFilter(selectedMonthFilter);
                  setShowFilterModal(true);
                }}
                activeOpacity={0.8}
              >
                <MaterialIcons 
                  name="tune" 
                  size={18} 
                  color={(selectedMonthFilter !== 'all' || selectedStatusFilter !== 'all') ? '#fff' : theme.colors.primary} 
                />
                <Text 
                  style={[
                    styles.filterText, 
                    (selectedMonthFilter !== 'all' || selectedStatusFilter !== 'all') && { color: '#fff' }
                  ]}
                >
                  Filter
                </Text>
              </TouchableOpacity>
            </View>

            {/* LIST CUTI */}
            <View style={styles.listContainer}>
              {filteredLeaves.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <MaterialIcons name="event-busy" size={44} color={theme.colors.textMuted} />
                  <Text style={styles.emptyText}>Tidak ada riwayat cuti pada filter ini</Text>
                </View>
              ) : (
                filteredLeaves.map((item, index) => {
                  const statusInfo = getStatusBadge(item.status);
                  const startParts = (item.start_date || '').split('-');
                  const day = startParts[2] || '--';
                  const monthIdx = parseInt(startParts[1] || '1', 10) - 1;
                  const monthName = MONTH_NAMES_INDONESIA[monthIdx] || '---';

                  const dateRangeText = item.start_date === item.end_date
                    ? formatDateIndo(item.start_date)
                    : `${formatDateIndo(item.start_date)} - ${formatDateIndo(item.end_date)}`;

                  return (
                    <Swipeable 
                      key={item.id} 
                      renderRightActions={() => renderRightActions(item)}
                    >
                      <View 
                        style={[
                          styles.listItem, 
                          index === filteredLeaves.length - 1 && { borderBottomWidth: 0 }
                        ]}
                      >
                        <View style={styles.dateBadge}>
                          <Text style={styles.dateBadgeDay}>{day}</Text>
                          <Text style={styles.dateBadgeMonth}>{monthName.substring(0, 3)}</Text>
                        </View>

                        <View style={{ flex: 1, paddingRight: theme.spacing.s }}>
                          <Text style={styles.historyType}>
                            {item.leave_type?.name || 'Cuti'}
                          </Text>

                          <Text style={styles.historyDateFull}>
                            {dateRangeText}{' '}
                            <Text style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                              ({item.total_days} Hari)
                            </Text>
                          </Text>

                          <Text style={styles.historyReason} numberOfLines={2}>
                            "{item.reason || 'Tidak ada alasan'}"
                          </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                              <Text style={styles.statusText}>{statusInfo.label}</Text>
                            </View>
                            {item.attachment_url && (
                              <TouchableOpacity 
                                style={[
                                  styles.hasAttachmentBadge,
                                  isPdfFile(item.attachment_url) && styles.hasAttachmentBadgePdf
                                ]}
                                onPress={() => handleShowAttachment(item.attachment_url!, item.leave_type?.name)}
                                activeOpacity={0.7}
                              >
                                <MaterialIcons 
                                  name={isPdfFile(item.attachment_url) ? "picture-as-pdf" : "image"} 
                                  size={13} 
                                  color={isPdfFile(item.attachment_url) ? "#dc2626" : theme.colors.primary} 
                                />
                                <Text style={[
                                  styles.hasAttachmentText,
                                  isPdfFile(item.attachment_url) && { color: "#dc2626" }
                                ]}>
                                  {isPdfFile(item.attachment_url) ? 'Lihat PDF' : 'Lihat Foto'}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    </Swipeable>
                  );
                })
              )}
            </View>
          </View>
        )}
        
      </ScrollView>

      {/* FILTER POPUP MODAL */}
      <Modal visible={showFilterModal} animationType="fade" transparent={true}>
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowFilterModal(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[styles.modalContent, { maxHeight: '75%' }]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialIcons name="tune" size={22} color={theme.colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Filter Riwayat Cuti</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Section 1: Status */}
              <Text style={styles.unifiedSectionTitle}>Status Pengajuan</Text>
              <View style={styles.chipGrid}>
                {[
                  { id: 'all', label: 'Semua Status' },
                  { id: 'pending', label: 'Menunggu' },
                  { id: 'approved', label: 'Disetujui' },
                  { id: 'rejected', label: 'Ditolak' }
                ].map((s) => {
                  const isSelected = tempStatusFilter === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.chipItem, isSelected && styles.chipItemActive]}
                      onPress={() => setTempStatusFilter(s.id as any)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Section 2: Bulan */}
              <Text style={[styles.unifiedSectionTitle, { marginTop: 18 }]}>Periode Bulan</Text>
              <View style={styles.chipGrid}>
                <TouchableOpacity
                  style={[styles.chipItem, tempMonthFilter === 'all' && styles.chipItemActive]}
                  onPress={() => setTempMonthFilter('all')}
                >
                  <Text style={[styles.chipText, tempMonthFilter === 'all' && styles.chipTextActive]}>
                    Semua Bulan
                  </Text>
                </TouchableOpacity>

                {getAvailableMonths().map((m) => {
                  const [y, monthNum] = m.split('-');
                  const label = `${MONTH_NAMES_INDONESIA[parseInt(monthNum, 10) - 1] || monthNum} ${y}`;
                  const isSelected = tempMonthFilter === m;

                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chipItem, isSelected && styles.chipItemActive]}
                      onPress={() => setTempMonthFilter(m)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.unifiedFilterFooter}>
              <TouchableOpacity
                style={styles.btnResetFilter}
                onPress={() => {
                  setTempStatusFilter('all');
                  setTempMonthFilter('all');
                  setSelectedStatusFilter('all');
                  setSelectedMonthFilter('all');
                  setShowFilterModal(false);
                }}
              >
                <Text style={styles.btnResetFilterText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnApplyFilter}
                onPress={() => {
                  setSelectedStatusFilter(tempStatusFilter);
                  setSelectedMonthFilter(tempMonthFilter);
                  setShowFilterModal(false);
                }}
              >
                <Text style={styles.btnApplyFilterText}>Terapkan Filter</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* FORM MODAL (AJUKAN / UBAH CUTI) */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Ubah Pengajuan Cuti' : 'Form Pengajuan Cuti'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Jenis Cuti Dropdown */}
              <View style={{ marginBottom: theme.spacing.m }}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Jenis Cuti</Text>
                  <Text style={styles.requiredBadge}>*Wajib</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.inputBox, { marginBottom: 4 }, formErrors.leaveType && styles.inputBoxError]} 
                  onPress={() => {
                    setShowTypePicker(true);
                    if (formErrors.leaveType) setFormErrors(prev => ({ ...prev, leaveType: undefined }));
                  }}
                  activeOpacity={0.8}
                >
                  {(() => {
                    const activeType = selectedLeaveType 
                      ? computedBalances.find(b => b.id === selectedLeaveType.id) || selectedLeaveType 
                      : null;
                    return (
                      <View>
                        <Text style={styles.inputText}>
                          {activeType ? activeType.leave_type : 'Pilih jenis cuti...'}
                        </Text>
                        {activeType && (
                          <Text style={{ fontSize: 11, color: theme.colors.primary, marginTop: 2 }}>
                            Sisa kuota: {activeType.remaining} Hari
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                  <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textMuted} />
                </TouchableOpacity>
                {formErrors.leaveType ? (
                  <View style={styles.inlineErrorRow}>
                    <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
                    <Text style={styles.inlineErrorText}>{formErrors.leaveType}</Text>
                  </View>
                ) : null}
              </View>

              {/* Tanggal Mulai & Tanggal Selesai */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.m }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Tanggal Mulai</Text>
                    <Text style={styles.requiredBadge}>*Wajib</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.inputBox, { marginBottom: 4 }, formErrors.startDate && styles.inputBoxError]} 
                    onPress={() => setShowStartDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.inputText, { fontSize: 13 }]}>
                      {`${startDate.getDate()} ${MONTH_NAMES_INDONESIA[startDate.getMonth()]} ${startDate.getFullYear()}`}
                    </Text>
                    <MaterialIcons name="calendar-today" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {formErrors.startDate ? (
                    <View style={styles.inlineErrorRow}>
                      <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
                      <Text style={styles.inlineErrorText}>{formErrors.startDate}</Text>
                    </View>
                  ) : null}
                  {showStartDatePicker && (
                    <DateTimePicker
                      value={startDate}
                      mode="date"
                      display="default"
                      onValueChange={(_: DateTimePickerChangeEvent, d: Date) => {
                        setShowStartDatePicker(false);
                        if (d) {
                          setStartDate(d);
                          setFormErrors(prev => ({ ...prev, startDate: undefined, endDate: undefined }));
                          if (endDate.getTime() < d.getTime()) {
                            setEndDate(d);
                          }
                        }
                      }}
                      onDismiss={() => setShowStartDatePicker(false)}
                    />
                  )}
                </View>

                <View style={{ flex: 1, marginLeft: 8 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Tanggal Selesai</Text>
                    <Text style={styles.requiredBadge}>*Wajib</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.inputBox, { marginBottom: 4 }, formErrors.endDate && styles.inputBoxError]} 
                    onPress={() => setShowEndDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.inputText, { fontSize: 13 }]}>
                      {`${endDate.getDate()} ${MONTH_NAMES_INDONESIA[endDate.getMonth()]} ${endDate.getFullYear()}`}
                    </Text>
                    <MaterialIcons name="calendar-today" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {formErrors.endDate ? (
                    <View style={styles.inlineErrorRow}>
                      <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
                      <Text style={styles.inlineErrorText}>{formErrors.endDate}</Text>
                    </View>
                  ) : null}
                  {showEndDatePicker && (
                    <DateTimePicker
                      value={endDate}
                      mode="date"
                      display="default"
                      minimumDate={startDate}
                      onValueChange={(_: DateTimePickerChangeEvent, d: Date) => {
                        setShowEndDatePicker(false);
                        if (d) {
                          setEndDate(d);
                          setFormErrors(prev => ({ ...prev, endDate: undefined }));
                        }
                      }}
                      onDismiss={() => setShowEndDatePicker(false)}
                    />
                  )}
                </View>
              </View>

              {/* Perhitungan Total Hari */}
              <View style={styles.durationInfoBox}>
                <MaterialIcons name="date-range" size={20} color={theme.colors.primary} />
                <Text style={styles.durationInfoText}>
                  Durasi Cuti:{' '}
                  <Text style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                    {calculateDaysBetween(startDate, endDate)} Hari
                  </Text>
                </Text>
              </View>
              
              {/* Alasan Cuti */}
              <View style={{ marginBottom: theme.spacing.m }}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Alasan Cuti</Text>
                  <Text style={styles.requiredBadge}>*Wajib</Text>
                </View>
                <TextInput 
                  style={[
                    styles.inputBox, 
                    { height: 85, textAlignVertical: 'top', marginBottom: 4 },
                    formErrors.reason && styles.inputBoxError
                  ]} 
                  placeholder="Contoh: Keperluan keluarga..." 
                  multiline 
                  value={reason}
                  onChangeText={(text) => {
                    setReason(text);
                    if (formErrors.reason) setFormErrors(prev => ({ ...prev, reason: undefined }));
                  }}
                />
                {formErrors.reason ? (
                  <View style={styles.inlineErrorRow}>
                    <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
                    <Text style={styles.inlineErrorText}>{formErrors.reason}</Text>
                  </View>
                ) : null}
              </View>

              {/* Upload Foto / Dokumen PDF Lampiran (Tampil jika requires_attachment === true ATAU sudah ada lampiran saat diedit) */}
              {(isAttachmentRequired || Boolean(attachmentUri)) && (
                <View style={[{ marginBottom: theme.spacing.m }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Dokumen / Foto Lampiran</Text>
                    {isAttachmentRequired ? (
                      <Text style={styles.requiredBadge}>*Wajib</Text>
                    ) : (
                      <Text style={styles.optionalBadge}>(Opsional)</Text>
                    )}
                  </View>

                  <View style={[styles.attachmentSection, formErrors.attachment && styles.attachmentSectionError]}>
                    {attachmentUri ? (
                      <View style={styles.attachmentPreviewContainer}>
                        {isPdfFile(attachmentName || attachmentUri) || attachmentMime === 'application/pdf' ? (
                          /* Preview Dokumen PDF Terpilih */
                          <View style={styles.pdfSelectedCard}>
                            <View style={styles.pdfSelectedIconBox}>
                              <MaterialIcons name="picture-as-pdf" size={28} color="#ef4444" />
                            </View>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={styles.pdfSelectedName} numberOfLines={1}>
                                {attachmentName || 'Dokumen_Lampiran.pdf'}
                              </Text>
                              <Text style={styles.pdfSelectedType}>Dokumen PDF</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.btnQuickPreview}
                              onPress={() => handleShowAttachment(attachmentUri, 'Preview Dokumen PDF')}
                              activeOpacity={0.7}
                            >
                              <MaterialIcons name="visibility" size={16} color={theme.colors.primary} />
                              <Text style={styles.btnQuickPreviewText}>Lihat</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          /* Preview Foto Terpilih */
                          <TouchableOpacity 
                            style={styles.imagePreviewWrapper}
                            onPress={() => handleShowAttachment(attachmentUri, 'Preview Foto Lampiran')}
                            activeOpacity={0.85}
                          >
                            <Image 
                              source={{ uri: getFullAttachmentUrl(attachmentUri) }} 
                              style={styles.attachmentPreviewImage} 
                              resizeMode="cover" 
                            />
                            <View style={styles.imagePreviewOverlayBadge}>
                              <MaterialIcons name="zoom-in" size={16} color="#fff" />
                              <Text style={styles.imagePreviewOverlayText}>Perbesar</Text>
                            </View>
                          </TouchableOpacity>
                        )}

                        {/* Tombol Ganti & Hapus */}
                        <View style={styles.attachmentActions}>
                          <TouchableOpacity style={styles.btnChangeAttachment} onPress={pickDocument} activeOpacity={0.8}>
                            <MaterialIcons name="description" size={15} color={theme.colors.primary} />
                            <Text style={styles.btnChangeAttachmentText}>Ganti PDF</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.btnChangeAttachment} onPress={pickImage} activeOpacity={0.8}>
                            <MaterialIcons name="photo-library" size={15} color={theme.colors.primary} />
                            <Text style={styles.btnChangeAttachmentText}>Ganti Foto</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.btnRemoveAttachment} 
                            onPress={() => {
                              setAttachmentUri(null);
                              setAttachmentName(null);
                              setAttachmentMime(null);
                            }} 
                            activeOpacity={0.8}
                          >
                            <MaterialIcons name="delete" size={15} color={theme.colors.danger} />
                            <Text style={styles.btnRemoveAttachmentText}>Hapus</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      /* Pilihan Sumber File: Galeri, Kamera, Dokumen PDF */
                      <View style={styles.attachmentPickerRow}>
                        <TouchableOpacity style={styles.attachmentPickerBtn} onPress={pickImage} activeOpacity={0.8}>
                          <MaterialIcons name="photo-library" size={20} color={theme.colors.primary} />
                          <Text style={styles.attachmentPickerBtnText}>Galeri</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.attachmentPickerBtn} onPress={takePhoto} activeOpacity={0.8}>
                          <MaterialIcons name="photo-camera" size={20} color={theme.colors.primary} />
                          <Text style={styles.attachmentPickerBtnText}>Kamera</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.attachmentPickerBtn, { borderColor: '#fca5a5', backgroundColor: '#fef2f2' }]} 
                          onPress={pickDocument} 
                          activeOpacity={0.8}
                        >
                          <MaterialIcons name="picture-as-pdf" size={20} color="#dc2626" />
                          <Text style={[styles.attachmentPickerBtnText, { color: '#dc2626' }]}>PDF</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  {formErrors.attachment ? (
                    <View style={styles.inlineErrorRow}>
                      <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
                      <Text style={styles.inlineErrorText}>{formErrors.attachment}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              
              {/* Tombol Simpan */}
              <TouchableOpacity 
                style={[styles.btnSubmit, submitting && { opacity: 0.7 }]} 
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnSubmitText}>
                    {editingId ? 'Simpan Perubahan' : 'Kirim Pengajuan'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* TYPE PICKER MODAL */}
      <Modal visible={showTypePicker} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pilih Jenis Cuti</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {computedBalances.map((type) => (
                <TouchableOpacity 
                  key={type.id} 
                  style={[styles.typeOption, selectedLeaveType?.id === type.id && styles.typeOptionSelected]}
                  onPress={() => {
                    setSelectedLeaveType(type);
                    setFormErrors(prev => ({ ...prev, leaveType: undefined, attachment: undefined }));
                    if (!checkRequiresAttachment(type)) {
                      setAttachmentUri(null);
                      setAttachmentName(null);
                      setAttachmentMime(null);
                    }
                    setShowTypePicker(false);
                  }}
                >
                  <View>
                    <Text style={[styles.typeOptionText, selectedLeaveType?.id === type.id && { color: theme.colors.primary, fontWeight: 'bold' }]}>
                      {type.leave_type}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
                      Sisa: {type.remaining} Hari • Alokasi: {type.allocated} Hari {!type.is_paid_leave ? '(Unpaid)' : '(Paid)'}
                      {checkRequiresAttachment(type) ? ' • 📎 Wajib Lampiran' : ''}
                    </Text>
                  </View>
                  {selectedLeaveType?.id === type.id && (
                    <MaterialIcons name="check-circle" size={24} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* YEAR PICKER MODAL */}
      <Modal visible={showYearPicker} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '45%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pilih Tahun Kuota Cuti</Text>
              <TouchableOpacity onPress={() => setShowYearPicker(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingBottom: 20 }}>
              {availableYears.map((year) => (
                <TouchableOpacity 
                  key={year} 
                  style={[styles.typeOption, selectedYear === year && styles.typeOptionSelected]}
                  onPress={() => {
                    setSelectedYear(year);
                    setShowYearPicker(false);
                  }}
                >
                  <Text style={[styles.typeOptionText, selectedYear === year && { color: theme.colors.primary, fontWeight: 'bold' }]}>
                    Tahun {year}
                  </Text>
                  {selectedYear === year && (
                    <MaterialIcons name="check-circle" size={24} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL PREVIEW FILE LAMPIRAN (GAMBAR & PDF) */}
      <Modal 
        visible={previewModalVisible} 
        animationType="slide" 
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        {/* Full-screen dark viewer */}
        <View style={styles.previewModalOverlay}>

          {/* Header transparan di atas */}
          <View style={styles.previewModalHeader}>
            <TouchableOpacity
              style={styles.previewModalCloseBtn}
              onPress={() => setPreviewModalVisible(false)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.previewModalTitle} numberOfLines={1}>
                {previewData?.title || 'Lampiran File'}
              </Text>
              <Text style={styles.previewModalSubtitle} numberOfLines={1}>
                {previewData?.fileName || ''}
              </Text>
            </View>
            <MaterialIcons 
              name={previewData?.isPdf ? "picture-as-pdf" : "image"} 
              size={22} 
              color={previewData?.isPdf ? "#f87171" : "#93c5fd"} 
            />
          </View>

          {/* Body: gambar atau PDF info */}
          <View style={styles.previewModalBody}>
            {previewData?.isPdf ? (
              /* PDF — card info + tombol buka */
              <View style={styles.pdfPreviewCard}>
                <View style={styles.pdfIconCircle}>
                  <MaterialIcons name="picture-as-pdf" size={64} color="#ef4444" />
                </View>
                <Text style={styles.pdfFileNameText} numberOfLines={2}>
                  {previewData.fileName}
                </Text>
                <Text style={styles.pdfFileNoticeText}>
                  File PDF akan dibuka menggunakan browser bawaan. Anda tetap berada di dalam aplikasi.
                </Text>
                <TouchableOpacity 
                  style={styles.btnOpenPdf}
                  onPress={() => previewData?.url && openExternalUrl(previewData.url)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="picture-as-pdf" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.btnOpenPdfText}>Buka & Tampilkan PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.btnOpenPdfSecondary}
                  onPress={() => previewData?.url && Linking.openURL(getFullAttachmentUrl(previewData.url))}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="download" size={20} color="#60a5fa" style={{ marginRight: 8 }} />
                  <Text style={styles.btnOpenPdfSecondaryText}>Unduh / Buka di Aplikasi PDF</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Gambar — full-screen dengan pinch-to-zoom & pan */
              <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                <ZoomableImage
                  uri={previewData?.url ?? ''}
                  maxWidth={SCREEN_WIDTH}
                />
                <View style={styles.zoomHintRow}>
                  <MaterialIcons name="zoom-in" size={13} color="rgba(255,255,255,0.6)" style={{ marginRight: 4 }} />
                  <Text style={styles.zoomHintText}>Cubit untuk zoom • Seret untuk geser</Text>
                </View>
              </View>
            )}
          </View>

          {/* Footer aksi */}
          <View style={styles.previewModalFooter}>
            {!previewData?.isPdf && (
              <TouchableOpacity
                style={styles.btnOpenExternalImage}
                onPress={() => previewData?.url && openExternalUrl(previewData.url)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="open-in-new" size={16} color="#93c5fd" style={{ marginRight: 6 }} />
                <Text style={styles.btnOpenExternalImageText}>Buka di Browser</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={styles.btnClosePreview}
              onPress={() => setPreviewModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnClosePreviewText}>Tutup</Text>
            </TouchableOpacity>
          </View>

        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  floatingLoadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999
  },
  floatingLoadingCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: theme.radius.l,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 }
  },
  floatingLoadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.primary
  },

  yearBadgeBtn: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center'
  },
  yearBadgeText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 13,
    marginRight: 4
  },
  
  donutCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  donutCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 20,
    textAlign: 'center'
  },
  donutChartContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  donutBackground: {
    position: 'absolute',
    width: 120, height: 120,
    borderRadius: 60,
    borderWidth: 12,
    borderColor: '#f1f5f9'
  },
  donutForeground: {
    position: 'absolute',
    width: 120, height: 120,
    borderRadius: 60,
    borderWidth: 12,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-45deg' }]
  },
  donutInnerContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center'
  },
  donutNumber: { fontSize: 32, fontWeight: '900' },
  donutLabel: { fontSize: 12, color: theme.colors.textMuted, fontWeight: 'bold' },
  
  donutStatsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16
  },
  donutStatBox: { alignItems: 'center' },
  donutStatLabel: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 2, fontWeight: '600' },
  donutStatValue: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  donutStatDivider: { width: 1, height: 20, backgroundColor: '#e2e8f0' },

  resetInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffbeb',
    width: '100%',
    paddingVertical: 10,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fef3c7'
  },
  resetInfoText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500'
  },

  otherLeaveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  otherLeaveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    marginRight: 12
  },
  otherLeaveName: {
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: 'bold'
  },
  otherLeaveRemaining: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  otherLeaveUnit: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2
  },

  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: 4,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 5
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 26,
  },
  activeTabButton: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textMuted,
  },
  activeTabText: {
    color: '#fff',
  },
  
  btnAjukan: { 
    backgroundColor: theme.colors.primaryLight, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: theme.spacing.m, 
    borderRadius: theme.radius.m, 
    marginVertical: theme.spacing.m,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  btnAjukanText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: theme.spacing.s },
  
  tabContentCard: {
    backgroundColor: theme.colors.card, 
    borderRadius: theme.radius.m, 
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    overflow: 'hidden', 
    marginBottom: theme.spacing.l 
  },
  
  historyHeaderCard: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 12,
    paddingHorizontal: 4
  },
  historyTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  filterBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#E0E7FF', 
    paddingHorizontal: 12, 
    paddingVertical: 7, 
    borderRadius: 20 
  },
  filterText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 13, marginLeft: 4 },
  
  listContainer: { 
    backgroundColor: theme.colors.card, 
    borderRadius: theme.radius.m, 
    elevation: 2, 
    overflow: 'hidden', 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 5,
    marginBottom: theme.spacing.l
  },
  listItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: theme.spacing.m, 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9', 
    backgroundColor: theme.colors.card 
  },
  emptyText: {
    color: theme.colors.textMuted,
    marginTop: 10,
    fontSize: 14
  },
  
  dateBadge: { 
    backgroundColor: '#f1f5f9', 
    padding: 8, 
    borderRadius: 10, 
    alignItems: 'center', 
    minWidth: 48, 
    marginRight: theme.spacing.m 
  },
  dateBadgeDay: { fontSize: 17, fontWeight: 'bold', color: theme.colors.primary },
  dateBadgeMonth: { fontSize: 10, color: theme.colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' },

  historyType: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  historyDateFull: { color: theme.colors.textMuted, fontSize: 12, marginTop: 3 },
  historyReason: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4, fontStyle: 'italic' },

  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: theme.radius.round },
  statusText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  
  swipeActionsContainer: { width: 140, flexDirection: 'row', paddingLeft: 8 },
  swipeActionView: { flexDirection: 'row', flex: 1, borderRadius: theme.radius.m, overflow: 'hidden' },
  swipeBtnSquare: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  swipeText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginTop: 4 },

  durationInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: theme.radius.s,
    marginBottom: theme.spacing.m
  },
  durationInfoText: {
    marginLeft: 8,
    fontSize: 13,
    color: theme.colors.text
  },
  
  typeOption: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: theme.spacing.m, 
    borderBottomWidth: 1, 
    borderColor: '#f1f5f9' 
  },
  typeOptionSelected: { backgroundColor: '#E0E7FF' },
  typeOptionText: { fontSize: 15, color: theme.colors.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: theme.spacing.l },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.l },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  label: { fontSize: 13, fontWeight: 'bold', color: theme.colors.text, marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  requiredBadge: { color: theme.colors.danger, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  optionalBadge: { color: theme.colors.textMuted, fontSize: 12, marginLeft: 6 },
  inputBox: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: theme.colors.border, 
    borderRadius: theme.radius.s, 
    padding: theme.spacing.m, 
    marginBottom: theme.spacing.m,
    backgroundColor: '#fff'
  },
  inputBoxError: {
    borderColor: theme.colors.danger,
    borderWidth: 1.5,
    backgroundColor: '#fff5f5'
  },
  attachmentSectionError: {
    borderColor: theme.colors.danger,
    borderWidth: 1.5,
    backgroundColor: '#fff5f5'
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 12,
    paddingHorizontal: 2
  },
  inlineErrorText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
    flex: 1
  },
  inputText: { color: theme.colors.text, fontSize: 14 },
  btnSubmit: { 
    backgroundColor: theme.colors.primary, 
    padding: theme.spacing.m, 
    borderRadius: theme.radius.m, 
    alignItems: 'center', 
    marginTop: theme.spacing.s,
    marginBottom: 20
  },
  btnSubmitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Chip Filter Modal
  unifiedSectionTitle: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text, marginBottom: 10 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  chipItem: { 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: '#f1f5f9', 
    margin: 4, 
    borderWidth: 1, 
    borderColor: 'transparent' 
  },
  chipItemActive: { backgroundColor: '#E0E7FF', borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '500' },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },

  unifiedFilterFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginTop: 24, 
    paddingTop: 16, 
    borderTopWidth: 1, 
    borderTopColor: '#f1f5f9' 
  },
  btnResetFilter: { 
    flex: 1, 
    paddingVertical: 12, 
    alignItems: 'center', 
    borderRadius: theme.radius.m, 
    borderWidth: 1, 
    borderColor: '#cbd5e1', 
    marginRight: 8 
  },
  btnResetFilterText: { color: theme.colors.textMuted, fontWeight: 'bold', fontSize: 14 },
  btnApplyFilter: { 
    flex: 1.5, 
    paddingVertical: 12, 
    alignItems: 'center', 
    borderRadius: theme.radius.m, 
    backgroundColor: theme.colors.primary, 
    marginLeft: 8 
  },
  btnApplyFilterText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  // Pending Leave Notice
  pendingNoticeBadge: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center'
  },
  pendingNoticeText: {
    fontSize: 12,
    color: '#b45309',
    fontWeight: '600'
  },

  // Attachment styles
  attachmentSection: {
    marginBottom: theme.spacing.m,
    padding: theme.spacing.m,
    backgroundColor: '#fffbeb',
    borderRadius: theme.radius.m,
    borderWidth: 1,
    borderColor: '#fef3c7'
  },
  attachmentPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4
  },
  attachmentPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    marginHorizontal: 3,
    borderRadius: theme.radius.s,
    borderWidth: 1,
    borderColor: '#fed7aa'
  },
  attachmentPickerBtnText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.primary
  },
  attachmentPreviewContainer: {
    alignItems: 'center',
    marginTop: 6
  },
  attachmentPreviewImage: {
    width: '100%',
    height: 160,
    borderRadius: theme.radius.s,
    backgroundColor: '#f1f5f9'
  },
  imagePreviewWrapper: {
    width: '100%',
    position: 'relative'
  },
  imagePreviewOverlayBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  imagePreviewOverlayText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 4
  },
  pdfSelectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    width: '100%',
    marginBottom: 4
  },
  pdfSelectedIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  pdfSelectedName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  pdfSelectedType: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '600',
    marginTop: 2
  },
  btnQuickPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  btnQuickPreviewText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginLeft: 4
  },
  attachmentActions: {
    flexDirection: 'row',
    marginTop: 8,
    width: '100%',
    justifyContent: 'flex-end',
    flexWrap: 'wrap'
  },
  btnChangeAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 4
  },
  btnChangeAttachmentText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginLeft: 3
  },
  btnRemoveAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4
  },
  btnRemoveAttachmentText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.danger,
    marginLeft: 3
  },
  hasAttachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#dbeafe'
  },
  hasAttachmentBadgePdf: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca'
  },
  hasAttachmentText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginLeft: 2,
  },

  // Modal Preview — Full Screen Dark Viewer
  previewModalOverlay: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  previewModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewModalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  previewModalSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
  previewModalBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pdfPreviewCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: '100%',
  },
  pdfIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  pdfFileNameText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f1f5f9',
    textAlign: 'center',
    marginBottom: 10,
  },
  pdfFileNoticeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 10,
  },
  btnOpenPdf: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    elevation: 2,
  },
  btnOpenPdfText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  btnOpenPdfSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    marginTop: 12,
  },
  btnOpenPdfSecondaryText: {
    color: '#60a5fa',
    fontWeight: '600',
    fontSize: 14,
  },
  zoomHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    opacity: 0.5,
  },
  zoomHintText: {
    color: '#ffffff',
    fontSize: 11,
  },
  btnOpenExternalImage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147,197,253,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.3)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 1,
  },
  btnOpenExternalImageText: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '600',
  },
  btnClosePreview: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  btnClosePreviewText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  }
});