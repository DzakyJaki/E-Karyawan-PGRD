import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfirm } from '../../../core/ConfirmContext';
import { theme } from '../../../core/theme';
import { useToast } from '../../../core/ToastContext';
import { kasbonService } from '../services/kasbonService';
import { KasbonItem, KasbonPayment, KasbonSummary } from '../types';

const { width } = Dimensions.get('window');

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
  const router = useRouter();
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
      // Fallback
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

  // Handle Open Create Form
  const handlePressApplyKasbon = () => {
    if (hasActiveDebt) {
      showToast({
        title: 'Pengajuan Terkunci',
        message: 'Pengajuan kasbon baru hanya dapat dilakukan jika pinjaman kasbon sebelumnya telah LUNAS.',
        type: 'warning',
      });
      return;
    }
    setFormAmountStr('');
    setFormTenor(4);
    setFormNotes('');
    setShowFormModal(true);
  };

  // Quick Amount Select
  const handleSelectQuickAmount = (val: number) => {
    setFormAmountStr(val.toLocaleString('id-ID'));
  };

  // Submit Form
  const handleSubmitForm = async () => {
    if (numericAmount <= 0) {
      showToast({
        title: 'Nominal Tidak Valid',
        message: 'Silakan masukkan nominal kasbon yang valid.',
        type: 'warning',
      });
      return;
    }

    if (formTenor <= 0) {
      showToast({
        title: 'Tenor Belum Dipilih',
        message: 'Silakan pilih tenor angsuran pinjaman.',
        type: 'warning',
      });
      return;
    }

    if (!formNotes.trim()) {
      showToast({
        title: 'Alasan Wajib Diisi',
        message: 'Tuliskan alasan atau keperluan mendesak pengajuan kasbon.',
        type: 'warning',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await kasbonService.createKasbon({
        amount: numericAmount,
        installment_count: formTenor,
        notes: formNotes.trim(),
      });

      showToast({
        title: 'Pengajuan Berhasil Dikirim',
        message: 'Kasbon Anda telah terdaftar dan menunggu verifikasi bagian Akuntansi.',
        type: 'success',
      });

      setShowFormModal(false);
      setFormAmountStr('');
      setFormNotes('');
      loadData(true);
    } catch (err: any) {
      showToast({
        title: 'Gagal Mengajukan Kasbon',
        message: err.message || 'Terjadi kesalahan pada sistem backend.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered List
  const filteredList = useMemo(() => {
    if (activeTab === 'all') return kasbonList;
    if (activeTab === 'pending') {
      return kasbonList.filter((i) => {
        const s = (i.status || '').toLowerCase();
        return s === 'pending' || s === 'menunggu';
      });
    }
    if (activeTab === 'active') {
      return kasbonList.filter((i) => {
        const s = (i.status || '').toLowerCase();
        return s === 'active' || s === 'approved' || s === 'berjalan' || s === 'disetujui';
      });
    }
    if (activeTab === 'completed') {
      return kasbonList.filter((i) => {
        const s = (i.status || '').toLowerCase();
        return s === 'completed' || s === 'paid' || s === 'lunas' || s === 'selesai';
      });
    }
    if (activeTab === 'rejected') {
      return kasbonList.filter((i) => {
        const s = (i.status || '').toLowerCase();
        return s === 'rejected' || s === 'ditolak' || s === 'cancelled' || s === 'dibatalkan';
      });
    }
    return kasbonList;
  }, [kasbonList, activeTab]);

  // Badge Status
  const getStatusBadge = (status?: string) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'approved':
      case 'active':
      case 'berjalan':
      case 'disetujui':
        return { label: 'Disetujui', bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', icon: 'check-circle' };
      case 'pending':
      case 'menunggu':
        return { label: 'Review Akuntansi', bg: '#fffbeb', border: '#fde68a', text: '#d97706', icon: 'schedule' };
      case 'completed':
      case 'paid':
      case 'lunas':
      case 'selesai':
        return { label: 'Lunas', bg: '#ecfdf5', border: '#a7f3d0', text: '#059669', icon: 'verified' };
      case 'rejected':
      case 'ditolak':
      case 'cancelled':
      case 'dibatalkan':
        return { label: 'Dibatalkan', bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: 'cancel' };
      default:
        return { label: 'Review Akuntansi', bg: '#fffbeb', border: '#fde68a', text: '#d97706', icon: 'schedule' };
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

    const totalTenor = Math.max(1, Number(item.installment_count) || 1);
    const mDeduct = Number(item.monthly_deduction) > 0 ? Number(item.monthly_deduction) : Math.round(Number(item.amount) / totalTenor);
    const remBal = item.remaining_balance !== undefined ? Number(item.remaining_balance) : Number(item.amount);
    const paidDiff = Math.max(0, Number(item.amount) - remBal);

    let paidCount = 0;
    if (isCompleted) {
      paidCount = totalTenor;
    } else if (Number(item.paid_installments_count) > 0) {
      paidCount = Number(item.paid_installments_count);
    } else if (item.payments && item.payments.length > 0) {
      paidCount = item.payments.length;
    } else if (mDeduct > 0 && paidDiff > 0) {
      paidCount = Math.min(totalTenor, Math.round(paidDiff / mDeduct));
    }

    const progressPercent = Math.min(100, Math.round((paidCount / totalTenor) * 100));

    return (
      <View style={styles.cardTimelineContainer}>
        {/* Step indicators */}
        <View style={styles.cardTimelineStepsRow}>
          <View style={styles.timelineStepItem}>
            <View style={[styles.stepCircle, styles.stepCircleDone]}>
              <MaterialIcons name="check" size={10} color="#ffffff" />
            </View>
            <Text style={styles.stepLabelDone}>Diajukan</Text>
          </View>

          <View style={[styles.timelineConnector, (isActive || isCompleted) && styles.timelineConnectorDone]} />

          <View style={styles.timelineStepItem}>
            <View style={[styles.stepCircle, (isActive || isCompleted) ? styles.stepCircleDone : (isPending ? styles.stepCircleActive : styles.stepCirclePending)]}>
              {(isActive || isCompleted) ? (
                <MaterialIcons name="check" size={10} color="#ffffff" />
              ) : isPending ? (
                <MaterialIcons name="hourglass-empty" size={10} color="#ffffff" />
              ) : (
                <Text style={styles.stepNumberPending}>2</Text>
              )}
            </View>
            <Text style={(isActive || isCompleted) ? styles.stepLabelDone : (isPending ? styles.stepLabelActive : styles.stepLabelPending)}>
              Review
            </Text>
          </View>

          <View style={[styles.timelineConnector, (isActive || isCompleted) && styles.timelineConnectorDone]} />

          <View style={styles.timelineStepItem}>
            <View style={[styles.stepCircle, (isActive || isCompleted) ? styles.stepCircleDone : styles.stepCirclePending]}>
              {(isActive || isCompleted) ? (
                <MaterialIcons name="check" size={10} color="#ffffff" />
              ) : (
                <Text style={styles.stepNumberPending}>3</Text>
              )}
            </View>
            <Text style={(isActive || isCompleted) ? styles.stepLabelDone : styles.stepLabelPending}>
              Potong Gaji
            </Text>
          </View>

          <View style={[styles.timelineConnector, isCompleted && styles.timelineConnectorDone]} />

          <View style={styles.timelineStepItem}>
            <View style={[styles.stepCircle, isCompleted ? styles.stepCircleDone : styles.stepCirclePending]}>
              <MaterialIcons name="verified" size={10} color={isCompleted ? '#ffffff' : '#94a3b8'} />
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

  const hasDebt = Number(summary?.remaining_balance || 0) > 0;

  return (
    <View style={styles.rootWrapper}>
      {/* 1. TOP HEADER (Deep Corporate Blue) */}
      <View style={[styles.headerHeroContainer, { paddingTop: Math.max(insets.top + 8, 20) }]}>
        <View style={styles.headerTopBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/(tabs)/profile');
                }
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={styles.headerTitle}>Kasbon Karyawan</Text>
            </View>
          </View>
        </View>

        {/* 2. ELEVATED HERO CARD (Sesuai Gaya Evaluasi) */}
        <View style={styles.scoreHeroCard}>
          <View style={styles.scoreHeroRow}>
            {/* Highlight Box Left */}
            <View style={[
              styles.gaugeOuter,
              {
                borderColor: hasDebt ? '#fed7aa' : '#a7f3d0',
                backgroundColor: hasDebt ? '#fff7ed' : '#ecfdf5',
              }
            ]}>
              <MaterialIcons
                name={hasDebt ? 'account-balance-wallet' : 'verified'}
                size={24}
                color={hasDebt ? '#ea580c' : '#059669'}
              />
              <Text style={[styles.gaugeMainText, { color: hasDebt ? '#ea580c' : '#059669' }]}>
                {hasDebt ? 'AKTIF' : 'LUNAS'}
              </Text>
              <Text style={styles.gaugeScale}>STATUS KASBON</Text>
            </View>

            {/* Right Summary Content */}
            <View style={styles.heroRightContent}>
              <View style={[
                styles.heroPredicatePill,
                { backgroundColor: hasDebt ? '#f97316' : '#10b981' }
              ]}>
                <MaterialIcons
                  name={hasDebt ? 'lock-clock' : 'check-circle'}
                  size={14}
                  color="#ffffff"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.heroPredicateText}>
                  {hasDebt ? 'Tanggungan Aktif' : 'Bebas Tanggungan'}
                </Text>
              </View>

              <Text style={styles.heroBalanceMain}>
                {formatRupiah(summary?.remaining_balance || 0)}
              </Text>
              <Text style={styles.heroPeriodNotice}>
                {summary?.active_count ? `${summary.active_count} Pinjaman Berjalan` : 'Tidak Ada Tagihan Berjalan'}
                {Number(summary?.total_pending_amount || 0) > 0 ? ' • 1 Menunggu Review' : ''}
              </Text>

              {/* 3 Mini Metric Cards */}
              <View style={styles.heroMiniCardsRow}>
                <View style={styles.heroMiniCard}>
                  <MaterialIcons name="payments" size={13} color="#2563eb" />
                  <Text style={styles.heroMiniCardVal}>
                    {activeMonthlyDeduction > 0 ? formatRupiah(activeMonthlyDeduction) : '-'}
                  </Text>
                  <Text style={styles.heroMiniCardLbl}>Potongan/Bln</Text>
                </View>

                <View style={styles.heroMiniCard}>
                  <MaterialIcons name="date-range" size={13} color="#059669" />
                  <Text style={styles.heroMiniCardVal}>
                    {activeRemainingInstallments > 0 ? `${activeRemainingInstallments}x Bln` : (hasDebt ? '-' : 'Lunas')}
                  </Text>
                  <Text style={styles.heroMiniCardLbl}>Sisa Tenor</Text>
                </View>

                <View style={styles.heroMiniCard}>
                  <MaterialIcons name="hourglass-empty" size={13} color="#d97706" />
                  <Text style={styles.heroMiniCardVal}>
                    {Number(summary?.total_pending_amount || 0) > 0 ? '1' : '0'}
                  </Text>
                  <Text style={styles.heroMiniCardLbl}>Pending</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 3. SEGMENTED FILTER TABS */}
        <View style={styles.tabsContainer}>
          {[
            { key: 'all' as FilterTab, label: 'Semua', icon: 'view-list' },
            { key: 'pending' as FilterTab, label: 'Review', icon: 'schedule' },
            { key: 'active' as FilterTab, label: 'Berjalan', icon: 'timelapse' },
            { key: 'completed' as FilterTab, label: 'Lunas', icon: 'verified' },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={tab.icon as any}
                  size={15}
                  color={isActive ? theme.colors.primary : '#64748b'}
                  style={{ marginRight: 3 }}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 4. CONTENT BODY */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Memuat riwayat kasbon...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentScrollInner}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* BANNER / ACTION BUTTON AJUKAN KASBON */}
          {hasActiveDebt ? (
            <View style={styles.lockedKasbonBanner}>
              <View style={styles.lockedIconWrap}>
                <MaterialIcons name="lock" size={22} color="#b45309" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.lockedBannerTitle}>Pengajuan Kasbon Baru Terkunci</Text>
                <Text style={styles.lockedBannerDesc}>
                  {Number(summary?.total_pending_amount || 0) > 0
                    ? `Anda memiliki pengajuan kasbon sebesar ${formatRupiah(summary?.total_pending_amount)} yang sedang dalam status review.`
                    : `Sisa tagihan aktif: ${formatRupiah(summary?.remaining_balance)}. Sesuai aturan perusahaan, pengajuan baru hanya dibuka setelah tagihan sebelumnya LUNAS.`}
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.btnApplyCard}
              activeOpacity={0.85}
              onPress={handlePressApplyKasbon}
            >
              <View style={styles.btnApplyIconCircle}>
                <MaterialIcons name="add" size={24} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.btnApplyTitle}>Ajukan Kasbon Baru</Text>
                <Text style={styles.btnApplySub}>
                  Bebas tanggungan • Tentukan nominal & tenor
                </Text>
              </View>
              <View style={styles.cardActionArrow}>
                <MaterialIcons name="arrow-forward" size={14} color="#ffffff" />
              </View>
            </TouchableOpacity>
          )}

          {/* SECTION HEADER */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Daftar Pinjaman Karyawan</Text>
              <Text style={styles.sectionSubtitle}>Ketuk kartu untuk melihat rincian angsuran</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredList.length} Pengajuan</Text>
            </View>
          </View>

          {/* LIST KASBON */}
          {filteredList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="account-balance-wallet" size={54} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>Belum Ada Kasbon</Text>
              <Text style={styles.emptyDesc}>
                {activeTab === 'all'
                  ? 'Anda belum memiliki riwayat pengajuan pinjaman kasbon.'
                  : `Tidak ada data kasbon pada kategori ${activeTab}.`}
              </Text>
            </View>
          ) : (
            filteredList.map((item) => {
              const b = getStatusBadge(item.status);
              const isPending = (item.status || '').toLowerCase() === 'pending';

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.cardItem}
                  onPress={() => handleOpenDetail(item)}
                  activeOpacity={0.88}
                >
                  {/* Top Header Row of Card */}
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={styles.cardMonthTitleRow}>
                        <Text style={styles.cardMonthText}>{formatDate(item.loan_date || item.created_at)}</Text>
                      </View>
                      <Text style={styles.cardWorkingDaysText}>
                        Tenor: {item.installment_count} Bulan Angsuran
                      </Text>
                    </View>

                    {/* Status Approval Pill */}
                    <View style={[styles.statusPill, { backgroundColor: b.bg, borderColor: b.border }]}>
                      <MaterialIcons name={b.icon as any} size={13} color={b.text} style={{ marginRight: 4 }} />
                      <Text style={[styles.statusPillText, { color: b.text }]}>{b.label}</Text>
                    </View>
                  </View>

                  {/* Nominal Highlight Banner */}
                  <View style={styles.scoreBanner}>
                    <View style={styles.scoreBannerLeft}>
                      <Text style={styles.scoreBigNum}>{formatRupiah(item.amount)}</Text>
                      <View style={{ marginLeft: 10 }}>
                        <Text style={styles.scoreBannerLbl}>NOMINAL KASBON</Text>
                        <Text style={styles.scoreBannerPredicate}>
                          {Number(item.remaining_balance ?? item.amount) > 0
                            ? `Sisa ${formatRupiah(item.remaining_balance ?? item.amount)}`
                            : 'Lunas'}
                        </Text>
                      </View>
                    </View>
                    <MaterialCommunityIcons name="wallet-outline" size={26} color={theme.colors.primary} />
                  </View>

                  {/* Horizontal Timeline Stepper & Progress */}
                  {renderCardTimeline(item)}

                  {/* 4 Mini Stat Badges */}
                  <View style={styles.statGrid}>
                    <View style={styles.statCell}>
                      <MaterialCommunityIcons name="calendar-sync" size={17} color="#2563eb" />
                      <View style={{ marginLeft: 6 }}>
                        <Text style={styles.statCellVal}>
                          {Number(item.monthly_deduction) > 0 ? formatRupiah(item.monthly_deduction) : 'Menunggu Akun.'}
                        </Text>
                        <Text style={styles.statCellLbl}>Potongan / Bln</Text>
                      </View>
                    </View>

                    <View style={styles.statCell}>
                      <MaterialCommunityIcons name="clock-outline" size={17} color="#ea580c" />
                      <View style={{ marginLeft: 6 }}>
                        <Text style={styles.statCellVal}>{item.installment_count} Bulan</Text>
                        <Text style={styles.statCellLbl}>Jangka Waktu</Text>
                      </View>
                    </View>

                    <View style={styles.statCell}>
                      <MaterialCommunityIcons name="cash-multiple" size={17} color="#059669" />
                      <View style={{ marginLeft: 6 }}>
                        <Text style={styles.statCellVal}>
                          {item.remaining_balance !== undefined ? formatRupiah(item.remaining_balance) : formatRupiah(item.amount)}
                        </Text>
                        <Text style={styles.statCellLbl}>Sisa Saldo</Text>
                      </View>
                    </View>

                    <View style={styles.statCell}>
                      <MaterialCommunityIcons name="check-decagram" size={17} color="#7c3aed" />
                      <View style={{ marginLeft: 6 }}>
                        <Text style={styles.statCellVal}>{b.label}</Text>
                        <Text style={styles.statCellLbl}>Status Kasbon</Text>
                      </View>
                    </View>
                  </View>

                  {/* Catatan / Keperluan Box */}
                  {item.notes ? (
                    <View style={styles.notesBox}>
                      <MaterialIcons name="format-quote" size={18} color="#4f46e5" style={{ marginRight: 4 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.notesBoxTitle}>Keperluan Pengajuan:</Text>
                        <Text style={styles.notesBoxContent}>"{item.notes}"</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Action Row */}
                  <View style={styles.cardActionRow}>
                    {isPending ? (
                      <TouchableOpacity
                        style={styles.btnCancelPending}
                        onPress={() => handleCancelKasbon(item.id)}
                        disabled={cancellingId === item.id}
                        activeOpacity={0.8}
                      >
                        {cancellingId === item.id ? (
                          <ActivityIndicator size="small" color="#dc2626" />
                        ) : (
                          <>
                            <MaterialIcons name="delete-outline" size={15} color="#dc2626" style={{ marginRight: 4 }} />
                            <Text style={styles.btnCancelPendingText}>Batalkan</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : null}

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
                      <Text style={styles.cardActionText}>Buka Rincian & Jadwal Angsuran</Text>
                      <View style={styles.cardActionArrow}>
                        <MaterialIcons name="arrow-forward" size={14} color="#ffffff" />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      )}

      {/* 5. MODAL FORM PENGAJUAN KASBON BARU (Bottom Sheet) */}
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
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
            <View style={styles.modalGrabHandle} />

            <View style={styles.modalHeadBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeadTitle}>Ajukan Kasbon Baru</Text>
                <Text style={styles.modalHeadSubtitle}>Formulir pinjaman resmi karyawan</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseCircle}
                onPress={() => setShowFormModal(false)}
                disabled={isSubmitting}
              >
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBodyScroll}>
              {/* INPUT NOMINAL */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nominal Kasbon (Rp) *</Text>
                <View style={styles.currencyInputWrap}>
                  <Text style={styles.currencyPrefix}>Rp</Text>
                  <TextInput
                    style={styles.currencyInput}
                    placeholder="Contoh: 2.000.000"
                    placeholderTextColor="#94a3b8"
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
                      activeOpacity={0.8}
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
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.tenorChipText, isSelected && styles.tenorChipTextActive]}>
                          {tenor} Bln
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ESTIMASI ANGSURAN CARD */}
              <View style={styles.simulationCard}>
                <View style={styles.simulationHeader}>
                  <MaterialIcons name="account-balance" size={18} color={theme.colors.primary} />
                  <Text style={styles.simulationTitle}>Estimasi Potongan Slip Gaji</Text>
                </View>

                <View style={styles.simulationRow}>
                  <Text style={styles.simulationLabel}>Estimasi Angsuran</Text>
                  <Text style={styles.simulationValue}>
                    {numericAmount > 0 ? `± ${formatRupiah(estimatedMonthlyDeduction)} / bln` : '-'}
                  </Text>
                </View>

                <View style={styles.accountingNoticeBox}>
                  <MaterialIcons name="info-outline" size={16} color="#1e40af" style={{ marginRight: 6, marginTop: 1 }} />
                  <Text style={styles.simulationNotes}>
                    Besaran potongan bulanan final (<Text style={{ fontStyle: 'italic' }}>monthly deduction</Text>) akan ditentukan & diinput langsung oleh staf <Text style={{ fontWeight: 'bold' }}>Akuntansi</Text> melalui portal master potongan.
                  </Text>
                </View>
              </View>

              {/* INPUT CATATAN / KEPERLUAN */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Alasan / Keperluan Kasbon *</Text>
                <TextInput
                  style={styles.notesTextarea}
                  placeholder="Jelaskan kebutuhan pengajuan kasbon (contoh: Keperluan mendesak keluarga)"
                  placeholderTextColor="#94a3b8"
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
                    <MaterialIcons name="send" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.btnSubmitText}>Kirim Pengajuan Kasbon</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 6. MODAL DETAIL KASBON & PROGRESS TIMELINE */}
      <Modal
        visible={!!selectedKasbon}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedKasbon(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
            <View style={styles.modalGrabHandle} />

            <View style={styles.modalHeadBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeadTitle}>Detail & Jadwal Angsuran</Text>
                <Text style={styles.modalHeadSubtitle}>
                  {formatDate(selectedKasbon?.loan_date || selectedKasbon?.created_at)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseCircle}
                onPress={() => setSelectedKasbon(null)}
              >
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={[styles.centerLoading, { paddingVertical: 40 }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Memuat rincian & timeline...</Text>
              </View>
            ) : selectedKasbon ? (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBodyScroll}>
                {/* STATUS BADGE HERO */}
                {(() => {
                  const b = getStatusBadge(selectedKasbon.status);
                  return (
                    <View style={[styles.modalScoreHero, { backgroundColor: b.bg, borderColor: b.border }]}>
                      <Text style={[styles.modalScoreLarge, { color: b.text }]}>
                        {formatRupiah(selectedKasbon.amount)}
                      </Text>
                      <View style={[styles.modalPredBadge, { backgroundColor: b.text, marginTop: 6 }]}>
                        <Text style={styles.modalPredBadgeText}>{b.label}</Text>
                      </View>
                      <Text style={styles.modalStatusNote}>
                        Tenor: <Text style={{ fontWeight: 'bold' }}>{selectedKasbon.installment_count} Bulan</Text> • Tanggal: {formatDate(selectedKasbon.loan_date || selectedKasbon.created_at)}
                      </Text>
                    </View>
                  );
                })()}

                {/* PARAMETER STATS GRID */}
                <Text style={styles.modalSectionTitle}>Rincian Finansial Kasbon</Text>
                <View style={styles.modalStatsGrid}>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatTileVal}>{formatRupiah(selectedKasbon.amount)}</Text>
                    <Text style={styles.modalStatTileLbl}>Total Pinjaman</Text>
                  </View>

                  <View style={styles.modalStatTile}>
                    <Text style={[styles.modalStatTileVal, { color: '#059669' }]}>
                      {Number(selectedKasbon.monthly_deduction) > 0 ? formatRupiah(selectedKasbon.monthly_deduction) : 'Menunggu'}
                    </Text>
                    <Text style={styles.modalStatTileLbl}>Potongan/Bln</Text>
                  </View>

                  <View style={styles.modalStatTile}>
                    <Text style={[styles.modalStatTileVal, { color: '#ea580c' }]}>
                      {selectedKasbon.remaining_balance !== undefined ? formatRupiah(selectedKasbon.remaining_balance) : formatRupiah(selectedKasbon.amount)}
                    </Text>
                    <Text style={styles.modalStatTileLbl}>Sisa Tagihan</Text>
                  </View>
                </View>

                {/* RINCIAN PEMBAYARAN & RIWAYAT POTONGAN PAYROLL */}
                {(() => {
                  const isCompleted = selectedKasbon.status === 'completed' || selectedKasbon.status === 'paid' || selectedKasbon.status === 'lunas';
                  const totalTenor = Math.max(1, Number(selectedKasbon.installment_count) || 1);
                  const remBal = selectedKasbon.remaining_balance !== undefined ? Number(selectedKasbon.remaining_balance) : Number(selectedKasbon.amount);
                  const paidDiff = Math.max(0, Number(selectedKasbon.amount) - remBal);
                  const monthlyNominal = Number(selectedKasbon.monthly_deduction) > 0
                    ? Number(selectedKasbon.monthly_deduction)
                    : Math.round(Number(selectedKasbon.amount) / totalTenor);

                  let paidCount = 0;
                  if (isCompleted) {
                    paidCount = totalTenor;
                  } else if (Number(selectedKasbon.paid_installments_count) > 0) {
                    paidCount = Number(selectedKasbon.paid_installments_count);
                  } else if (selectedKasbon.payments && selectedKasbon.payments.length > 0) {
                    paidCount = selectedKasbon.payments.length;
                  } else if (monthlyNominal > 0 && paidDiff > 0) {
                    paidCount = Math.min(totalTenor, Math.round(paidDiff / monthlyNominal));
                  }

                  const displayPayments: KasbonPayment[] = (selectedKasbon.payments && selectedKasbon.payments.length > 0)
                    ? selectedKasbon.payments
                    : Array.from({ length: paidCount }, (_, idx) => ({
                      id: idx + 1,
                      amount: monthlyNominal,
                      notes: `Potongan Payroll Slip Gaji (Bulan ${idx + 1})`,
                      payment_date: selectedKasbon.updated_at || selectedKasbon.loan_date || selectedKasbon.created_at,
                    }));

                  return (
                    <>
                      {/* RINCIAN PEMBAYARAN / PROGRES TENOR CICILAN PER BULAN */}
                      <View style={styles.installmentTrackerCard}>
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.modalSectionTitle}>
                            Rincian Pembayaran ({paidCount}/{selectedKasbon.installment_count} Bulan)
                          </Text>
                          <Text style={styles.trackerSummaryBadge}>
                            {isCompleted ? 'LUNAS' : `Sisa ${Math.max(0, selectedKasbon.installment_count - paidCount)} Bln`}
                          </Text>
                        </View>

                        <View style={styles.tenorPillsGrid}>
                          {Array.from({ length: totalTenor }, (_, idx) => {
                            const installmentNo = idx + 1;
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
                                    <MaterialIcons name="check-circle" size={15} color="#166534" />
                                  ) : isCurrent ? (
                                    <MaterialIcons name="timelapse" size={15} color="#1d4ed8" />
                                  ) : (
                                    <MaterialIcons name="radio-button-unchecked" size={15} color="#94a3b8" />
                                  )}
                                </View>
                                <Text style={styles.tenorPillAmount}>{formatRupiah(monthlyNominal)}</Text>
                                <Text
                                  style={[
                                    styles.tenorPillStatus,
                                    isPaid && { color: '#166534', fontWeight: 'bold' },
                                    isCurrent && { color: '#1d4ed8', fontWeight: 'bold' },
                                  ]}
                                >
                                  {isPaid ? 'Lunas (Payroll)' : isCurrent ? 'Jatuh Tempo' : 'Belum Terpotong'}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>

                      {/* DAFTAR RIWAYAT TRANSAKSI PAYMENTS DARI DATABASE */}
                      <Text style={styles.modalSectionTitle}>
                        Riwayat Potongan Payroll ({displayPayments.length} Terbayar)
                      </Text>

                      {displayPayments.length > 0 ? (
                        displayPayments.map((p: KasbonPayment, idx: number) => (
                          <View key={p.id || idx} style={styles.paymentItemRow}>
                            <View style={styles.paymentNumCircle}>
                              <Text style={styles.paymentNumText}>{idx + 1}</Text>
                            </View>
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text style={styles.paymentDateText}>{formatDate(p.payment_date || p.created_at)}</Text>
                              <Text style={styles.paymentNotesText}>{p.notes || `Potongan Gaji Payroll (Bulan ${idx + 1})`}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={styles.paymentAmountText}>{formatRupiah(p.amount)}</Text>
                              <View style={styles.paymentPaidPill}>
                                <Text style={styles.paymentPaidPillText}>Lunas</Text>
                              </View>
                            </View>
                          </View>
                        ))
                      ) : (
                        <View style={styles.noPaymentsBox}>
                          <MaterialIcons name="schedule" size={24} color="#94a3b8" />
                          <Text style={styles.noPaymentsTitle}>Belum Ada Pembayaran</Text>
                          <Text style={styles.noPaymentsDesc}>
                            Potongan angsuran akan dimulai pada siklus penggajian payroll berikutnya.
                          </Text>
                        </View>
                      )}
                    </>
                  );
                })()}

                {/* CATATAN KEPERLUAN PENGAJUAN */}
                {selectedKasbon.notes ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.modalSectionTitle}>Keperluan / Catatan</Text>
                    <View style={styles.detailNotesCard}>
                      <Text style={styles.detailNotesContent}>"{selectedKasbon.notes}"</Text>
                    </View>
                  </View>
                ) : null}

                {/* CATATAN PERSONALIA */}
                {selectedKasbon.reason || selectedKasbon.approval_notes ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.modalSectionTitle}>Catatan Personalia</Text>
                    <View style={[styles.detailNotesCard, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                      <Text style={[styles.detailNotesContent, { color: '#b91c1c' }]}>
                        {selectedKasbon.reason || selectedKasbon.approval_notes}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={{ height: 40 }} />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },

  // Header Hero
  headerHeroContainer: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  headerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  backButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  headerActionPillText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
  },

  // Elevated Score Hero Card
  scoreHeroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  scoreHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gaugeOuter: {
    width: 90,
    height: 86,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
  },
  gaugeMainText: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 3,
  },
  gaugeScale: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#94a3b8',
    marginTop: 2,
    letterSpacing: 0.4,
  },
  heroRightContent: {
    flex: 1,
    marginLeft: 14,
  },
  heroPredicatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  heroPredicateText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  heroBalanceMain: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  heroPeriodNotice: {
    fontSize: 10.5,
    color: '#64748b',
    marginBottom: 8,
  },
  heroMiniCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroMiniCard: {
    flex: 1,
    alignItems: 'center',
  },
  heroMiniCardVal: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 1,
  },
  heroMiniCardLbl: {
    fontSize: 8.5,
    color: '#64748b',
    fontWeight: '500',
  },

  // Segmented Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: '#eff6ff',
  },
  tabLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748b',
  },
  tabLabelActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },

  // Content Scroll
  contentScroll: {
    flex: 1,
  },
  contentScrollInner: {
    padding: 16,
    flexGrow: 1,
  },
  centerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 12,
    fontWeight: '500',
  },

  // Lock Banner
  lockedKasbonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  lockedIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedBannerTitle: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 2,
  },
  lockedBannerDesc: {
    fontSize: 11.5,
    color: '#78350f',
    lineHeight: 16,
  },

  // Apply Button Card
  btnApplyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    elevation: 2,
  },
  btnApplyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnApplyTitle: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  btnApplySub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  cardActionArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },

  // Card Item
  cardItem: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardMonthTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  cardMonthText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginRight: 6,
  },
  cardYearText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  cardWorkingDaysText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: 'bold',
  },

  // Nominal Banner
  scoreBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    marginBottom: 12,
  },
  scoreBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreBigNum: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  scoreBannerLbl: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  scoreBannerPredicate: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginTop: 1,
  },

  // Card Stepper Timeline
  cardTimelineContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardTimelineStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineStepItem: {
    alignItems: 'center',
    width: 60,
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepCircleDone: {
    backgroundColor: '#10b981',
  },
  stepCircleActive: {
    backgroundColor: '#f59e0b',
  },
  stepCirclePending: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  stepNumberPending: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94a3b8',
  },
  stepLabelDone: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#10b981',
    textAlign: 'center',
  },
  stepLabelActive: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#f59e0b',
    textAlign: 'center',
  },
  stepLabelPending: {
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
  },
  timelineConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 16,
  },
  timelineConnectorDone: {
    backgroundColor: '#10b981',
  },
  cardInstallmentProgressWrap: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
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
    marginTop: 4,
  },
  progressCountText: {
    fontSize: 10.5,
    color: '#64748b',
    fontWeight: '600',
  },
  progressBalanceText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  cardRejectedTimelineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  cardRejectedTimelineText: {
    fontSize: 11,
    color: '#dc2626',
    marginLeft: 6,
  },

  // 4 Mini Stat Badges
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statCell: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  statCellVal: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  statCellLbl: {
    fontSize: 9.5,
    color: '#64748b',
  },

  notesBox: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  notesBoxTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#475569',
  },
  notesBoxContent: {
    fontSize: 11.5,
    color: '#334155',
    fontStyle: 'italic',
    marginTop: 1,
  },

  // Action Row
  cardActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  btnCancelPending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  btnCancelPendingText: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
    marginRight: 8,
  },

  // Modal / Bottom Sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
  },
  modalGrabHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeadBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalHeadTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  modalHeadSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBodyScroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  modalScoreHero: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
  },
  modalScoreLarge: {
    fontSize: 26,
    fontWeight: '900',
  },
  modalPredBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  modalPredBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalStatusNote: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 6,
  },
  modalSectionTitle: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#0f172a',
    marginVertical: 10,
  },
  modalStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalStatTile: {
    width: '33.33%',
    padding: 8,
    alignItems: 'center',
  },
  modalStatTileVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
  },
  modalStatTileLbl: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },

  // Form Controls in Modal
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 6,
  },
  currencyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginRight: 6,
  },
  currencyInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    paddingVertical: 10,
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  quickAmountChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickAmountChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  quickAmountChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  quickAmountChipTextActive: {
    color: '#ffffff',
  },
  tenorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tenorChip: {
    width: (width - 64) / 4,
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tenorChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tenorChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  tenorChipTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  simulationCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  simulationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  simulationTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginLeft: 6,
  },
  simulationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
  },
  simulationLabel: {
    fontSize: 12,
    color: '#475569',
  },
  simulationValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  accountingNoticeBox: {
    flexDirection: 'row',
    marginTop: 8,
  },
  simulationNotes: {
    flex: 1,
    fontSize: 11,
    color: '#1e40af',
    lineHeight: 16,
  },
  notesTextarea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 80,
  },
  btnSubmitForm: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 10,
    elevation: 3,
  },
  btnSubmitText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Payment List in Detail Modal
  installmentTrackerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackerSummaryBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.primary,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tenorPillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tenorPill: {
    width: '48.5%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  tenorPillPaid: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  tenorPillCurrent: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  tenorPillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tenorPillNumber: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  tenorPillTextHighlight: {
    fontWeight: 'bold',
  },
  tenorPillAmount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
    marginVertical: 2,
  },
  tenorPillStatus: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
  },
  detailNotesCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailNotesContent: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
  },
  paymentItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentNumCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentNumText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  paymentDateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  paymentNotesText: {
    fontSize: 10.5,
    color: '#64748b',
  },
  paymentAmountText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#059669',
  },
  paymentPaidPill: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginTop: 2,
  },
  paymentPaidPillText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#166534',
  },
  noPaymentsBox: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  noPaymentsTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
    marginTop: 6,
  },
  noPaymentsDesc: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 20,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
