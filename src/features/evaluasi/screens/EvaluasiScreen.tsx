import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../core/theme';
import { useToast } from '../../../core/ToastContext';
import { evaluasiService } from '../services/evaluasiService';
import {
  AnnualRekapData,
  KedisiplinanSummary,
  MonthDetailKedisiplinan,
  MonthlyKedisiplinan,
} from '../types';

const { width } = Dimensions.get('window');

type ActiveTab = 'bulanan' | 'rekap_tahunan';

export default function EvaluasiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [yearPickerVisible, setYearPickerVisible] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('bulanan');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Data Bulanan & Summary
  const [summary, setSummary] = useState<KedisiplinanSummary | null>(null);
  const [monthlyList, setMonthlyList] = useState<MonthlyKedisiplinan[]>([]);

  // Detail Modal Bulanan
  const [selectedMonthDetail, setSelectedMonthDetail] = useState<MonthDetailKedisiplinan | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState<boolean>(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // Data Rekap Tahunan
  const [annualRekap, setAnnualRekap] = useState<AnnualRekapData | null>(null);

  const availableYears = useMemo(() => {
    return [currentYear, currentYear - 1, currentYear - 2];
  }, [currentYear]);

  // Load Main Data
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const res = await evaluasiService.getMyKedisiplinan(selectedYear);
      setSummary(res.summary);
      setMonthlyList(res.data || []);

      // Silently fetch rekap tahunan
      evaluasiService.getAnnualRekap(selectedYear)
        .then(rekapRes => setAnnualRekap(rekapRes))
        .catch(() => {});
    } catch (err: any) {
      showToast({
        title: 'Gagal Memuat Evaluasi',
        message: err.message || 'Terjadi kesalahan saat memuat data evaluasi.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedYear, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Detail Modal Bulanan
  const handleOpenMonthDetail = async (month: number, isApproved = true) => {
    if (!isApproved) {
      showToast({
        title: 'Dalam Masa Pemantauan',
        message: 'Bulan ini sedang masa penilaian dan pemantauan pekerjaan Anda oleh manajemen.',
        type: 'info',
      });
      return;
    }

    setIsLoadingDetail(true);
    setDetailModalVisible(true);
    try {
      const detail = await evaluasiService.getMonthDetail(selectedYear, month);
      setSelectedMonthDetail(detail);
    } catch (err: any) {
      showToast({
        title: 'Gagal Memuat Detail',
        message: err.message || 'Tidak dapat memuat detail evaluasi bulan ini.',
        type: 'error',
      });
      setDetailModalVisible(false);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Convert Predicate / Score to Star Count (1 - 5)
  const getStarCount = (predicate: string = '', score: number = 0): number => {
    const p = predicate.toLowerCase();
    if (p.includes('sangat') || score >= 90) return 5;
    if (p.includes('disiplin') && !p.includes('tidak') && !p.includes('kurang') && !p.includes('cukup')) return 4;
    if (p.includes('cukup') || (score >= 70 && score < 80)) return 3;
    if (p.includes('kurang') || (score >= 50 && score < 70)) return 2;
    return 1;
  };

  // Render Stars Component
  const renderStars = (starCount: number, size = 18, activeColor = '#f59e0b', inactiveColor = '#cbd5e1') => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <MaterialIcons
            key={i}
            name={i <= starCount ? 'star' : 'star-border'}
            size={size}
            color={i <= starCount ? activeColor : inactiveColor}
            style={{ marginHorizontal: 1 }}
          />
        ))}
      </View>
    );
  };

  // Predicate Theme Helper with modern pastel and vibrant contrast
  const getPredicateTheme = (predicate: string = '', score: number = 0) => {
    const p = predicate.toLowerCase();
    if (p.includes('sangat') || score >= 90) {
      return {
        bg: '#ecfdf5',
        border: '#a7f3d0',
        text: '#059669',
        badgeBg: '#10b981',
        icon: 'verified',
        label: 'Sangat Disiplin',
        stars: 5,
      };
    }
    if (p.includes('disiplin') && !p.includes('tidak') && !p.includes('kurang') && !p.includes('cukup')) {
      return {
        bg: '#eff6ff',
        border: '#bfdbfe',
        text: '#2563eb',
        badgeBg: '#3b82f6',
        icon: 'thumb-up',
        label: 'Disiplin',
        stars: 4,
      };
    }
    if (p.includes('cukup') || (score >= 70 && score < 80)) {
      return {
        bg: '#fffbeb',
        border: '#fde68a',
        text: '#d97706',
        badgeBg: '#f59e0b',
        icon: 'info',
        label: 'Cukup Disiplin',
        stars: 3,
      };
    }
    if (p.includes('kurang') || (score >= 50 && score < 70)) {
      return {
        bg: '#fff7ed',
        border: '#fed7aa',
        text: '#ea580c',
        badgeBg: '#f97316',
        icon: 'warning',
        label: 'Kurang Disiplin',
        stars: 2,
      };
    }
    // Tidak Disiplin / Rendah
    return {
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#dc2626',
      badgeBg: '#ef4444',
      icon: 'report-problem',
      label: 'Tidak Disiplin',
      stars: 1,
    };
  };

  const sanitizeText = (str?: string | null) => {
    if (!str) return '';
    return str
      .replace(/PT\.?\s*Pagaruyung\s*(Diesel)?/gi, '')
      .replace(/Pagaruyung\s*Diesel/gi, '')
      .replace(/Pagaruyung/gi, '')
      .replace(/Diesel/gi, '')
      .replace(/Owner/gi, 'Personalia')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const getStatusBadge = (status: string = '', label?: string) => {
    const isApproved = status.toLowerCase() === 'approved';
    const cleanLabel = label ? sanitizeText(label) : undefined;
    return {
      text: cleanLabel || (isApproved ? 'Disahkan Personalia' : 'Menunggu Validasi'),
      bg: isApproved ? '#ede9fe' : '#fef3c7',
      color: isApproved ? '#6d28d9' : '#b45309',
      border: isApproved ? '#ddd6fe' : '#fde68a',
      icon: isApproved ? 'verified' : 'schedule',
      isApproved,
    };
  };

  const heroTheme = summary
    ? getPredicateTheme(summary.annual_predicate, summary.avg_score)
    : getPredicateTheme('', 0);

  return (
    <View style={styles.rootWrapper}>
      {/* 1. TOP HEADER (Deep Corporate Blue) */}
      <View style={[styles.headerHeroContainer, { paddingTop: Math.max(insets.top + 8, 20) }]}>
        <View style={styles.headerTopBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
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
              <Text style={styles.headerTitle}>Penilaian Kinerja</Text>
            </View>
          </View>

          {/* Year Selector Button */}
          <TouchableOpacity
            style={styles.yearPill}
            onPress={() => setYearPickerVisible(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="event" size={16} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.yearPillText}>Tahun {selectedYear}</Text>
            <MaterialIcons name="expand-more" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* 2. ELEVATED SCORECARD HERO (Gleaming Star Rating Card) */}
        {summary ? (
          <View style={styles.scoreHeroCard}>
            <View style={styles.scoreHeroRow}>
              {/* Star Showcase Left */}
              <View style={[styles.gaugeOuter, { borderColor: heroTheme.border, backgroundColor: heroTheme.bg }]}>
                {renderStars(heroTheme.stars, 16, '#f59e0b', '#cbd5e1')}
                <Text style={[styles.starCountLabel, { color: heroTheme.text }]}>
                  {heroTheme.stars} Bintang
                </Text>
                <Text style={styles.gaugeScale}>PREDIKAT TAHUNAN</Text>
              </View>

              {/* Predicate & Summary */}
              <View style={styles.heroRightContent}>
                <View style={[styles.heroPredicatePill, { backgroundColor: heroTheme.badgeBg }]}>
                  <MaterialIcons name={heroTheme.icon as any} size={14} color="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.heroPredicateText}>
                    {summary.annual_predicate || 'Belum Ada Penilaian'}
                  </Text>
                </View>

                <Text style={styles.heroPeriodNotice}>
                  Rangkuman dari <Text style={{ fontWeight: 'bold', color: '#1e293b' }}>{summary.final_months_count} bulan</Text> disahkan di {selectedYear}
                </Text>

                {/* 3 Metric Pills */}
                <View style={styles.heroMiniCardsRow}>
                  <View style={styles.heroMiniCard}>
                    <MaterialIcons name="schedule" size={14} color="#ea580c" />
                    <Text style={styles.heroMiniCardVal}>{summary.total_late_count}x</Text>
                    <Text style={styles.heroMiniCardLbl}>Telat</Text>
                  </View>

                  <View style={styles.heroMiniCard}>
                    <MaterialIcons name="timelapse" size={14} color="#d97706" />
                    <Text style={styles.heroMiniCardVal}>{summary.total_late_minutes}m</Text>
                    <Text style={styles.heroMiniCardLbl}>Durasi</Text>
                  </View>

                  <View style={styles.heroMiniCard}>
                    <MaterialIcons name="error-outline" size={14} color="#dc2626" />
                    <Text style={styles.heroMiniCardVal}>{summary.total_incomplete}</Text>
                    <Text style={styles.heroMiniCardLbl}>No Out</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* 3. SEGMENTED TABS CONTROLLER (Balanced 2 Tabs) */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'bulanan' && styles.tabItemActive]}
            onPress={() => setActiveTab('bulanan')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="calendar-view-month"
              size={18}
              color={activeTab === 'bulanan' ? theme.colors.primary : '#64748b'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabLabel, activeTab === 'bulanan' && styles.tabLabelActive]}>
              Rapor Bulanan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'rekap_tahunan' && styles.tabItemActive]}
            onPress={() => setActiveTab('rekap_tahunan')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="pie-chart"
              size={18}
              color={activeTab === 'rekap_tahunan' ? theme.colors.primary : '#64748b'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabLabel, activeTab === 'rekap_tahunan' && styles.tabLabelActive]}>
              Rekap 12 Bulan
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. CONTENT BODY */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Memuat penilaian kinerja...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentScrollInner}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={true}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* TAB 1: RAPOR BULANAN */}
          {activeTab === 'bulanan' && (
            <View>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Daftar Rapor Bulanan</Text>
                  <Text style={styles.sectionSubtitle}>Hasil penilaian resmi & catatan pengesahan Personalia</Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{monthlyList.length} Periode</Text>
                </View>
              </View>

              {monthlyList.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="assignment-late" size={54} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>Belum Ada Evaluasi</Text>
                  <Text style={styles.emptyDesc}>
                    Penilaian kinerja untuk tahun {selectedYear} belum diterbitkan oleh bagian HRD.
                  </Text>
                </View>
              ) : (
                monthlyList.map((item) => {
                  const statusInfo = getStatusBadge(item.status, item.status_label);
                  const isApproved = statusInfo.isApproved;
                  const pTheme = getPredicateTheme(item.predicate, item.score);
                  const stars = getStarCount(item.predicate, item.score);

                  // JIKA BULAN INI BELUM DI-VALIDASI / BELUM DISAHKAN: TAMPILKAN KARTU MASA PEMANTAUAN
                  if (!isApproved) {
                    return (
                      <View key={item.id || item.month} style={styles.monitoringCard}>
                        {/* Header Status */}
                        <View style={styles.monitoringHeader}>
                          <View style={styles.cardMonthTitleRow}>
                            <Text style={styles.cardMonthText}>{item.month_name}</Text>
                            <Text style={styles.cardYearText}>{item.year}</Text>
                          </View>
                          <View style={styles.monitoringPill}>
                            <MaterialIcons name="hourglass-empty" size={13} color="#d97706" style={{ marginRight: 4 }} />
                            <Text style={styles.monitoringPillText}>Masa Pemantauan</Text>
                          </View>
                        </View>

                        {/* Notice Body */}
                        <View style={styles.monitoringNoticeBox}>
                          <View style={styles.monitoringIconWrap}>
                            <MaterialIcons name="insights" size={24} color="#d97706" />
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.monitoringTitle}>Sedang Masa Penilaian</Text>
                            <Text style={styles.monitoringDesc}>
                              Bulan ini sedang masa penilaian dan pemantauan pekerjaan Anda. Rapor evaluasi dan bintang kinerja akan diterbitkan setelah periode disahkan oleh Personalia.
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  }

                  // JIKA SUDAH DISAHKAN: TAMPILKAN RAPOR DENGAN BINTANG (TANPA ANGKA SKOR)
                  return (
                    <TouchableOpacity
                      key={item.id || item.month}
                      style={styles.cardItem}
                      onPress={() => handleOpenMonthDetail(item.month, true)}
                      activeOpacity={0.88}
                    >
                      {/* Top Header Row of Card */}
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={styles.cardMonthTitleRow}>
                            <Text style={styles.cardMonthText}>{item.month_name}</Text>
                            <Text style={styles.cardYearText}>{item.year}</Text>
                          </View>
                          <Text style={styles.cardWorkingDaysText}>
                            {item.present_days} dari {item.total_work_days} Hari Hadir ({item.consistency_pct}%)
                          </Text>
                        </View>

                        {/* Status Approval Pill */}
                        <View style={[styles.statusPill, { backgroundColor: statusInfo.bg, borderColor: statusInfo.border }]}>
                          <MaterialIcons name={statusInfo.icon as any} size={13} color={statusInfo.color} style={{ marginRight: 4 }} />
                          <Text style={[styles.statusPillText, { color: statusInfo.color }]}>
                            {statusInfo.text}
                          </Text>
                        </View>
                      </View>

                      {/* Main Star & Predicate Highlight Banner (Bintang, Bukan Skor Angka) */}
                      <View style={[styles.scoreBanner, { backgroundColor: pTheme.bg, borderColor: pTheme.border }]}>
                        <View style={styles.scoreBannerLeft}>
                          {renderStars(stars, 22, '#f59e0b', '#cbd5e1')}
                          <View style={{ marginLeft: 10 }}>
                            <Text style={styles.scoreBannerLbl}>PENILAIAN KINERJA</Text>
                            <Text style={[styles.scoreBannerPredicate, { color: pTheme.text }]}>
                              {item.predicate}
                            </Text>
                          </View>
                        </View>
                        <MaterialIcons name={pTheme.icon as any} size={26} color={pTheme.text} />
                      </View>

                      {/* Attendance Consistency Progress Bar */}
                      <View style={styles.progressContainer}>
                        <View style={styles.progressHeader}>
                          <Text style={styles.progressLabel}>Tingkat Kehadiran Kerja</Text>
                          <Text style={styles.progressPercent}>{item.consistency_pct}%</Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressBar,
                              {
                                width: `${Math.min(Math.max(item.consistency_pct, 4), 100)}%`,
                                backgroundColor: item.consistency_pct >= 80 ? '#10b981' : item.consistency_pct >= 50 ? '#f59e0b' : '#ef4444',
                              }
                            ]}
                          />
                        </View>
                      </View>

                      {/* 4 Mini Stat Badges */}
                      <View style={styles.statGrid}>
                        <View style={styles.statCell}>
                          <MaterialCommunityIcons name="clock-alert-outline" size={17} color="#ea580c" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.statCellVal}>{item.late_count}x ({item.total_late_minutes}m)</Text>
                            <Text style={styles.statCellLbl}>Terlambat</Text>
                          </View>
                        </View>

                        <View style={styles.statCell}>
                          <MaterialCommunityIcons name="account-cancel-outline" size={17} color="#dc2626" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.statCellVal}>{item.absent_count} Hari</Text>
                            <Text style={styles.statCellLbl}>Alpha / Mangkir</Text>
                          </View>
                        </View>

                        <View style={styles.statCell}>
                          <MaterialCommunityIcons name="logout" size={17} color="#d97706" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.statCellVal}>{item.incomplete_count} Hari</Text>
                            <Text style={styles.statCellLbl}>No Checkout</Text>
                          </View>
                        </View>

                        <View style={styles.statCell}>
                          <MaterialCommunityIcons name="beach" size={17} color="#059669" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.statCellVal}>{item.leave_count} Hari</Text>
                            <Text style={styles.statCellLbl}>Cuti / Izin</Text>
                          </View>
                        </View>
                      </View>

                      {/* Touch for Details CTA */}
                      <View style={styles.cardActionRow}>
                        <Text style={styles.cardActionText}>Buka Rincian Log Harian & Snapshot</Text>
                        <View style={styles.cardActionArrow}>
                          <MaterialIcons name="arrow-forward" size={14} color="#ffffff" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 2: REKAP 12 BULAN TAHUNAN */}
          {activeTab === 'rekap_tahunan' && annualRekap && (
            <View>
              {/* 3 Metric High-Level Pills (Bintang & Predikat, Tanpa Angka Skor) */}
              <View style={styles.annualMetricRow}>
                <View style={styles.annualMetricCard}>
                  <Text style={styles.annualMetricLabel}>PREDIKAT TAHUNAN</Text>
                  <View style={{ marginVertical: 6 }}>
                    {renderStars(heroTheme.stars, 14, '#f59e0b', '#cbd5e1')}
                  </View>
                  <Text style={styles.annualMetricSub}>{annualRekap.data.annual_predicate || 'Belum Ada'}</Text>
                </View>

                <View style={styles.annualMetricCard}>
                  <Text style={styles.annualMetricLabel}>BULAN DISAHKAN</Text>
                  <Text style={[styles.annualMetricValue, { color: '#059669' }]}>
                    {annualRekap.data.final_months_count}
                  </Text>
                  <Text style={styles.annualMetricSub}>Bulan Selesai</Text>
                </View>

                <View style={styles.annualMetricCard}>
                  <Text style={styles.annualMetricLabel}>STATUS PENILAIAN</Text>
                  <MaterialCommunityIcons name="shield-check" size={24} color="#4f46e5" style={{ marginVertical: 2 }} />
                  <Text style={styles.annualMetricSub}>Aktif Memantau</Text>
                </View>
              </View>

              {/* 12-Month Matrix Visual Grid */}
              <View style={styles.matrixContainer}>
                <View style={styles.matrixHeaderRow}>
                  <View>
                    <Text style={styles.matrixMainTitle}>Kalender Rapor 12 Bulan</Text>
                    <Text style={styles.matrixSubTitle}>Ketuk bulan bertanda untuk melihat detailnya</Text>
                  </View>
                  <MaterialIcons name="grid-on" size={20} color={theme.colors.primary} />
                </View>

                <View style={styles.matrixGrid}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const monthData = annualRekap.data.months[String(m)];
                    const monthShortName = [
                      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
                    ][m - 1];

                    const isApproved = Boolean(monthData && monthData.is_approved);
                    const isDraft = Boolean(monthData && !monthData.is_approved);

                    const pTheme = isApproved && monthData
                      ? getPredicateTheme(monthData.predicate, monthData.score)
                      : isDraft
                        ? { bg: '#fffbeb', border: '#fde68a', text: '#d97706', stars: 0 }
                        : { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8', stars: 0 };

                    return (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.matrixCell,
                          {
                            backgroundColor: pTheme.bg,
                            borderColor: pTheme.border,
                            opacity: monthData ? 1 : 0.45,
                          }
                        ]}
                        disabled={!monthData}
                        onPress={() => handleOpenMonthDetail(m, isApproved)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.matrixCellMonth}>{monthShortName}</Text>
                        {isApproved && monthData ? (
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                              <MaterialIcons name="star" size={13} color="#f59e0b" />
                              <Text style={[styles.matrixStarNum, { color: pTheme.text }]}>
                                {pTheme.stars}
                              </Text>
                            </View>
                            <View style={[styles.matrixMiniDot, { backgroundColor: '#10b981' }]} />
                          </>
                        ) : isDraft ? (
                          <>
                            <MaterialIcons name="hourglass-empty" size={13} color="#d97706" style={{ marginTop: 4 }} />
                            <Text style={styles.matrixDraftLabel} numberOfLines={1}>Pantau</Text>
                          </>
                        ) : (
                          <Text style={styles.matrixCellEmpty}>-</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Predicate Counts Breakdown (Bintang) */}
              <View style={styles.distributionCard}>
                <Text style={styles.distributionTitle}>Distribusi Predikat Tahunan</Text>

                <View style={styles.distRow}>
                  <View style={styles.distStarsWrap}>{renderStars(5, 14, '#10b981')}</View>
                  <Text style={styles.distLabel}>Sangat Disiplin (5 Bintang)</Text>
                  <Text style={styles.distValue}>{annualRekap.data.predicate_counts.sangat_disiplin} Bulan</Text>
                </View>

                <View style={styles.distRow}>
                  <View style={styles.distStarsWrap}>{renderStars(4, 14, '#3b82f6')}</View>
                  <Text style={styles.distLabel}>Disiplin (4 Bintang)</Text>
                  <Text style={styles.distValue}>{annualRekap.data.predicate_counts.disiplin} Bulan</Text>
                </View>

                <View style={styles.distRow}>
                  <View style={styles.distStarsWrap}>{renderStars(3, 14, '#f59e0b')}</View>
                  <Text style={styles.distLabel}>Cukup Disiplin (3 Bintang)</Text>
                  <Text style={styles.distValue}>{annualRekap.data.predicate_counts.cukup_disiplin} Bulan</Text>
                </View>

                <View style={styles.distRow}>
                  <View style={styles.distStarsWrap}>{renderStars(2, 14, '#ea580c')}</View>
                  <Text style={styles.distLabel}>Kurang Disiplin (2 Bintang)</Text>
                  <Text style={styles.distValue}>{annualRekap.data.predicate_counts.kurang_disiplin} Bulan</Text>
                </View>

                <View style={styles.distRow}>
                  <View style={styles.distStarsWrap}>{renderStars(1, 14, '#ef4444')}</View>
                  <Text style={styles.distLabel}>Tidak Disiplin (1 Bintang)</Text>
                  <Text style={styles.distValue}>{annualRekap.data.predicate_counts.tidak_disiplin} Bulan</Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      )}

      {/* 5. DETAIL MODAL BULANAN SAYA (Bintang, Tanpa Angka Skor) */}
      <Modal
        visible={detailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {/* Grab Handle */}
            <View style={styles.modalGrabHandle} />

            {/* Modal Header */}
            <View style={styles.modalHeadBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeadTitle}>Detail Rapor Evaluasi</Text>
                <Text style={styles.modalHeadSubtitle}>
                  {selectedMonthDetail ? `${selectedMonthDetail.month_name} ${selectedMonthDetail.year}` : 'Memuat data...'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseCircle}
                onPress={() => setDetailModalVisible(false)}
              >
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {isLoadingDetail || !selectedMonthDetail ? (
              <View style={[styles.centerLoading, { paddingVertical: 40 }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Memuat detail penilaian...</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalBodyScroll} showsVerticalScrollIndicator={false}>
                {/* Hero Star Rating in Modal */}
                <View style={[
                  styles.modalScoreHero,
                  {
                    backgroundColor: getPredicateTheme(selectedMonthDetail.predicate, selectedMonthDetail.score).bg,
                    borderColor: getPredicateTheme(selectedMonthDetail.predicate, selectedMonthDetail.score).border,
                  }
                ]}>
                  {renderStars(getStarCount(selectedMonthDetail.predicate, selectedMonthDetail.score), 28, '#f59e0b', '#cbd5e1')}
                  <View style={[
                    styles.modalPredBadge,
                    { backgroundColor: getPredicateTheme(selectedMonthDetail.predicate, selectedMonthDetail.score).badgeBg, marginTop: 8 }
                  ]}>
                    <Text style={styles.modalPredBadgeText}>{selectedMonthDetail.predicate}</Text>
                  </View>
                  <Text style={styles.modalStatusNote}>
                    Status: <Text style={{ fontWeight: 'bold' }}>{selectedMonthDetail.status_label || selectedMonthDetail.status}</Text>
                  </Text>
                </View>

                {/* Parameter Evaluasi Summary */}
                <Text style={styles.modalSectionTitle}>Parameter Evaluasi Presensi</Text>
                <View style={styles.modalStatsGrid}>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatTileVal}>
                      {selectedMonthDetail.present_days}/{selectedMonthDetail.total_work_days}
                    </Text>
                    <Text style={styles.modalStatTileLbl}>Hari Hadir</Text>
                  </View>

                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatTileVal}>{selectedMonthDetail.consistency_pct}%</Text>
                    <Text style={styles.modalStatTileLbl}>Konsistensi</Text>
                  </View>

                  <View style={styles.modalStatTile}>
                    <Text style={[styles.modalStatTileVal, { color: '#ea580c' }]}>
                      {selectedMonthDetail.late_count}x ({selectedMonthDetail.total_late_minutes}m)
                    </Text>
                    <Text style={styles.modalStatTileLbl}>Terlambat</Text>
                  </View>

                  <View style={styles.modalStatTile}>
                    <Text style={[styles.modalStatTileVal, { color: '#dc2626' }]}>
                      {selectedMonthDetail.absent_count} Hari
                    </Text>
                    <Text style={styles.modalStatTileLbl}>Alpha / Mangkir</Text>
                  </View>

                  <View style={styles.modalStatTile}>
                    <Text style={[styles.modalStatTileVal, { color: '#d97706' }]}>
                      {selectedMonthDetail.incomplete_count} Hari
                    </Text>
                    <Text style={styles.modalStatTileLbl}>Tanpa Checkout</Text>
                  </View>

                  <View style={styles.modalStatTile}>
                    <Text style={[styles.modalStatTileVal, { color: '#059669' }]}>
                      {selectedMonthDetail.leave_count} Hari
                    </Text>
                    <Text style={styles.modalStatTileLbl}>Cuti / Izin</Text>
                  </View>
                </View>

                {/* Log Presensi Harian Timeline */}
                <Text style={styles.modalSectionTitle}>
                  Log Kehadiran Harian ({selectedMonthDetail.attendance_logs?.length || 0} Hari Masuk)
                </Text>

                {selectedMonthDetail.attendance_logs && selectedMonthDetail.attendance_logs.length > 0 ? (
                  selectedMonthDetail.attendance_logs.map((log, idx) => {
                    const isLate = log.is_late;
                    const isIncomplete = log.is_incomplete;
                    const dateObj = new Date(log.date);
                    const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
                    const dateNum = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

                    return (
                      <View key={idx} style={styles.timelineItem}>
                        {/* Date Pillar */}
                        <View style={styles.timelineDateBox}>
                          <Text style={styles.timelineDateNum}>{dateNum}</Text>
                          <Text style={styles.timelineDayName}>{dayName}</Text>
                        </View>

                        {/* Clock In / Out Details */}
                        <View style={styles.timelineContent}>
                          <View style={styles.timelineTimeRow}>
                            <View style={styles.timeTag}>
                              <MaterialIcons name="login" size={13} color="#059669" style={{ marginRight: 4 }} />
                              <Text style={styles.timeTagText}>
                                {log.clock_in ? log.clock_in.substring(0, 5) : '--:--'}
                              </Text>
                            </View>

                            <MaterialIcons name="arrow-right-alt" size={16} color="#94a3b8" style={{ marginHorizontal: 4 }} />

                            <View style={styles.timeTag}>
                              <MaterialIcons name="logout" size={13} color="#dc2626" style={{ marginRight: 4 }} />
                              <Text style={styles.timeTagText}>
                                {log.clock_out ? log.clock_out.substring(0, 5) : '--:--'}
                              </Text>
                            </View>
                          </View>

                          {/* Pill Indicators */}
                          <View style={styles.timelinePillRow}>
                            {isLate ? (
                              <View style={[styles.timelinePill, { backgroundColor: '#fee2e2' }]}>
                                <Text style={[styles.timelinePillText, { color: '#dc2626' }]}>
                                  Telat {log.late_minutes} Menit
                                </Text>
                              </View>
                            ) : (
                              <View style={[styles.timelinePill, { backgroundColor: '#dcfce7' }]}>
                                <Text style={[styles.timelinePillText, { color: '#166534' }]}>
                                  Tepat Waktu
                                </Text>
                              </View>
                            )}

                            {isIncomplete ? (
                              <View style={[styles.timelinePill, { backgroundColor: '#fef3c7', marginLeft: 4 }]}>
                                <Text style={[styles.timelinePillText, { color: '#b45309' }]}>
                                  No Checkout
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyLogsText}>Tidak ada catatan log harian.</Text>
                )}

                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 6. YEAR PICKER MODAL */}
      <Modal
        visible={yearPickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setYearPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setYearPickerVisible(false)}
        >
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Pilih Tahun Penilaian</Text>
            {availableYears.map((yr) => {
              const isSelected = yr === selectedYear;
              return (
                <TouchableOpacity
                  key={yr}
                  style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedYear(yr);
                    setYearPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
                    Tahun {yr}
                  </Text>
                  {isSelected ? (
                    <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },

  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  yearPillText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '700',
  },
  backButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -4,
  },

  // Elevated Hero Scorecard
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
    width: 100,
    height: 86,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
  },
  starCountLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  gaugeScale: {
    fontSize: 8,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 6,
  },
  heroPredicateText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  heroPeriodNotice: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8,
  },
  heroMiniCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroMiniCard: {
    flex: 1,
    alignItems: 'center',
  },
  heroMiniCardVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 1,
  },
  heroMiniCardLbl: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: '500',
  },

  // Segmented Tabs (2 Tabs Balanced)
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
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: '#eff6ff',
  },
  tabLabel: {
    fontSize: 13,
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

  // Card Item (Bulanan Approved)
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginRight: 6,
  },
  cardYearText: {
    fontSize: 13,
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

  // Card Item (Masa Pemantauan - Belum di-validasi)
  monitoringCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  monitoringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monitoringPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  monitoringPillText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#b45309',
  },
  monitoringNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  monitoringIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monitoringTitle: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 3,
  },
  monitoringDesc: {
    fontSize: 11.5,
    color: '#78350f',
    lineHeight: 17,
  },

  // Score Banner in Card (Stars Display)
  scoreBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  scoreBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreBannerLbl: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  scoreBannerPredicate: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 1,
  },

  // Progress Bar
  progressContainer: {
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  progressPercent: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
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
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  statCellLbl: {
    fontSize: 9.5,
    color: '#64748b',
  },

  // Owner Review Box
  ownerReviewBox: {
    flexDirection: 'row',
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    marginBottom: 12,
  },
  ownerReviewText: {
    fontSize: 11.5,
    color: '#4c1d95',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  ownerReviewDate: {
    fontSize: 9.5,
    color: '#7c3aed',
    marginTop: 4,
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
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  cardActionArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Tab 2: Profile & Matrix
  profileBadgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  profileAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBadgeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  profileBadgeNik: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  profileBranchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  profileBranchText: {
    fontSize: 11.5,
    color: theme.colors.primary,
    fontWeight: '600',
  },

  annualMetricRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  annualMetricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
  },
  annualMetricLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  annualMetricValue: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.colors.primary,
    marginVertical: 4,
  },
  annualMetricSub: {
    fontSize: 10.5,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
  },

  matrixContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  matrixMainTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  matrixSubTitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  matrixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  matrixCell: {
    width: (width - 64) / 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    marginBottom: 8,
  },
  matrixCellMonth: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#334155',
  },
  matrixStarNum: {
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  matrixDraftLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#b45309',
    marginTop: 2,
  },
  matrixMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
  },
  matrixCellEmpty: {
    fontSize: 14,
    color: '#cbd5e1',
    marginTop: 4,
  },

  distributionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  distributionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 12,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  distStarsWrap: {
    width: 90,
  },
  distLabel: {
    flex: 1,
    fontSize: 11.5,
    color: '#334155',
    marginLeft: 6,
  },
  distValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
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
    maxHeight: '90%',
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
  modalOwnerCard: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  modalOwnerTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#3730a3',
  },
  modalOwnerText: {
    fontSize: 12.5,
    color: '#4338ca',
    fontStyle: 'italic',
    marginTop: 2,
    lineHeight: 18,
  },
  modalOwnerDate: {
    fontSize: 10,
    color: '#6366f1',
    marginTop: 4,
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
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  modalStatTileLbl: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },

  // Timeline List
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timelineDateBox: {
    width: 60,
    alignItems: 'center',
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
  },
  timelineDateNum: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  timelineDayName: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
  },
  timelineTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timeTagText: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#334155',
  },
  timelinePillRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  timelinePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timelinePillText: {
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  emptyLogsText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginVertical: 10,
  },

  // Year Picker
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    width: '85%',
    elevation: 6,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 14,
    textAlign: 'center',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerItemActive: {
    backgroundColor: '#eff6ff',
  },
  pickerItemText: {
    fontSize: 14,
    color: '#334155',
  },
  pickerItemTextActive: {
    fontWeight: 'bold',
    color: theme.colors.primary,
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
