import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../core/theme';
import { useToast } from '../../../core/ToastContext';
import { useConfirm } from '../../../core/ConfirmContext';
import { kasbonService } from '../services/kasbonService';
import { KasbonSummary, KasbonItem } from '../types';

function formatRupiah(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) return 'Rp 0';
  const num = Math.round(Number(amount));
  return 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

const TENOR_OPTIONS = [1, 2, 3, 4, 6, 10, 12];
const QUICK_AMOUNTS = [500000, 1000000, 2000000, 3000000, 5000000];

type FilterTab = 'all' | 'pending' | 'active' | 'completed' | 'rejected';

export default function KasbonScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // Data States
  const [summary, setSummary] = useState<KasbonSummary | null>(null);
  const [kasbonList, setKasbonList] = useState<KasbonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Modal Form States
  const [showFormModal, setShowFormModal] = useState(false);
  const [formAmountStr, setFormAmountStr] = useState('');
  const [formTenor, setFormTenor] = useState<number>(4);
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal Detail States
  const [selectedKasbon, setSelectedKasbon] = useState<KasbonItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Aturan Bisnis: Cek apakah karyawan memiliki tagihan kasbon aktif atau pengajuan berjalan
  const approvedActiveKasbon = useMemo(() => {
    return (
      kasbonList.find((item) => {
        const st = (item.status || '').toLowerCase();
        const isActive = st === 'active' || st === 'approved' || st === 'berjalan' || st === 'disetujui';
        const hasRemaining = item.remaining_balance !== undefined ? Number(item.remaining_balance) > 0 : true;
        return isActive && hasRemaining;
      }) || null
    );
  }, [kasbonList]);

  const pendingKasbon = useMemo(() => {
    return (
      kasbonList.find((item) => {
        const st = (item.status || '').toLowerCase();
        return st === 'pending' || st === 'menunggu';
      }) || null
    );
  }, [kasbonList]);

  const activeMonthlyDeduction = useMemo(() => {
    if (summary?.monthly_deduction && Number(summary.monthly_deduction) > 0) {
      return Number(summary.monthly_deduction);
    }
    if (approvedActiveKasbon?.monthly_deduction && Number(approvedActiveKasbon.monthly_deduction) > 0) {
      return Number(approvedActiveKasbon.monthly_deduction);
    }
    return 0;
  }, [summary, approvedActiveKasbon]);

  const activeRemainingInstallments = useMemo(() => {
    if (summary?.remaining_installments && Number(summary.remaining_installments) > 0) {
      return Number(summary.remaining_installments);
    }
    if (approvedActiveKasbon) {
      const totalTenor = Math.max(1, Number(approvedActiveKasbon.installment_count) || 1);
      const paidCount = Number(approvedActiveKasbon.paid_installments_count || 0);
      return Math.max(0, totalTenor - paidCount);
    }
    return 0;
  }, [summary, approvedActiveKasbon]);

  const hasActiveDebt = useMemo(() => {
    const activeBalance = Number(summary?.remaining_balance || 0);
    const activeCount = Number(summary?.active_count || 0);
    const pendingCount = Number(summary?.pending_count || 0);
    const pendingAmount = Number(summary?.total_pending_amount || 0);

    return (
      activeBalance > 0 ||
      activeCount > 0 ||
      pendingCount > 0 ||
      pendingAmount > 0 ||
      approvedActiveKasbon !== null ||
      pendingKasbon !== null
    );
  }, [summary, approvedActiveKasbon, pendingKasbon]);

  // Computed Form Values
  const numericAmount = useMemo(() => {
    const cleanStr = formAmountStr.replace(/[^0-9]/g, '');
    return cleanStr ? parseInt(cleanStr, 10) : 0;
  }, [formAmountStr]);

  const estimatedMonthlyDeduction = useMemo(() => {
    if (numericAmount <= 0 || formTenor <= 0) return 0;
    return Math.ceil(numericAmount / formTenor);
  }, [numericAmount, formTenor]);

  // Load Data
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [summaryRes, listRes] = await Promise.allSettled([
        kasbonService.getSummary(),
        kasbonService.getList('all'),
      ]);

      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value);
      }
      if (listRes.status === 'fulfilled') {
        setKasbonList(listRes.value);
      }
    } catch (err: any) {
      console.log('Error loading kasbon data:', err);
      showToast({
        title: 'Gagal Memuat Data',
        message: err.message || 'Terjadi kesalahan saat memuat data kasbon.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    loadData(true);
  };

  // Open Detail
  const handleOpenDetail = async (item: KasbonItem) => {
    setSelectedKasbon(item);
    try {
      setDetailLoading(true);
      const detail = await kasbonService.getDetail(item.id);
      setSelectedKasbon(detail);
    } catch {
      // Use existing item data as fallback
    } finally {
      setDetailLoading(false);
    }
  };

  // Handle Cancel Pending Kasbon
  const handleCancelKasbon = (id: number) => {
    showConfirm({
      title: 'Batalkan Pengajuan',
      message: 'Apakah Anda yakin ingin membatalkan pengajuan kasbon ini?',
      confirmText: 'Ya, Batalkan',
      cancelText: 'Kembali',
      type: 'danger',
      onConfirm: async () => {
        try {
          setCancellingId(id);
          await kasbonService.cancelKasbon(id);
          showToast({
            title: 'Berhasil Dibatalkan',
            message: 'Pengajuan kasbon berhasil dibatalkan.',
            type: 'success',
          });
          setSelectedKasbon(null);
          loadData(true);
        } catch (err: any) {
          showToast({
            title: 'Gagal Membatalkan',
            message: err.message || 'Tidak dapat membatalkan pengajuan.',
            type: 'error',
          });
        } finally {
          setCancellingId(null);
        }
      },
    });
  };

  // Klik Tombol Ajukan Kasbon Baru
  const handlePressApplyKasbon = () => {
    if (hasActiveDebt) {
      showToast({
        title: 'Pengajuan Terkunci',
        message: 'Kasbon hanya dapat diajukan setelah kasbon sebelumnya lunas.',
        type: 'warning',
      });
      return;
    }
    setShowFormModal(true);
  };

  // Handle Form Submit (monthly_deduction set 0 sesuai instruksi, ditentukan oleh akuntansi via web)
  const handleSubmitForm = async () => {
    if (hasActiveDebt) {
      showToast({
        title: 'Pengajuan Ditolak',
        message: 'Anda masih memiliki tagihan kasbon aktif yang belum lunas.',
        type: 'warning',
      });
      return;
    }

    if (numericAmount <= 0) {
      showToast({
        title: 'Nominal Tidak Valid',
        message: 'Silakan masukkan nominal pengajuan kasbon yang valid.',
        type: 'warning',
      });
      return;
    }

    if (!formNotes.trim()) {
      showToast({
        title: 'Alasan Wajib Diisi',
        message: 'Mohon tuliskan keperluan atau alasan pengajuan kasbon.',
        type: 'warning',
      });
      return;
    }

    showConfirm({
      title: 'Konfirmasi Pengajuan',
      message: `Ajukan pinjaman kasbon sebesar ${formatRupiah(numericAmount)} dengan tenor ${formTenor} bulan?\n\n*Catatan: Besaran potongan bulanan akan diverifikasi & ditentukan langsung oleh tim Akuntansi di sistem web.`,
      confirmText: 'Kirim Sekarang',
      cancelText: 'Periksa Lagi',
      type: 'info',
      onConfirm: async () => {
        try {
          setIsSubmitting(true);
          // monthly_deduction di-set 0 karena ditentukan oleh pihak akuntansi di web
          await kasbonService.createKasbon({
            amount: numericAmount,
            installment_count: formTenor,
            monthly_deduction: 0,
            notes: formNotes.trim(),
          });

          showToast({
            title: 'Pengajuan Terkirim',
            message: 'Pengajuan kasbon berhasil dikirim. Menunggu penetapan potongan oleh Akuntansi.',
            type: 'success',
          });

          setShowFormModal(false);
          setFormAmountStr('');
          setFormNotes('');
          setFormTenor(4);
          loadData(true);
        } catch (err: any) {
          showToast({
            title: 'Gagal Mengajukan',
            message: err.message || 'Terjadi kesalahan saat mengirim pengajuan.',
            type: 'error',
          });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  // Quick Amount helper
  const handleSelectQuickAmount = (val: number) => {
    setFormAmountStr(val.toLocaleString('id-ID'));
  };

  // Filtered List
  const filteredList = useMemo(() => {
    return kasbonList.filter((item) => {
      const st = (item.status || '').toLowerCase();
      if (activeTab === 'all') return true;
      if (activeTab === 'pending') return st === 'pending' || st === 'menunggu';
      if (activeTab === 'active') return st === 'active' || st === 'approved' || st === 'berjalan' || st === 'disetujui';
      if (activeTab === 'completed') return st === 'completed' || st === 'paid' || st === 'lunas' || st === 'selesai';
      if (activeTab === 'rejected') return st === 'rejected' || st === 'ditolak' || st === 'cancelled' || st === 'dibatalkan';
      return true;
    });
  }, [kasbonList, activeTab]);

  // Badge Status Helper
  const getStatusBadge = (statusStr: string) => {
    const s = (statusStr || '').toLowerCase();
    switch (s) {
      case 'approved':
      case 'disetujui':
      case 'active':
      case 'berjalan':
        return { label: 'Aktif / Berjalan', bg: '#dcfce7', text: '#166534', icon: 'check-circle' };
      case 'completed':
      case 'paid':
      case 'lunas':
      case 'selesai':
        return { label: 'Lunas', bg: '#e0e7ff', text: '#3730a3', icon: 'verified' };
      case 'rejected':
      case 'ditolak':
        return { label: 'Ditolak', bg: '#fee2e2', text: '#991b1b', icon: 'cancel' };
      case 'cancelled':
      case 'dibatalkan':
        return { label: 'Dibatalkan', bg: '#f1f5f9', text: '#64748b', icon: 'block' };
      case 'pending':
      case 'menunggu':
      default:
        return { label: 'Review Akuntansi', bg: '#fef3c7', text: '#92400e', icon: 'hourglass-empty' };
    }
  };

  // Render Horizontal Timeline Stepper for Card
  const renderCardTimeline = (item: KasbonItem) => {
    const s = (item.status || '').toLowerCase();
    const isPending = s === 'pending' || s === 'menunggu';
    const isActive = s === 'active' || s === 'approved' || s === 'berjalan' || s === 'disetujui';
    const isCompleted = s === 'completed' || s === 'paid' || s === 'lunas' || s === 'selesai';
    const isRejected = s === 'rejected' || s === 'ditolak' || s === 'cancelled' || s === 'dibatalkan';

    if (isRejected) {
      return (
        <View style={styles.cardRejectedTimelineBox}>
          <MaterialIcons name="info" size={14} color="#dc2626" />
          <Text style={styles.cardRejectedTimelineText}>
            Pengajuan tidak disetujui / dibatalkan oleh pihak Akuntansi/HRD.
          </Text>
        </View>
      );
    }

    // Hitung progress cicilan
    const totalTenor = Math.max(1, Number(item.installment_count) || 1);
    let paidCount = 0;
    if (isCompleted) {
      paidCount = totalTenor;
    } else if (item.paid_installments_count !== undefined) {
      paidCount = item.paid_installments_count;
    } else if (item.remaining_balance !== undefined && Number(item.amount) > 0) {
      const remaining = Number(item.remaining_balance);
      const paidAmt = Math.max(0, Number(item.amount) - remaining);
      paidCount = Math.min(totalTenor, Math.floor((paidAmt / Number(item.amount)) * totalTenor));
    }

    const progressPercent = Math.min(100, Math.round((paidCount / totalTenor) * 100));

    return (
      <View style={styles.cardTimelineContainer}>
        {/* Step indicators */}
        <View style={styles.cardTimelineStepsRow}>
          {/* Step 1: Diajukan */}
          <View style={styles.timelineStepItem}>
            <View style={[styles.stepCircle, styles.stepCircleDone]}>
              <MaterialIcons name="check" size={11} color="#ffffff" />
            </View>
            <Text style={styles.stepLabelDone}>Diajukan</Text>
          </View>

          <View style={[styles.stepConnectorLine, (isActive || isCompleted) ? styles.stepConnectorDone : styles.stepConnectorPending]} />

          {/* Step 2: Akuntansi */}
          <View style={styles.timelineStepItem}>
            <View style={[
              styles.stepCircle,
              isPending ? styles.stepCircleCurrent : (isActive || isCompleted ? styles.stepCircleDone : styles.stepCirclePending),
            ]}>
              {isActive || isCompleted ? (
                <MaterialIcons name="check" size={11} color="#ffffff" />
              ) : (
                <MaterialIcons name="receipt-long" size={11} color={isPending ? '#b45309' : '#94a3b8'} />
              )}
            </View>
            <Text style={isPending ? styles.stepLabelCurrent : (isActive || isCompleted ? styles.stepLabelDone : styles.stepLabelPending)}>
              Akuntansi
            </Text>
          </View>

          <View style={[styles.stepConnectorLine, isCompleted ? styles.stepConnectorDone : (isActive ? styles.stepConnectorActive : styles.stepConnectorPending)]} />

          {/* Step 3: Potong Gaji */}
          <View style={styles.timelineStepItem}>
            <View style={[
              styles.stepCircle,
              isActive ? styles.stepCircleCurrent : (isCompleted ? styles.stepCircleDone : styles.stepCirclePending),
            ]}>
              {isCompleted ? (
                <MaterialIcons name="check" size={11} color="#ffffff" />
              ) : (
                <MaterialIcons name="payments" size={11} color={isActive ? '#1d4ed8' : '#94a3b8'} />
              )}
            </View>
            <Text style={isActive ? styles.stepLabelCurrent : (isCompleted ? styles.stepLabelDone : styles.stepLabelPending)}>
              Potong Gaji
            </Text>
          </View>

          <View style={[styles.stepConnectorLine, isCompleted ? styles.stepConnectorDone : styles.stepConnectorPending]} />

          {/* Step 4: Lunas */}
          <View style={styles.timelineStepItem}>
            <View style={[styles.stepCircle, isCompleted ? styles.stepCircleDone : styles.stepCirclePending]}>
              <MaterialIcons name="verified" size={11} color={isCompleted ? '#ffffff' : '#94a3b8'} />
            </View>
            <Text style={isCompleted ? styles.stepLabelDone : styles.stepLabelPending}>Lunas</Text>
          </View>
        </View>

        {/* Progress Bar Angsuran jika sudah aktif/lunas */}
        {(isActive || isCompleted) ? (
          <View style={styles.cardInstallmentProgressWrap}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressCountText}>
                Angsuran {paidCount}/{totalTenor} Bulan ({progressPercent}%)
              </Text>
              <Text style={styles.progressBalanceText}>
                {isCompleted ? 'Lunas' : `Sisa ${formatRupiah(item.remaining_balance ?? (Number(item.amount) - (paidCount * Number(item.monthly_deduction))))}`}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* SUMMARY CARD SECTION (SESUAI RESPONSE DATABASE BACKEND) */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryHeaderLeft}>
              <View style={styles.summaryIconWrap}>
                <MaterialIcons name="account-balance-wallet" size={22} color="#ffffff" />
              </View>
              <View>
                <Text style={styles.summaryHeaderTitle}>Pinjaman Kasbon</Text>
                <Text style={styles.summaryHeaderSub}>
                  {summary?.active_count ? `${summary.active_count} Pinjaman Aktif` : 'Tidak Ada Pinjaman Aktif'}
                  {Number(summary?.total_pending_amount || 0) > 0 ? ' • 1 Pending' : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.refreshIconBtn}
              onPress={() => loadData(true)}
              disabled={refreshing}
            >
              <MaterialIcons name="refresh" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryDivider} />

          {/* MAIN VALUE: TOTAL REMAINING BALANCE DARI DATABASE */}
          <View style={styles.summaryBody}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Total Sisa Tagihan Kasbon</Text>
              <Text style={styles.summaryMainValue}>
                {formatRupiah(summary?.remaining_balance || 0)}
              </Text>
            </View>
          </View>

          {/* GRID DATA SESUAI RESPONSE BACKEND */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryGridItem}>
              <Text style={styles.summarySubLabel}>Potongan / Bln</Text>
              <Text style={styles.summarySubValue}>
                {activeMonthlyDeduction > 0 ? formatRupiah(activeMonthlyDeduction) : '-'}
              </Text>
            </View>

            <View style={styles.summarySubDivider} />

            <View style={styles.summaryGridItem}>
              <Text style={styles.summarySubLabel}>Sisa Angsuran</Text>
              <Text style={styles.summarySubValue}>
                {activeRemainingInstallments > 0 ? `${activeRemainingInstallments}x Bulan` : (summary?.remaining_balance === 0 ? 'Lunas' : '-')}
              </Text>
            </View>

            <View style={styles.summarySubDivider} />

            <View style={styles.summaryGridItem}>
              <Text style={styles.summarySubLabel}>Gaji Pokok</Text>
              <Text style={styles.summarySubValue}>
                {summary?.base_salary ? formatRupiah(summary.base_salary) : '-'}
              </Text>
            </View>
          </View>

          {/* STRIP KHUSUS BILA ADA TOTAL PENDING AMOUNT DARI DATABASE */}
          {Number(summary?.total_pending_amount || 0) > 0 ? (
            <View style={styles.summaryPendingBanner}>
              <View style={styles.pendingBadgeDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingBannerTitle}>
                  Pengajuan Dalam Review: {formatRupiah(summary?.total_pending_amount)}
                </Text>
                <Text style={styles.pendingBannerDesc}>
                  Sedang dalam peninjauan Akuntansi untuk penetapan potongan.
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ACTION BUTTON / BANNER: HANYA BISA DIAJUKAN JIKA KASBON SEBELUMNYA LUNAS */}
        {hasActiveDebt ? (
          <View style={styles.lockedKasbonBanner}>
            <View style={styles.lockedIconWrap}>
              <MaterialIcons name="lock" size={22} color="#b45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedBannerTitle}>Pengajuan Kasbon Baru Terkunci</Text>
              <Text style={styles.lockedBannerDesc}>
                {Number(summary?.total_pending_amount || 0) > 0
                  ? `Anda masih memiliki pengajuan kasbon sebesar ${formatRupiah(summary?.total_pending_amount)} yang sedang berstatus review/pending.`
                  : `Anda masih memiliki sisa tagihan kasbon aktif sebesar ${formatRupiah(summary?.remaining_balance)}. Sesuai kebijakan perusahaan, kasbon baru hanya dapat diajukan setelah kasbon sebelumnya LUNAS.`}
              </Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.btnPrimaryAction}
            activeOpacity={0.85}
            onPress={handlePressApplyKasbon}
          >
            <View style={styles.btnIconWrap}>
              <MaterialIcons name="add" size={22} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.btnPrimaryActionTitle}>Ajukan Kasbon Baru</Text>
              <Text style={styles.btnPrimaryActionSub}>
                Bebas tanggungan • Pilih tenor angsuran
              </Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#ffffff" />
          </TouchableOpacity>
        )}

        {/* SECTION RIWAYAT KASBON */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Riwayat & Progres Kasbon</Text>
          <Text style={styles.sectionSubtitle}>
            Total: {kasbonList.length} pengajuan
          </Text>
        </View>

        {/* FILTER TABS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterTabsScroll}
          contentContainerStyle={styles.filterTabsContainer}
        >
          {[
            { key: 'all', label: 'Semua' },
            { key: 'pending', label: 'Review Akuntansi' },
            { key: 'active', label: 'Aktif' },
            { key: 'completed', label: 'Lunas' },
            { key: 'rejected', label: 'Ditolak' },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveTab(tab.key as FilterTab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* LIST KASBON */}
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Memuat riwayat kasbon...</Text>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="cash-remove" size={54} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Belum Ada Kasbon</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'all'
                ? 'Anda belum memiliki riwayat pengajuan pinjaman kasbon.'
                : `Tidak ada kasbon dengan status "${activeTab}".`}
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredList.map((item) => {
              const badge = getStatusBadge(item.status);
              const isPending = item.status === 'pending' || item.status === 'menunggu';
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.kasbonCard}
                  activeOpacity={0.85}
                  onPress={() => handleOpenDetail(item)}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardNominalWrap}>
                      <Text style={styles.cardNominalLabel}>Total Pinjaman</Text>
                      <Text style={styles.cardNominalValue}>{formatRupiah(item.amount)}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <MaterialIcons name={badge.icon as any} size={14} color={badge.text} style={{ marginRight: 4 }} />
                      <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                  </View>

                  {/* PROGRES TIMELINE STEPPER PADA KARTU */}
                  {renderCardTimeline(item)}

                  <View style={styles.cardDetailsRow}>
                    <View style={styles.cardDetailCol}>
                      <Text style={styles.detailColLabel}>Tenor Pengajuan</Text>
                      <Text style={styles.detailColValue}>{item.installment_count}x Bulan</Text>
                    </View>
                    <View style={styles.detailColDivider} />
                    <View style={styles.cardDetailCol}>
                      <Text style={styles.detailColLabel}>Potongan Akuntansi</Text>
                      <Text style={styles.detailColValue}>
                        {Number(item.monthly_deduction) > 0 ? formatRupiah(item.monthly_deduction) : 'Ditetapkan Akun.'}
                      </Text>
                    </View>
                    <View style={styles.detailColDivider} />
                    <View style={styles.cardDetailCol}>
                      <Text style={styles.detailColLabel}>Tgl Diajukan</Text>
                      <Text style={styles.detailColValue}>{formatDate(item.created_at)}</Text>
                    </View>
                  </View>

                  {item.notes ? (
                    <View style={styles.cardNotesBox}>
                      <MaterialIcons name="format-quote" size={14} color={theme.colors.textMuted} />
                      <Text style={styles.cardNotesText} numberOfLines={1}>
                        {item.notes}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.cardFooter}>
                    <Text style={styles.tapDetailText}>Ketuk untuk lihat timeline lengkap</Text>
                    <View style={styles.cardFooterRight}>
                      {isPending ? (
                        <TouchableOpacity
                          style={styles.btnSmallCancel}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleCancelKasbon(item.id);
                          }}
                        >
                          <MaterialIcons name="close" size={14} color="#dc2626" />
                          <Text style={styles.btnSmallCancelText}>Batalkan</Text>
                        </TouchableOpacity>
                      ) : null}
                      <MaterialIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* MODAL FORM PENGAJUAN KASBON */}
      <Modal
        visible={showFormModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!isSubmitting) setShowFormModal(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Form Pengajuan Kasbon</Text>
                <Text style={styles.modalSubtitle}>Kirim permohonan pinjaman karyawan</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowFormModal(false)}
                disabled={isSubmitting}
              >
                <MaterialIcons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalFormBody}>
              {/* INPUT NOMINAL */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nominal Kasbon (Rp) *</Text>
                <View style={styles.currencyInputWrap}>
                  <Text style={styles.currencyPrefix}>Rp</Text>
                  <TextInput
                    style={styles.currencyInput}
                    placeholder="Contoh: 2.000.000"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="numeric"
                    value={formAmountStr}
                    onChangeText={(txt) => {
                      const clean = txt.replace(/[^0-9]/g, '');
                      if (!clean) {
                        setFormAmountStr('');
                      } else {
                        setFormAmountStr(parseInt(clean, 10).toLocaleString('id-ID'));
                      }
                    }}
                  />
                </View>

                {/* Quick amount chips */}
                <View style={styles.quickAmountRow}>
                  {QUICK_AMOUNTS.map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.quickAmountChip,
                        numericAmount === val && styles.quickAmountChipActive,
                      ]}
                      onPress={() => handleSelectQuickAmount(val)}
                    >
                      <Text
                        style={[
                          styles.quickAmountChipText,
                          numericAmount === val && styles.quickAmountChipTextActive,
                        ]}
                      >
                        {val >= 1000000 ? `${val / 1000000} Jt` : `${val / 1000} Rb`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* INPUT TENOR / JUMLAH CICILAN */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Pilih Tenor Angsuran (Bulan) *</Text>
                <View style={styles.tenorGrid}>
                  {TENOR_OPTIONS.map((tenor) => {
                    const isSelected = formTenor === tenor;
                    return (
                      <TouchableOpacity
                        key={tenor}
                        style={[styles.tenorChip, isSelected && styles.tenorChipActive]}
                        onPress={() => setFormTenor(tenor)}
                      >
                        <Text style={[styles.tenorChipText, isSelected && styles.tenorChipTextActive]}>
                          {tenor} Bln
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* CARD INFORMASI PENETAPAN POTONGAN OLEH AKUNTANSI */}
              <View style={styles.simulationCard}>
                <View style={styles.simulationHeader}>
                  <MaterialIcons name="account-balance" size={20} color={theme.colors.primary} />
                  <Text style={styles.simulationTitle}>Penetapan Potongan Slip Gaji</Text>
                </View>

                <View style={styles.simulationRow}>
                  <Text style={styles.simulationLabel}>Estimasi Angsuran</Text>
                  <Text style={styles.simulationValue}>
                    {numericAmount > 0 ? `± ${formatRupiah(estimatedMonthlyDeduction)} / bln` : '-'}
                  </Text>
                </View>

                <View style={styles.accountingNoticeBox}>
                  <MaterialIcons name="info-outline" size={17} color="#1e40af" style={{ marginRight: 6, marginTop: 1 }} />
                  <Text style={styles.simulationNotes}>
                    Besaran potongan bulanan final (<Text style={{ fontStyle: 'italic' }}>monthly deduction</Text>) akan ditentukan & diinput langsung oleh staf <Text style={{ fontWeight: 'bold' }}>Akuntansi</Text> melalui portal web master potongan (<Text style={{ fontStyle: 'italic' }}>deduction_types</Text>).
                  </Text>
                </View>
              </View>

              {/* INPUT CATATAN / KEPERLUAN */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Alasan / Keperluan Kasbon *</Text>
                <TextInput
                  style={styles.notesTextarea}
                  placeholder="Jelaskan kebutuhan pengajuan kasbon (contoh: Keperluan mendesak keluarga)"
                  placeholderTextColor={theme.colors.textMuted}
                  multiline={true}
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={formNotes}
                  onChangeText={setFormNotes}
                />
              </View>

              {/* SUBMIT BUTTON */}
              <TouchableOpacity
                style={[
                  styles.btnSubmitForm,
                  (numericAmount <= 0 || !formNotes.trim() || isSubmitting) && styles.btnDisabled,
                ]}
                onPress={handleSubmitForm}
                disabled={numericAmount <= 0 || !formNotes.trim() || isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialIcons name="send" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.btnSubmitText}>Kirim Pengajuan Kasbon</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DETAIL KASBON & PROGRESS TIMELINE */}
      <Modal
        visible={!!selectedKasbon}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedKasbon(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Detail & Timeline Kasbon</Text>
                <Text style={styles.modalSubtitle}>ID: #{selectedKasbon?.id}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedKasbon(null)}
              >
                <MaterialIcons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Memuat rincian & timeline...</Text>
              </View>
            ) : selectedKasbon ? (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.modalFormBody}>
                {/* STATUS BADGE BIG */}
                {(() => {
                  const b = getStatusBadge(selectedKasbon.status);
                  return (
                    <View style={[styles.detailStatusBanner, { backgroundColor: b.bg }]}>
                      <MaterialIcons name={b.icon as any} size={22} color={b.text} />
                      <Text style={[styles.detailStatusText, { color: b.text }]}>{b.label}</Text>
                    </View>
                  );
                })()}

                {/* HIGHLIGHT VALUES */}
                <View style={styles.detailHighlightCard}>
                  <View style={styles.detailHighlightCol}>
                    <Text style={styles.detailHighlightLabel}>Nominal Pinjaman</Text>
                    <Text style={styles.detailHighlightVal}>{formatRupiah(selectedKasbon.amount)}</Text>
                  </View>
                  <View style={styles.detailHighlightDivider} />
                  <View style={styles.detailHighlightCol}>
                    <Text style={styles.detailHighlightLabel}>Potongan Akuntansi</Text>
                    <Text style={[styles.detailHighlightVal, { color: theme.colors.primary }]}>
                      {Number(selectedKasbon.monthly_deduction) > 0
                        ? `${formatRupiah(selectedKasbon.monthly_deduction)}/bln`
                        : 'Menunggu Akun.'}
                    </Text>
                  </View>
                </View>

                {/* TIMELINE PROGRES VERTIKAL LENGKAP */}
                <View style={styles.verticalTimelineCard}>
                  <Text style={styles.verticalTimelineTitle}>Progres Pengajuan & Pemotongan</Text>

                  {(() => {
                    const st = (selectedKasbon.status || '').toLowerCase();
                    const isPending = st === 'pending' || st === 'menunggu';
                    const isActive = st === 'active' || st === 'approved' || st === 'berjalan' || st === 'disetujui';
                    const isCompleted = st === 'completed' || st === 'paid' || st === 'lunas' || st === 'selesai';
                    const isRejected = st === 'rejected' || st === 'ditolak' || st === 'cancelled' || st === 'dibatalkan';

                    return (
                      <View style={styles.vStepperWrapper}>
                        {/* Step 1: Pengajuan */}
                        <View style={styles.vStepRow}>
                          <View style={styles.vStepIndicatorCol}>
                            <View style={[styles.vStepDot, styles.vStepDotDone]}>
                              <MaterialIcons name="check" size={14} color="#ffffff" />
                            </View>
                            <View style={[styles.vStepLine, (isActive || isCompleted || isPending) && styles.vStepLineDone]} />
                          </View>
                          <View style={styles.vStepContent}>
                            <Text style={styles.vStepTitle}>Pengajuan Kasbon Terkirim</Text>
                            <Text style={styles.vStepDate}>{formatDate(selectedKasbon.created_at)}</Text>
                            <Text style={styles.vStepDesc}>
                              Pengajuan pinjaman {formatRupiah(selectedKasbon.amount)} diajukan untuk tenor {selectedKasbon.installment_count} bulan.
                            </Text>
                          </View>
                        </View>

                        {/* Step 2: Review & Master Potongan Akuntansi */}
                        <View style={styles.vStepRow}>
                          <View style={styles.vStepIndicatorCol}>
                            <View style={[
                              styles.vStepDot,
                              isRejected
                                ? styles.vStepDotRejected
                                : (isActive || isCompleted ? styles.vStepDotDone : styles.vStepDotActive)
                            ]}>
                              {isRejected ? (
                                <MaterialIcons name="close" size={14} color="#ffffff" />
                              ) : (isActive || isCompleted) ? (
                                <MaterialIcons name="check" size={14} color="#ffffff" />
                              ) : (
                                <MaterialIcons name="hourglass-top" size={14} color="#ffffff" />
                              )}
                            </View>
                            <View style={[styles.vStepLine, (isActive || isCompleted) ? styles.vStepLineDone : styles.vStepLinePending]} />
                          </View>
                          <View style={styles.vStepContent}>
                            <Text style={styles.vStepTitle}>Verifikasi Akuntansi & Master Potongan</Text>
                            <Text style={styles.vStepDate}>
                              {selectedKasbon.approved_at ? formatDate(selectedKasbon.approved_at) : (isPending ? 'Dalam Proses' : '-')}
                            </Text>
                            <Text style={styles.vStepDesc}>
                              {isRejected
                                ? (selectedKasbon.approval_notes || 'Pengajuan ditolak oleh pihak akuntansi/HRD.')
                                : (isActive || isCompleted)
                                  ? `Disetujui. Besaran potongan: ${formatRupiah(selectedKasbon.monthly_deduction)}/bulan telah didaftarkan ke master potongan.`
                                  : 'Tim Akuntansi sedang meninjau pengajuan dan menentukan besaran potongan gaji melalui web portal.'}
                            </Text>
                          </View>
                        </View>

                        {/* Step 3: Pemotongan Slip Gaji */}
                        <View style={styles.vStepRow}>
                          <View style={styles.vStepIndicatorCol}>
                            <View style={[
                              styles.vStepDot,
                              isCompleted
                                ? styles.vStepDotDone
                                : (isActive ? styles.vStepDotActive : styles.vStepDotPending)
                            ]}>
                              {isCompleted ? (
                                <MaterialIcons name="check" size={14} color="#ffffff" />
                              ) : isActive ? (
                                <MaterialIcons name="payments" size={14} color="#ffffff" />
                              ) : (
                                <MaterialIcons name="circle" size={10} color="#94a3b8" />
                              )}
                            </View>
                            <View style={[styles.vStepLine, isCompleted ? styles.vStepLineDone : styles.vStepLinePending]} />
                          </View>
                          <View style={styles.vStepContent}>
                            <Text style={styles.vStepTitle}>Pemotongan Gaji Bulanan</Text>
                            <Text style={styles.vStepDate}>
                              {isActive ? 'Aktif Berjalan' : (isCompleted ? 'Selesai' : 'Belum Berjalan')}
                            </Text>
                            <Text style={styles.vStepDesc}>
                              {isCompleted
                                ? 'Seluruh cicilan kasbon telah selesai dipotong dari slip gaji.'
                                : isActive
                                  ? `Cicilan aktif dipotong sebesar ${formatRupiah(selectedKasbon.monthly_deduction)} pada setiap periode slip gaji.`
                                  : 'Pemotongan akan aktif otomatis setelah disetujui oleh akuntansi.'}
                            </Text>
                          </View>
                        </View>

                        {/* Step 4: Lunas Selesai */}
                        <View style={styles.vStepRow}>
                          <View style={styles.vStepIndicatorCol}>
                            <View style={[
                              styles.vStepDot,
                              isCompleted ? styles.vStepDotDone : styles.vStepDotPending
                            ]}>
                              <MaterialIcons name="verified" size={14} color={isCompleted ? '#ffffff' : '#94a3b8'} />
                            </View>
                          </View>
                          <View style={styles.vStepContent}>
                            <Text style={styles.vStepTitle}>Kasbon Lunas</Text>
                            <Text style={styles.vStepDate}>
                              {isCompleted ? 'Lunas Sepenuhnya' : `Target: ${selectedKasbon.installment_count} Kali Angsuran`}
                            </Text>
                            <Text style={styles.vStepDesc}>
                              {isCompleted
                                ? 'Status pinjaman telah lunas dan saldo tanggungan bersih.'
                                : 'Kasbon akan berstatus lunas setelah seluruh angsuran terpenuhi.'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })()}
                </View>

                {/* TRACKER ANGSURAN BULANAN */}
                <View style={styles.installmentTrackerCard}>
                  <Text style={styles.installmentTrackerTitle}>Progres Tenor Cicilan</Text>
                  <View style={styles.tenorPillsGrid}>
                    {Array.from({ length: Math.max(1, selectedKasbon.installment_count) }, (_, idx) => {
                      const installmentNo = idx + 1;
                      const isCompleted = selectedKasbon.status === 'completed' || selectedKasbon.status === 'paid' || selectedKasbon.status === 'lunas';
                      const paidCount = selectedKasbon.paid_installments_count ?? (isCompleted ? selectedKasbon.installment_count : 0);
                      const isPaid = installmentNo <= paidCount;
                      const isCurrent = installmentNo === paidCount + 1 && (selectedKasbon.status === 'active' || selectedKasbon.status === 'approved');

                      return (
                        <View
                          key={installmentNo}
                          style={[
                            styles.tenorPill,
                            isPaid && styles.tenorPillPaid,
                            isCurrent && styles.tenorPillCurrent,
                          ]}
                        >
                          <View style={styles.tenorPillHeader}>
                            <Text style={[styles.tenorPillNumber, (isPaid || isCurrent) && styles.tenorPillTextHighlight]}>
                              Bulan {installmentNo}
                            </Text>
                            {isPaid ? (
                              <MaterialIcons name="check-circle" size={14} color="#166534" />
                            ) : isCurrent ? (
                              <MaterialIcons name="timelapse" size={14} color="#1d4ed8" />
                            ) : (
                              <MaterialIcons name="radio-button-unchecked" size={14} color="#94a3b8" />
                            )}
                          </View>
                          <Text style={[styles.tenorPillStatus, isPaid && { color: '#166534' }, isCurrent && { color: '#1d4ed8' }]}>
                            {isPaid ? 'Lunas' : isCurrent ? 'Bulan Ini' : 'Menunggu'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* INFORMASI LENGKAP */}
                <View style={styles.detailInfoBox}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoRowKey}>Alasan Pengajuan</Text>
                    <Text style={styles.detailNotesText}>{selectedKasbon.notes || '-'}</Text>
                  </View>
                  {selectedKasbon.approval_notes ? (
                    <View style={[styles.infoRow, { marginTop: 6 }]}>
                      <Text style={[styles.infoRowKey, { color: theme.colors.primary }]}>Catatan Akuntansi</Text>
                      <Text style={styles.detailNotesText}>{selectedKasbon.approval_notes}</Text>
                    </View>
                  ) : null}
                  {selectedKasbon.remaining_balance !== undefined ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoRowKey}>Sisa Tagihan</Text>
                      <Text style={[styles.infoRowVal, { fontWeight: 'bold', color: '#dc2626' }]}>
                        {formatRupiah(selectedKasbon.remaining_balance)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* CANCEL BUTTON FOR PENDING */}
                {(selectedKasbon.status === 'pending' || selectedKasbon.status === 'menunggu') ? (
                  <TouchableOpacity
                    style={[styles.btnCancelFull, cancellingId === selectedKasbon.id && styles.btnDisabled]}
                    onPress={() => handleCancelKasbon(selectedKasbon.id)}
                    disabled={cancellingId === selectedKasbon.id}
                  >
                    <MaterialIcons name="delete-outline" size={20} color="#dc2626" style={{ marginRight: 6 }} />
                    <Text style={styles.btnCancelFullText}>Batalkan Pengajuan Ini</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  summaryHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  summaryHeaderSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  refreshIconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 14,
  },
  summaryBody: {
    alignItems: 'center',
    marginBottom: 14,
  },
  summaryCol: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 4,
  },
  summaryMainValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  summaryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  summaryGridItem: {
    flex: 1,
    alignItems: 'center',
  },
  summarySubDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  summarySubLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.75)',
    marginBottom: 2,
  },
  summarySubValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  summaryPendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  pendingBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FCD34D',
    marginRight: 10,
  },
  pendingBannerTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FEF08A',
  },
  pendingBannerDesc: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.82)',
    marginTop: 1,
  },
  btnPrimaryAction: {
    backgroundColor: '#059669', // Emerald Green
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  btnPrimaryActionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  btnPrimaryActionSub: {
    fontSize: 12,
    color: '#d1fae5',
    marginTop: 2,
  },
  // LOCKED KASBON BANNER
  lockedKasbonBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
  },
  lockedIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  lockedBannerTitle: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 4,
  },
  lockedBannerDesc: {
    fontSize: 12,
    color: '#78350f',
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  filterTabsScroll: {
    marginBottom: 14,
  },
  filterTabsContainer: {
    paddingRight: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  listContainer: {
    gap: 14,
  },
  kasbonCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardNominalWrap: {},
  cardNominalLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  cardNominalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  // CARD TIMELINE STYLES
  cardTimelineContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardTimelineStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineStepItem: {
    alignItems: 'center',
    width: 58,
  },
  stepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepCircleDone: {
    backgroundColor: '#10b981',
  },
  stepCircleCurrent: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
  },
  stepCirclePending: {
    backgroundColor: '#E2E8F0',
  },
  stepLabelDone: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#059669',
    textAlign: 'center',
  },
  stepLabelCurrent: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#b45309',
    textAlign: 'center',
  },
  stepLabelPending: {
    fontSize: 9.5,
    color: '#94a3b8',
    textAlign: 'center',
  },
  stepConnectorLine: {
    flex: 1,
    height: 2,
    marginTop: -14,
    marginHorizontal: 2,
  },
  stepConnectorDone: {
    backgroundColor: '#10b981',
  },
  stepConnectorActive: {
    backgroundColor: '#3b82f6',
  },
  stepConnectorPending: {
    backgroundColor: '#E2E8F0',
  },
  cardInstallmentProgressWrap: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  progressCountText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
  },
  progressBalanceText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#059669',
  },
  cardRejectedTimelineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  cardRejectedTimelineText: {
    fontSize: 11.5,
    color: '#dc2626',
    marginLeft: 6,
    flex: 1,
  },
  cardDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  cardDetailCol: {
    alignItems: 'center',
  },
  detailColLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  detailColValue: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  detailColDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#CBD5E1',
  },
  cardNotesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  cardNotesText: {
    fontSize: 12,
    color: '#92400e',
    marginLeft: 6,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  tapDetailText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  cardFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnSmallCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  btnSmallCancelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#dc2626',
    marginLeft: 2,
  },
  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  modalFormBody: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 18,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  currencyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginRight: 8,
  },
  currencyInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    paddingVertical: 12,
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  quickAmountChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickAmountChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: theme.colors.primary,
  },
  quickAmountChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  quickAmountChipTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  tenorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tenorChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tenorChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tenorChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  tenorChipTextActive: {
    color: '#ffffff',
  },
  simulationCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 18,
  },
  simulationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  simulationTitle: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginLeft: 6,
  },
  simulationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  simulationLabel: {
    fontSize: 12,
    color: '#334155',
  },
  simulationValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  accountingNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  simulationNotes: {
    fontSize: 11.5,
    color: '#1e3a8a',
    flex: 1,
    lineHeight: 16,
  },
  notesTextarea: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    fontSize: 14,
    color: theme.colors.text,
    minHeight: 80,
  },
  btnSubmitForm: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  btnSubmitText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  // DETAIL MODAL & VERTICAL TIMELINE STYLES
  detailStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  detailStatusText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  detailHighlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  detailHighlightCol: {
    flex: 1,
    alignItems: 'center',
  },
  detailHighlightDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#CBD5E1',
  },
  detailHighlightLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginBottom: 3,
  },
  detailHighlightVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  verticalTimelineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
  },
  verticalTimelineTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 14,
  },
  vStepperWrapper: {
    paddingLeft: 4,
  },
  vStepRow: {
    flexDirection: 'row',
  },
  vStepIndicatorCol: {
    alignItems: 'center',
    width: 28,
  },
  vStepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vStepDotDone: {
    backgroundColor: '#10b981',
  },
  vStepDotActive: {
    backgroundColor: '#3b82f6',
  },
  vStepDotPending: {
    backgroundColor: '#E2E8F0',
  },
  vStepDotRejected: {
    backgroundColor: '#ef4444',
  },
  vStepLine: {
    width: 2,
    flex: 1,
    minHeight: 34,
    marginVertical: 4,
  },
  vStepLineDone: {
    backgroundColor: '#10b981',
  },
  vStepLinePending: {
    backgroundColor: '#E2E8F0',
  },
  vStepContent: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 16,
  },
  vStepTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  vStepDate: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 1,
    marginBottom: 3,
  },
  vStepDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  installmentTrackerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
  },
  installmentTrackerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  tenorPillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tenorPill: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tenorPillPaid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  tenorPillCurrent: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  tenorPillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tenorPillNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  tenorPillTextHighlight: {
    fontWeight: 'bold',
  },
  tenorPillStatus: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  detailInfoBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  infoRow: {
    paddingVertical: 6,
  },
  infoRowKey: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  infoRowVal: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  detailNotesText: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
  btnCancelFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    marginTop: 10,
    marginBottom: 10,
  },
  btnCancelFullText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#dc2626',
  },
});
