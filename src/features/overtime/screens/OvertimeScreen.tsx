import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { theme } from '../../../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useToast } from '../../../core/ToastContext';
import { useConfirm } from '../../../core/ConfirmContext';

interface OvertimeItem {
  id: number;
  employee_id: number;
  date: string;
  start_time: string;
  end_time: string;
  hours: string | number;
  reason: string;
  status: string;
  approved_by?: number | null;
  approved_at?: string | null;
  approval_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

const MONTH_NAMES_INDONESIA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function OvertimeScreen() {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const [modalVisible, setModalVisible] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [startTime, setStartTime] = useState(new Date());
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  
  const [endTime, setEndTime] = useState(new Date(new Date().setHours(new Date().getHours() + 2)));
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  
  const [reason, setReason] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    date?: string;
    time?: string;
    reason?: string;
  }>({});

  const [overtimes, setOvertimes] = useState<OvertimeItem[]>([]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  
  // Month Filter States (Default: semua bulan / all)
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all'); // 'all' or 'YYYY-MM'

  // Unified Filter Popup Modal States
  const [showUnifiedFilterModal, setShowUnifiedFilterModal] = useState(false);
  const [tempStatusFilter, setTempStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [tempMonthFilter, setTempMonthFilter] = useState<string>('all');

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOvertimes = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/login');
        return;
      }

      const queryFilter = selectedStatusFilter === 'all' ? 'status=all' : `status=${selectedStatusFilter}`;
      const response = await fetch(`${apiUrl}/api/my/lembur?${queryFilter}`, {
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

      if (response.ok) {
        const json = await response.json();
        const list: OvertimeItem[] = Array.isArray(json) 
          ? json 
          : (Array.isArray(json.data) ? json.data : []);
        setOvertimes(list);
      } else {
        console.log('Gagal fetch data lembur, status:', response.status);
      }
    } catch (error) {
      console.log('Error fetch lembur:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatusFilter]);

  useEffect(() => {
    setIsLoading(true);
    fetchOvertimes();
  }, [fetchOvertimes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOvertimes();
    setRefreshing(false);
  }, [fetchOvertimes]);

  const currentMonthKey = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;

  const filteredOvertimes = overtimes.filter(item => {
    if (selectedMonthFilter === 'all') return true;
    if (!item.date) return false;
    return item.date.startsWith(selectedMonthFilter);
  });

  // Total jam lembur:
  // - Jika filter bulan dipilih: hitung bulan tersebut (hanya status disetujui)
  // - Jika filter bulan 'all' (tidak terisi): hitung otomatis bulan aktif saat ini (hanya status disetujui)
  const totalHours = overtimes.reduce((acc, curr) => {
    const status = (curr.status || '').toLowerCase();
    const isApproved = status === 'approved' || status === 'disetujui';
    if (!isApproved) return acc;

    const matchesMonth = selectedMonthFilter === 'all'
      ? (curr.date ? curr.date.startsWith(currentMonthKey) : false)
      : (curr.date ? curr.date.startsWith(selectedMonthFilter) : false);

    if (!matchesMonth) return acc;

    const h = typeof curr.hours === 'string' ? parseFloat(curr.hours) : curr.hours;
    return acc + (isNaN(h) ? 0 : h);
  }, 0);

  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTimeStr = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    // If format is HH:mm:ss, return HH:mm
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return timeStr;
  };

  const handleDateChange = (_event: any, selectedDate: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
      setFormErrors(prev => ({ ...prev, date: undefined }));
    }
  };

  const handleStartTimeChange = (_event: any, selectedTime: Date) => {
    setShowStartTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setStartTime(selectedTime);
      setFormErrors(prev => ({ ...prev, time: undefined }));
    }
  };

  const handleEndTimeChange = (_event: any, selectedTime: Date) => {
    setShowEndTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setEndTime(selectedTime);
      setFormErrors(prev => ({ ...prev, time: undefined }));
    }
  };

  const handleSubmit = async () => {
    const errors: { date?: string; time?: string; reason?: string } = {};

    if (!reason.trim()) {
      errors.reason = 'Keterangan pekerjaan wajib diisi';
    } else if (reason.trim().length < 3) {
      errors.reason = 'Keterangan pekerjaan minimal 3 karakter';
    }
    
    // Hitung durasi jam
    const diffMs = endTime.getTime() - startTime.getTime();
    let hoursCalc = diffMs / (1000 * 60 * 60);
    if (hoursCalc < 0) {
      hoursCalc += 24; // Handle lewat tengah malam jika perlu
    }
    
    if (hoursCalc <= 0) {
      errors.time = 'Jam Selesai harus lebih besar dari Jam Mulai';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      showToast({ title: 'Form Belum Lengkap', message: 'Harap periksa kolom yang ditandai merah', type: 'warning' });
      return;
    }
    setFormErrors({});

    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateFormatted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const startFormatted = `${pad(startTime.getHours())}:${pad(startTime.getMinutes())}`;
    const endFormatted = `${pad(endTime.getHours())}:${pad(endTime.getMinutes())}`;

    const payload = {
      date: dateFormatted,
      start_time: startFormatted,
      end_time: endFormatted,
      hours: Number(hoursCalc.toFixed(2)),
      reason: reason.trim()
    };

    setSubmitting(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/login');
        return;
      }

      const isEdit = !!editingId;
      const endpoint = isEdit ? `${apiUrl}/api/my/lembur/${editingId}` : `${apiUrl}/api/my/lembur`;
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const json = await response.json().catch(() => null);

      if (response.ok) {
        showToast({ 
          title: 'Berhasil', 
          message: isEdit ? 'Pengajuan lembur berhasil diperbarui!' : 'Pengajuan lembur berhasil dikirim!', 
          type: 'success' 
        });
        setModalVisible(false);
        setReason('');
        setEditingId(null);
        fetchOvertimes();
      } else {
        const errorMsg = json?.message || `Gagal ${isEdit ? 'memperbarui' : 'mengirim'} pengajuan lembur.`;
        Alert.alert('Gagal', errorMsg);
      }
    } catch {
      Alert.alert('Error', 'Terjadi kesalahan jaringan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item: OvertimeItem) => {
    setEditingId(item.id);
    setReason(item.reason || '');
    setFormErrors({});
    if (item.date) {
      setDate(new Date(item.date));
    }
    
    if (item.start_time) {
      const parts = item.start_time.split(':');
      const st = new Date(item.date || Date.now());
      st.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0);
      setStartTime(st);
    }
    
    if (item.end_time) {
      const parts = item.end_time.split(':');
      const et = new Date(item.date || Date.now());
      et.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0);
      setEndTime(et);
    }
    
    setModalVisible(true);
  };

  const handleDelete = (id: number) => {
    showConfirm({
      title: 'Hapus Pengajuan',
      message: 'Apakah Anda yakin ingin menghapus data pengajuan lembur ini?',
      confirmText: 'Hapus',
      cancelText: 'Batal',
      type: 'danger',
      onConfirm: async () => {
        try {
          const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
          const token = await AsyncStorage.getItem('userToken');
          if (!token) return;

          const response = await fetch(`${apiUrl}/api/my/lembur/${id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json'
            }
          });

          if (response.ok) {
            showToast({ title: 'Sukses', message: 'Data lembur berhasil dihapus', type: 'success' });
            fetchOvertimes();
          } else {
            showToast({ title: 'Gagal', message: 'Tidak dapat menghapus data ini', type: 'error' });
          }
        } catch {
          showToast({ title: 'Error', message: 'Gagal menghubungi server', type: 'error' });
        }
      }
    });
  };

  const isPendingStatus = (status?: string) => {
    const s = (status || '').toLowerCase();
    return s === 'pending' || s === 'menunggu';
  };

  const renderRightActions = (item: OvertimeItem) => {
    if (!isPendingStatus(item.status)) {
      return null;
    }

    return (
      <View style={styles.swipeActionsContainer}>
        <View style={styles.swipeActionView}>
          <TouchableOpacity style={[styles.swipeBtnSquare, { backgroundColor: theme.colors.warning }]} onPress={() => handleEdit(item)}>
            <MaterialIcons name="edit" size={24} color="#fff" />
            <Text style={styles.swipeText}>Ubah</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.swipeBtnSquare, { backgroundColor: theme.colors.danger }]} onPress={() => handleDelete(item.id)}>
            <MaterialIcons name="delete" size={24} color="#fff" />
            <Text style={styles.swipeText}>Hapus</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
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

  const getFilterLabel = () => {
    switch (selectedStatusFilter) {
      case 'approved': return 'Disetujui';
      case 'pending': return 'Menunggu';
      case 'rejected': return 'Ditolak';
      default: return 'Semua Status';
    }
  };

  const getMonthFilterLabel = () => {
    if (selectedMonthFilter === 'all') return 'Semua Bulan';
    const [y, m] = selectedMonthFilter.split('-');
    const idx = parseInt(m, 10) - 1;
    return `${MONTH_NAMES_INDONESIA[idx] || m} ${y}`;
  };

  const getAvailableMonths = () => {
    const months = new Set<string>();
    overtimes.forEach(o => {
      if (o.date && o.date.length >= 7) {
        months.add(o.date.substring(0, 7)); // 'YYYY-MM'
      }
    });
    // Add current and recent month if empty
    const pad = (n: number) => n.toString().padStart(2, '0');
    months.add(`${currentYear}-${pad(currentMonth)}`);
    return Array.from(months).sort().reverse();
  };

  return (
    <View style={styles.container}>
      {isLoading && !refreshing && (
        <View style={styles.floatingLoadingOverlay}>
          <View style={styles.floatingLoadingCard}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.floatingLoadingText}>Memuat Data Lembur...</Text>
          </View>
        </View>
      )}

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ padding: theme.spacing.m }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        
        {/* SUMMARY CARD */}
        <View style={styles.summaryCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.summaryTitle}>
                {selectedMonthFilter === 'all' 
                  ? `Total Lembur Bulan Ini (${MONTH_NAMES_INDONESIA[currentMonth - 1]} ${currentYear})` 
                  : `Total Lembur (${getMonthFilterLabel()})`}
              </Text>
              <Text style={styles.summaryValue}>{totalHours.toFixed(1)} <Text style={{ fontSize: 16, fontWeight: 'normal' }}>Jam</Text></Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>*Hanya lembur yang disetujui</Text>
            </View>
            <View style={styles.iconContainer}>
              <MaterialIcons name="more-time" size={36} color="#fff" />
            </View>
          </View>
        </View>
        
        {/* ACTION BUTTON */}
        <TouchableOpacity style={styles.btnAjukan} onPress={() => {
          setEditingId(null);
          setReason('');
          setFormErrors({});
          setDate(new Date());
          setStartTime(new Date());
          setEndTime(new Date(new Date().setHours(new Date().getHours() + 2)));
          setModalVisible(true);
        }} activeOpacity={0.8}>
          <MaterialIcons name="add-circle" size={22} color="#fff" />
          <Text style={styles.btnAjukanText}>Ajukan Lembur Baru</Text>
        </TouchableOpacity>
        
        {/* HISTORY SECTION */}
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.historyTitle}>Riwayat Lembur</Text>
            {(selectedMonthFilter !== 'all' || selectedStatusFilter !== 'all') && (
              <Text style={{ fontSize: 12, color: theme.colors.primary, marginTop: 2, fontWeight: '500' }}>
                {getMonthFilterLabel()} • {getFilterLabel()}
              </Text>
            )}
          </View>

          {/* BUTTON FILTER POPUP */}
          <TouchableOpacity 
            style={[
              styles.filterBtn, 
              (selectedMonthFilter !== 'all' || selectedStatusFilter !== 'all') && { backgroundColor: theme.colors.primary }
            ]} 
            onPress={() => {
              setTempStatusFilter(selectedStatusFilter);
              setTempMonthFilter(selectedMonthFilter);
              setShowUnifiedFilterModal(true);
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
            {(selectedMonthFilter !== 'all' || selectedStatusFilter !== 'all') && (
              <View style={styles.filterActiveDot} />
            )}
          </TouchableOpacity>
        </View>
        
        {/* SINGLE CARD LIST */}
        <View style={styles.listContainer}>
          {filteredOvertimes.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <MaterialIcons name="schedule" size={48} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>Belum ada riwayat lembur pada filter ini</Text>
            </View>
          ) : (
            filteredOvertimes.map((item, index) => {
              const statusInfo = getStatusBadge(item.status);
              const day = item.date ? new Date(item.date).getDate().toString().padStart(2, '0') : '--';
              const month = item.date ? new Date(item.date).toLocaleString('id-ID', { month: 'short' }) : '---';
              const durationHours = typeof item.hours === 'string' ? parseFloat(item.hours) : item.hours;

              return (
                <Swipeable key={item.id} renderRightActions={() => renderRightActions(item)}>
                  <View style={[styles.listItem, index === filteredOvertimes.length - 1 && { borderBottomWidth: 0 }]}>
                    
                    <View style={styles.dateBadge}>
                      <Text style={styles.dateBadgeDay}>{day}</Text>
                      <Text style={styles.dateBadgeMonth}>{month}</Text>
                    </View>

                    <View style={{ flex: 1, paddingLeft: theme.spacing.m }}>
                      <Text style={styles.itemTitle}>
                        {formatTimeStr(item.start_time)} - {formatTimeStr(item.end_time)}{' '}
                        <Text style={{ color: theme.colors.primary, fontSize: 13 }}>
                          ({durationHours || 0} Jam)
                        </Text>
                      </Text>
                      <Text style={styles.itemReason}>"{item.reason || 'Tanpa keterangan'}"</Text>
                      <Text style={styles.itemDateFull}>{formatDateIndo(item.date)}</Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                      <Text style={styles.statusText}>{statusInfo.label}</Text>
                    </View>
                  </View>
                </Swipeable>
              );
            })
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* UNIFIED FILTER POPUP MODAL */}
      <Modal 
        visible={showUnifiedFilterModal} 
        transparent={true} 
        animationType="fade" 
        onRequestClose={() => setShowUnifiedFilterModal(false)}
      >
        <TouchableOpacity 
          style={styles.filterOverlay} 
          activeOpacity={1} 
          onPress={() => setShowUnifiedFilterModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.unifiedFilterContent}>
            <View style={styles.unifiedFilterHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialIcons name="tune" size={22} color={theme.colors.primary} />
                <Text style={styles.unifiedFilterTitle}>Filter Data Lembur</Text>
              </View>
              <TouchableOpacity onPress={() => setShowUnifiedFilterModal(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Section 1: Filter Status */}
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

              {/* Section 2: Filter Bulan */}
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
                  setShowUnifiedFilterModal(false);
                }}
              >
                <Text style={styles.btnResetFilterText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnApplyFilter}
                onPress={() => {
                  setSelectedStatusFilter(tempStatusFilter);
                  setSelectedMonthFilter(tempMonthFilter);
                  setShowUnifiedFilterModal(false);
                }}
              >
                <Text style={styles.btnApplyFilterText}>Terapkan Filter</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* FORM MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Ubah Pengajuan Lembur' : 'Form Pengajuan Lembur'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={{ marginBottom: theme.spacing.m }}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Tanggal Lembur</Text>
                <Text style={styles.requiredBadge}>*Wajib</Text>
              </View>
              <TouchableOpacity 
                style={[styles.inputBox, { marginBottom: 4 }, formErrors.date && styles.inputBoxError]} 
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.inputText}>{`${date.getDate()} ${MONTH_NAMES_INDONESIA[date.getMonth()]} ${date.getFullYear()}`}</Text>
                <MaterialIcons name="calendar-today" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {formErrors.date ? (
                <View style={styles.inlineErrorRow}>
                  <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
                  <Text style={styles.inlineErrorText}>{formErrors.date}</Text>
                </View>
              ) : null}
              {showDatePicker && (
                <DateTimePicker 
                  value={date} 
                  mode="date" 
                  display="default" 
                  onValueChange={handleDateChange} 
                  onDismiss={() => setShowDatePicker(false)} 
                />
              )}
            </View>

            <View style={{ marginBottom: theme.spacing.m }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Jam Mulai</Text>
                    <Text style={styles.requiredBadge}>*Wajib</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.inputBox, { marginBottom: 4 }, formErrors.time && styles.inputBoxError]} 
                    onPress={() => setShowStartTimePicker(true)}
                  >
                    <Text style={styles.inputText}>{startTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</Text>
                    <MaterialIcons name="access-time" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {showStartTimePicker && (
                    <DateTimePicker 
                      value={startTime} 
                      mode="time" 
                      display="default" 
                      onValueChange={handleStartTimeChange} 
                      onDismiss={() => setShowStartTimePicker(false)} 
                    />
                  )}
                </View>
                
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Jam Selesai</Text>
                    <Text style={styles.requiredBadge}>*Wajib</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.inputBox, { marginBottom: 4 }, formErrors.time && styles.inputBoxError]} 
                    onPress={() => setShowEndTimePicker(true)}
                  >
                    <Text style={styles.inputText}>{endTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</Text>
                    <MaterialIcons name="access-time" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {showEndTimePicker && (
                    <DateTimePicker 
                      value={endTime} 
                      mode="time" 
                      display="default" 
                      onValueChange={handleEndTimeChange} 
                      onDismiss={() => setShowEndTimePicker(false)} 
                    />
                  )}
                </View>
              </View>
              {formErrors.time ? (
                <View style={styles.inlineErrorRow}>
                  <MaterialIcons name="error-outline" size={14} color={theme.colors.danger} />
                  <Text style={styles.inlineErrorText}>{formErrors.time}</Text>
                </View>
              ) : null}
            </View>
            
            <View style={{ marginBottom: theme.spacing.m }}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Keterangan Pekerjaan</Text>
                <Text style={styles.requiredBadge}>*Wajib</Text>
              </View>
              <TextInput 
                style={[
                  styles.inputBox, 
                  { height: 80, textAlignVertical: 'top', marginBottom: 4 },
                  formErrors.reason && styles.inputBoxError
                ]} 
                placeholder="Contoh: Stok opname (uji Bruno)..." 
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
            
            <TouchableOpacity 
              style={[styles.btnSubmit, submitting && { opacity: 0.7 }]} 
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnSubmitText}>{editingId ? 'Simpan Perubahan' : 'Kirim Pengajuan'}</Text>
              )}
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

  summaryCard: { 
    backgroundColor: '#3b82f6', 
    padding: theme.spacing.xl, 
    borderRadius: theme.radius.l, 
    elevation: 5, 
    shadowColor: '#3b82f6', 
    shadowOpacity: 0.4, 
    shadowRadius: 10,
    marginBottom: theme.spacing.l
  },
  summaryTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  summaryValue: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  iconContainer: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 24 },

  btnAjukan: { backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.m, borderRadius: theme.radius.m, marginBottom: theme.spacing.xl },
  btnAjukanText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: theme.spacing.s },
  
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.m },
  historyTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  filterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E7FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  filterText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 13, marginRight: 6 },
  
  listContainer: { backgroundColor: theme.colors.card, borderRadius: theme.radius.m, elevation: 1, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  emptyText: { padding: theme.spacing.m, textAlign: 'center', color: theme.colors.textMuted },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.m, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card },
  
  dateBadge: { backgroundColor: '#f1f5f9', padding: 8, borderRadius: 8, alignItems: 'center', minWidth: 50 },
  dateBadgeDay: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  dateBadgeMonth: { fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' },
  
  itemTitle: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  itemReason: { color: theme.colors.textMuted, fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  itemDateFull: { color: theme.colors.textMuted, fontSize: 11, marginTop: 4 },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.round },
  statusText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  
  swipeActionsContainer: { width: 140, flexDirection: 'row', paddingLeft: 8 },
  swipeActionView: { flexDirection: 'row', flex: 1, borderRadius: theme.radius.m, overflow: 'hidden' },
  swipeBtnSquare: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  swipeText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginTop: 4 },

  filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  filterActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginLeft: 4 },
  
  unifiedFilterContent: { backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: theme.radius.l, padding: theme.spacing.l, elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10 },
  unifiedFilterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderColor: '#f1f5f9', paddingBottom: 12 },
  unifiedFilterTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.text, marginLeft: 8 },
  unifiedSectionTitle: { fontSize: 13, fontWeight: 'bold', color: theme.colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'transparent' },
  chipItemActive: { backgroundColor: '#eff6ff', borderColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: '500', color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },

  unifiedFilterFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 14, borderTopWidth: 1, borderColor: '#f1f5f9', gap: 12 },
  btnResetFilter: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.m, alignItems: 'center', backgroundColor: '#f1f5f9' },
  btnResetFilterText: { color: theme.colors.textMuted, fontWeight: 'bold', fontSize: 14 },
  btnApplyFilter: { flex: 2, paddingVertical: 12, borderRadius: theme.radius.m, alignItems: 'center', backgroundColor: theme.colors.primary },
  btnApplyFilterText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: theme.spacing.xl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.l },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  label: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text, marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  requiredBadge: { color: theme.colors.danger, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  optionalBadge: { color: theme.colors.textMuted, fontSize: 12, marginLeft: 6 },
  inputBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.s, padding: theme.spacing.m, marginBottom: theme.spacing.m },
  inputBoxError: { borderColor: theme.colors.danger, borderWidth: 1.5, backgroundColor: '#fff5f5' },
  inlineErrorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 8, paddingHorizontal: 2 },
  inlineErrorText: { color: theme.colors.danger, fontSize: 12, fontWeight: '500', marginLeft: 4, flex: 1 },
  inputText: { color: theme.colors.text },
  btnSubmit: { backgroundColor: theme.colors.primary, padding: theme.spacing.m, borderRadius: theme.radius.m, alignItems: 'center', marginTop: theme.spacing.s },
  btnSubmitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});