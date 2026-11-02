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
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../core/theme';
import { useToast } from '../../../core/ToastContext';
import { evaluasiService } from '../services/evaluasiService';
import {
  MonthlyKedisiplinan,
  KedisiplinanSummary,
  MonthDetailKedisiplinan,
  AnnualRekapData,
  TeamMemberKedisiplinan,
} from '../types';

const { width } = Dimensions.get('window');

type ActiveTab = 'bulanan' | 'rekap_tahunan' | 'tim_cabang';

export default function EvaluasiScreen() {
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

  // Data Tim Cabang
  const [teamMonth, setTeamMonth] = useState<number>(new Date().getMonth() + 1);
  const [teamList, setTeamList] = useState<TeamMemberKedisiplinan[]>([]);
  const [teamTotal, setTeamTotal] = useState<number>(0);
  const [teamApprovedCount, setTeamApprovedCount] = useState<number>(0);
  const [isLoadingTeam, setIsLoadingTeam] = useState<boolean>(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState<TeamMemberKedisiplinan | null>(null);
  const [teamDetailModalVisible, setTeamDetailModalVisible] = useState<boolean>(false);

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

      // Fetch rekap tahunan silently in background
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

  // Load Team Data when switching to team tab or changing teamMonth
  const loadTeamData = useCallback(async () => {
    setIsLoadingTeam(true);
    try {
      const res = await evaluasiService.getTeamKedisiplinan(selectedYear, teamMonth);
      setTeamList(res.data || []);
      setTeamTotal(res.total || 0);
      setTeamApprovedCount(res.approved_count || 0);
    } catch {
      // Graceful fallback if user doesn't have team data permission
      setTeamList([]);
    } finally {
      setIsLoadingTeam(false);
    }
  }, [selectedYear, teamMonth]);

  useEffect(() => {
    if (activeTab === 'tim_cabang') {
      loadTeamData();
    }
  }, [activeTab, loadTeamData]);

  // Handle open month detail modal
  const handleOpenMonthDetail = async (month: number) => {
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

  // Predicate Helpers
  const getPredicateTheme = (predicate: string = '', score: number = 0) => {
    const p = predicate.toLowerCase();
    if (p.includes('sangat') || score >= 90) {
      return {
        bg: '#ecfdf5',
        border: '#a7f3d0',
        text: '#059669',
        badgeBg: '#10b981',
        icon: 'verified',
      };
    }
    if (p.includes('disiplin') && !p.includes('tidak') && !p.includes('kurang') && !p.includes('cukup')) {
      return {
        bg: '#eff6ff',
        border: '#bfdbfe',
        text: '#2563eb',
        badgeBg: '#3b82f6',
        icon: 'thumb-up',
      };
    }
    if (p.includes('cukup') || (score >= 70 && score < 80)) {
      return {
        bg: '#fffbeb',
        border: '#fde68a',
        text: '#d97706',
        badgeBg: '#f59e0b',
        icon: 'info',
      };
    }
    if (p.includes('kurang') || (score >= 50 && score < 70)) {
      return {
        bg: '#fff7ed',
        border: '#fed7aa',
        text: '#ea580c',
        badgeBg: '#f97316',
        icon: 'warning',
      };
    }
    // Tidak Disiplin / Rendah
    return {
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#dc2626',
      badgeBg: '#ef4444',
      icon: 'report-problem',
    };
  };

  const getStatusBadge = (status: string = '', label?: string) => {
    const isApproved = status.toLowerCase() === 'approved';
    return {
      text: label || (isApproved ? 'Disahkan Owner' : 'Menunggu Validasi'),
      bg: isApproved ? '#ede9fe' : '#fef3c7',
      color: isApproved ? '#6d28d9' : '#b45309',
      icon: isApproved ? 'verified-user' : 'hourglass-empty',
    };
  };

  return (
    <View style={styles.rootWrapper}>
      {/* HEADER SECTION */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top + 8, 20) }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>Evaluasi Kinerja & Kedisiplinan</Text>
            <Text style={styles.headerTitle}>Rapor Kedisiplinan</Text>
          </View>
          <TouchableOpacity
            style={styles.yearButton}
            onPress={() => setYearPickerVisible(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="calendar-today" size={15} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.yearButtonText}>{selectedYear}</Text>
            <MaterialIcons name="arrow-drop-down" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* HERO ANNUAL SCORECARD */}
        {summary ? (
          <View style={styles.heroScoreCard}>
            <View style={styles.heroScoreRow}>
              <View style={styles.scoreCircleWrapper}>
                <View style={[
                  styles.scoreCircle,
                  { borderColor: getPredicateTheme(summary.annual_predicate, summary.avg_score).text }
                ]}>
                  <Text style={[
                    styles.scoreText,
                    { color: getPredicateTheme(summary.annual_predicate, summary.avg_score).text }
                  ]}>
                    {Number(summary.avg_score).toFixed(1)}
                  </Text>
                  <Text style={styles.scoreScale}>/ 100</Text>
                </View>
              </View>

              <View style={styles.heroSummaryDetails}>
                <View style={[
                  styles.predicateBadge,
                  { backgroundColor: getPredicateTheme(summary.annual_predicate, summary.avg_score).badgeBg }
                ]}>
                  <MaterialIcons
                    name={getPredicateTheme(summary.annual_predicate, summary.avg_score).icon as any}
                    size={14}
                    color="#ffffff"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.predicateBadgeText}>{summary.annual_predicate || 'Belum Ada Penilaian'}</Text>
                </View>

                <Text style={styles.heroSummarySubtitle}>
                  Rata-rata dari {summary.final_months_count} bulan disahkan tahun {selectedYear}
                </Text>

                <View style={styles.heroMiniMetricsRow}>
                  <View style={styles.heroMiniMetricItem}>
                    <Text style={styles.heroMiniMetricVal}>{summary.total_late_count}x</Text>
                    <Text style={styles.heroMiniMetricLbl}>Terlambat</Text>
                  </View>
                  <View style={styles.heroMiniMetricDivider} />
                  <View style={styles.heroMiniMetricItem}>
                    <Text style={styles.heroMiniMetricVal}>{summary.total_late_minutes}m</Text>
                    <Text style={styles.heroMiniMetricLbl}>Durasi Telat</Text>
                  </View>
                  <View style={styles.heroMiniMetricDivider} />
                  <View style={styles.heroMiniMetricItem}>
                    <Text style={styles.heroMiniMetricVal}>{summary.total_incomplete}</Text>
                    <Text style={styles.heroMiniMetricLbl}>Incomplete</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* TAB NAVIGATION SEGMENT */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'bulanan' && styles.tabButtonActive]}
            onPress={() => setActiveTab('bulanan')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="calendar-view-month"
              size={18}
              color={activeTab === 'bulanan' ? theme.colors.primary : '#94a3b8'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === 'bulanan' && styles.tabTextActive]}>
              Bulanan Saya
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'rekap_tahunan' && styles.tabButtonActive]}
            onPress={() => setActiveTab('rekap_tahunan')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="pie-chart"
              size={18}
              color={activeTab === 'rekap_tahunan' ? theme.colors.primary : '#94a3b8'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === 'rekap_tahunan' && styles.tabTextActive]}>
              Rekap 12 Bulan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'tim_cabang' && styles.tabButtonActive]}
            onPress={() => setActiveTab('tim_cabang')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="groups"
              size={18}
              color={activeTab === 'tim_cabang' ? theme.colors.primary : '#94a3b8'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === 'tim_cabang' && styles.tabTextActive]}>
              Tim Cabang
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTENT BODY */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Memuat evaluasi kedisiplinan...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentScrollInner}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* TAB 1: BULANAN SAYA */}
          {activeTab === 'bulanan' && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Daftar Evaluasi Bulanan</Text>
                <Text style={styles.sectionBadge}>{monthlyList.length} Periode</Text>
              </View>

              {monthlyList.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="assessment" size={48} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>Belum Ada Evaluasi</Text>
                  <Text style={styles.emptyDesc}>
                    Data evaluasi kedisiplinan tahun {selectedYear} belum diterbitkan oleh bagian HRD.
                  </Text>
                </View>
              ) : (
                monthlyList.map((item) => {
                  const pTheme = getPredicateTheme(item.predicate, item.score);
                  const statusInfo = getStatusBadge(item.status, item.status_label);

                  return (
                    <TouchableOpacity
                      key={item.id || item.month}
                      style={styles.monthlyCard}
                      onPress={() => handleOpenMonthDetail(item.month)}
                      activeOpacity={0.85}
                    >
                      {/* Top Row: Month, Status & Score */}
                      <View style={styles.monthCardTop}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.monthHeaderRow}>
                            <Text style={styles.monthName}>{item.month_name} {item.year}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                              <MaterialIcons name={statusInfo.icon as any} size={13} color={statusInfo.color} style={{ marginRight: 4 }} />
                              <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                                {statusInfo.text}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.monthSubText}>
                            {item.total_work_days} Hari Kerja • {item.present_days} Hari Hadir ({item.consistency_pct}%)
                          </Text>
                        </View>

                        {/* Score Circle Mini */}
                        <View style={[styles.scoreBadgeBox, { backgroundColor: pTheme.bg, borderColor: pTheme.border }]}>
                          <Text style={[styles.scoreBadgeVal, { color: pTheme.text }]}>
                            {Number(item.score).toFixed(1)}
                          </Text>
                          <Text style={[styles.scoreBadgeLbl, { color: pTheme.text }]}>Skor</Text>
                        </View>
                      </View>

                      {/* Predicate Banner */}
                      <View style={[styles.predicateRowBanner, { backgroundColor: pTheme.bg, borderColor: pTheme.border }]}>
                        <MaterialIcons name={pTheme.icon as any} size={16} color={pTheme.text} style={{ marginRight: 6 }} />
                        <Text style={[styles.predicateRowText, { color: pTheme.text }]}>
                          Predikat: <Text style={{ fontWeight: 'bold' }}>{item.predicate}</Text>
                        </Text>
                      </View>

                      {/* Metrics 4 Grid */}
                      <View style={styles.metricsGrid}>
                        <View style={styles.metricGridItem}>
                          <MaterialIcons name="schedule" size={16} color="#ea580c" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.metricGridVal}>{item.late_count}x ({item.total_late_minutes}m)</Text>
                            <Text style={styles.metricGridLbl}>Terlambat</Text>
                          </View>
                        </View>

                        <View style={styles.metricGridItem}>
                          <MaterialIcons name="warning" size={16} color="#d97706" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.metricGridVal}>{item.incomplete_count} Hari</Text>
                            <Text style={styles.metricGridLbl}>Tanpa Checkout</Text>
                          </View>
                        </View>

                        <View style={styles.metricGridItem}>
                          <MaterialIcons name="event-busy" size={16} color="#dc2626" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.metricGridVal}>{item.absent_count} Hari</Text>
                            <Text style={styles.metricGridLbl}>Alpha / Mangkir</Text>
                          </View>
                        </View>

                        <View style={styles.metricGridItem}>
                          <MaterialIcons name="beach-access" size={16} color="#059669" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.metricGridVal}>{item.leave_count} Hari</Text>
                            <Text style={styles.metricGridLbl}>Cuti / Izin</Text>
                          </View>
                        </View>
                      </View>

                      {/* Review Note from Owner if present */}
                      {item.review_note ? (
                        <View style={styles.reviewNoteBanner}>
                          <MaterialIcons name="comment" size={14} color="#475569" style={{ marginRight: 6, marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.reviewNoteTitle}>Catatan Pengesahan Owner:</Text>
                            <Text style={styles.reviewNoteContent}>"{item.review_note}"</Text>
                            {item.reviewed_at ? (
                              <Text style={styles.reviewNoteDate}>Disahkan pada: {item.reviewed_at}</Text>
                            ) : null}
                          </View>
                        </View>
                      ) : null}

                      {/* Footer Action */}
                      <View style={styles.cardFooterAction}>
                        <Text style={styles.viewDetailActionText}>Lihat Log Presensi & Rincian Penalti</Text>
                        <MaterialIcons name="arrow-forward-ios" size={13} color={theme.colors.primary} />
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
              {/* Employee Header Info */}
              <View style={styles.annualProfileCard}>
                <View style={styles.annualAvatarBox}>
                  <MaterialIcons name="person" size={24} color="#ffffff" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.annualName}>{annualRekap.data.employee_name}</Text>
                  <Text style={styles.annualSub}>
                    NIK: {annualRekap.data.nik} • {annualRekap.data.position_name}
                  </Text>
                  <Text style={styles.annualBranch}>
                    {annualRekap.data.branch_name} ({annualRekap.data.department})
                  </Text>
                </View>
              </View>

              {/* Annual Stats Trio */}
              <View style={styles.annualStatsRow}>
                <View style={styles.annualStatBox}>
                  <Text style={styles.annualStatVal}>{Number(annualRekap.data.avg_score).toFixed(1)}</Text>
                  <Text style={styles.annualStatLbl}>Rata-Rata</Text>
                </View>
                <View style={styles.annualStatBox}>
                  <Text style={[styles.annualStatVal, { color: '#059669' }]}>
                    {Number(annualRekap.data.max_score).toFixed(1)}
                  </Text>
                  <Text style={styles.annualStatLbl}>Tertinggi</Text>
                </View>
                <View style={styles.annualStatBox}>
                  <Text style={[styles.annualStatVal, { color: '#dc2626' }]}>
                    {Number(annualRekap.data.min_score).toFixed(1)}
                  </Text>
                  <Text style={styles.annualStatLbl}>Terendah</Text>
                </View>
              </View>

              {/* 12 Months Matrix Card */}
              <View style={styles.matrixCard}>
                <Text style={styles.matrixTitle}>Matriks 12 Bulan ({selectedYear})</Text>
                <Text style={styles.matrixSub}>Riwayat skor dan status kedisiplinan sepanjang tahun</Text>

                <View style={styles.matrixGrid}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const monthData = annualRekap.data.months[String(m)];
                    const monthShortName = [
                      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
                    ][m - 1];

                    const pTheme = monthData
                      ? getPredicateTheme(monthData.predicate, monthData.score)
                      : { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8' };

                    return (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.matrixItem,
                          {
                            backgroundColor: pTheme.bg,
                            borderColor: pTheme.border,
                            opacity: monthData ? 1 : 0.6,
                          }
                        ]}
                        disabled={!monthData}
                        onPress={() => handleOpenMonthDetail(m)}
                      >
                        <Text style={styles.matrixMonthName}>{monthShortName}</Text>
                        {monthData ? (
                          <>
                            <Text style={[styles.matrixScore, { color: pTheme.text }]}>
                              {Number(monthData.score).toFixed(1)}
                            </Text>
                            <Text style={[styles.matrixStatus, { color: pTheme.text }]} numberOfLines={1}>
                              {monthData.is_approved ? 'Disahkan' : 'Draft'}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.matrixEmptyText}>--</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Predicate Counts Breakdown */}
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownTitle}>Distribusi Predikat Tahunan</Text>

                <View style={styles.predicateCountItem}>
                  <View style={[styles.predicateDot, { backgroundColor: '#10b981' }]} />
                  <Text style={styles.predicateCountLabel}>Sangat Disiplin (≥ 90)</Text>
                  <Text style={styles.predicateCountVal}>{annualRekap.data.predicate_counts.sangat_disiplin} Bulan</Text>
                </View>

                <View style={styles.predicateCountItem}>
                  <View style={[styles.predicateDot, { backgroundColor: '#3b82f6' }]} />
                  <Text style={styles.predicateCountLabel}>Disiplin (80 - 89.9)</Text>
                  <Text style={styles.predicateCountVal}>{annualRekap.data.predicate_counts.disiplin} Bulan</Text>
                </View>

                <View style={styles.predicateCountItem}>
                  <View style={[styles.predicateDot, { backgroundColor: '#f59e0b' }]} />
                  <Text style={styles.predicateCountLabel}>Cukup Disiplin (70 - 79.9)</Text>
                  <Text style={styles.predicateCountVal}>{annualRekap.data.predicate_counts.cukup_disiplin} Bulan</Text>
                </View>

                <View style={styles.predicateCountItem}>
                  <View style={[styles.predicateDot, { backgroundColor: '#ea580c' }]} />
                  <Text style={styles.predicateCountLabel}>Kurang Disiplin (50 - 69.9)</Text>
                  <Text style={styles.predicateCountVal}>{annualRekap.data.predicate_counts.kurang_disiplin} Bulan</Text>
                </View>

                <View style={styles.predicateCountItem}>
                  <View style={[styles.predicateDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={styles.predicateCountLabel}>Tidak Disiplin (&lt; 50)</Text>
                  <Text style={styles.predicateCountVal}>{annualRekap.data.predicate_counts.tidak_disiplin} Bulan</Text>
                </View>
              </View>
            </View>
          )}

          {/* TAB 3: TIM CABANG */}
          {activeTab === 'tim_cabang' && (
            <View>
              {/* Month Selector for Team */}
              <View style={styles.teamMonthFilterCard}>
                <Text style={styles.teamMonthFilterLbl}>Pilih Periode Bulan:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamMonthScroll}>
                  {[10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => {
                    const monthNames = [
                      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
                    ];
                    const isSelected = teamMonth === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[styles.teamMonthChip, isSelected && styles.teamMonthChipActive]}
                        onPress={() => setTeamMonth(m)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.teamMonthChipText, isSelected && styles.teamMonthChipTextActive]}>
                          {monthNames[m - 1]} {selectedYear}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Team Stats Summary */}
              <View style={styles.teamSummaryBanner}>
                <View style={styles.teamSummaryItem}>
                  <Text style={styles.teamSummaryVal}>{teamTotal}</Text>
                  <Text style={styles.teamSummaryLbl}>Total Karyawan</Text>
                </View>
                <View style={styles.teamSummaryDivider} />
                <View style={styles.teamSummaryItem}>
                  <Text style={[styles.teamSummaryVal, { color: '#059669' }]}>{teamApprovedCount}</Text>
                  <Text style={styles.teamSummaryLbl}>Disahkan Owner</Text>
                </View>
              </View>

              {isLoadingTeam ? (
                <View style={styles.centerLoading}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.loadingText}>Memuat rapor tim cabang...</Text>
                </View>
              ) : teamList.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="group-off" size={48} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>Data Tim Tidak Tersedia</Text>
                  <Text style={styles.emptyDesc}>
                    Belum ada data evaluasi kedisiplinan tim untuk bulan ini.
                  </Text>
                </View>
              ) : (
                <View style={styles.teamListContainer}>
                  {teamList.map((member, idx) => {
                    const pTheme = getPredicateTheme(member.predicate, member.score);
                    const isOwnerApproved = member.status === 'approved';

                    return (
                      <TouchableOpacity
                        key={member.id || idx}
                        style={styles.teamMemberCard}
                        onPress={() => {
                          setSelectedTeamMember(member);
                          setTeamDetailModalVisible(true);
                        }}
                        activeOpacity={0.85}
                      >
                        {/* Rank Badge */}
                        <View style={[
                          styles.rankBadge,
                          idx === 0 && { backgroundColor: '#f59e0b' },
                          idx === 1 && { backgroundColor: '#94a3b8' },
                          idx === 2 && { backgroundColor: '#b45309' },
                        ]}>
                          <Text style={styles.rankBadgeText}>#{idx + 1}</Text>
                        </View>

                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={styles.teamMemberHeader}>
                            <Text style={styles.teamMemberName} numberOfLines={1}>
                              {member.employee?.name || `Karyawan #${member.employee_id}`}
                            </Text>
                            <View style={[styles.scorePill, { backgroundColor: pTheme.bg, borderColor: pTheme.border }]}>
                              <Text style={[styles.scorePillText, { color: pTheme.text }]}>
                                {Number(member.score).toFixed(1)}
                              </Text>
                            </View>
                          </View>

                          <Text style={styles.teamMemberDept}>
                            NIK: {member.employee?.nik || '-'} • {member.department}
                          </Text>

                          <View style={styles.teamMemberFooter}>
                            <View style={[
                              styles.teamPredicatePill,
                              { backgroundColor: pTheme.badgeBg }
                            ]}>
                              <Text style={styles.teamPredicatePillText}>{member.predicate}</Text>
                            </View>

                            <Text style={styles.teamMemberStatsText}>
                              {member.present_days}/{member.total_work_days} Hadir • Telat: {member.late_count}x ({member.total_late_minutes}m)
                            </Text>
                          </View>

                          {isOwnerApproved ? (
                            <View style={styles.ownerApprovedTag}>
                              <MaterialIcons name="verified" size={13} color="#10b981" style={{ marginRight: 4 }} />
                              <Text style={styles.ownerApprovedTagText}>Disahkan Owner</Text>
                            </View>
                          ) : null}
                        </View>

                        <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* DETAIL MODAL BULANAN SAYA */}
      <Modal
        visible={detailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Rincian Evaluasi Kedisiplinan</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedMonthDetail ? `${selectedMonthDetail.month_name} ${selectedMonthDetail.year}` : 'Memuat data...'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <MaterialIcons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {isLoadingDetail || !selectedMonthDetail ? (
              <View style={[styles.centerLoading, { paddingVertical: 40 }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Memuat detail penilaian...</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Modal Score Hero */}
                <View style={[
                  styles.modalScoreCard,
                  {
                    backgroundColor: getPredicateTheme(selectedMonthDetail.predicate, selectedMonthDetail.score).bg,
                    borderColor: getPredicateTheme(selectedMonthDetail.predicate, selectedMonthDetail.score).border,
                  }
                ]}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[
                      styles.modalScoreBig,
                      { color: getPredicateTheme(selectedMonthDetail.predicate, selectedMonthDetail.score).text }
                    ]}>
                      {Number(selectedMonthDetail.score).toFixed(1)}
                    </Text>
                    <View style={[
                      styles.predicateBadge,
                      { backgroundColor: getPredicateTheme(selectedMonthDetail.predicate, selectedMonthDetail.score).badgeBg, marginTop: 4 }
                    ]}>
                      <Text style={styles.predicateBadgeText}>{selectedMonthDetail.predicate}</Text>
                    </View>
                    <Text style={styles.modalStatusText}>
                      Status: <Text style={{ fontWeight: 'bold' }}>{selectedMonthDetail.status_label || selectedMonthDetail.status}</Text>
                    </Text>
                  </View>
                </View>

                {/* Owner Review Note Banner */}
                {selectedMonthDetail.review_note ? (
                  <View style={styles.modalReviewNoteCard}>
                    <MaterialIcons name="verified-user" size={18} color="#6366f1" style={{ marginRight: 8, marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalReviewNoteTitle}>Catatan Resmi Owner:</Text>
                      <Text style={styles.modalReviewNoteContent}>"{selectedMonthDetail.review_note}"</Text>
                      {selectedMonthDetail.reviewed_at ? (
                        <Text style={styles.modalReviewNoteDate}>Tanggal Verifikasi: {selectedMonthDetail.reviewed_at}</Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {/* Ringkasan Parameter Disiplin */}
                <Text style={styles.modalSectionHeading}>Parameter Penalti & Kehadiran</Text>
                <View style={styles.modalStatsGrid}>
                  <View style={styles.modalStatCell}>
                    <Text style={styles.modalStatVal}>{selectedMonthDetail.present_days}/{selectedMonthDetail.total_work_days}</Text>
                    <Text style={styles.modalStatLbl}>Hari Hadir</Text>
                  </View>
                  <View style={styles.modalStatCell}>
                    <Text style={styles.modalStatVal}>{selectedMonthDetail.consistency_pct}%</Text>
                    <Text style={styles.modalStatLbl}>Konsistensi</Text>
                  </View>
                  <View style={styles.modalStatCell}>
                    <Text style={[styles.modalStatVal, { color: '#ea580c' }]}>
                      {selectedMonthDetail.late_count}x ({selectedMonthDetail.total_late_minutes}m)
                    </Text>
                    <Text style={styles.modalStatLbl}>Terlambat</Text>
                  </View>
                  <View style={styles.modalStatCell}>
                    <Text style={[styles.modalStatVal, { color: '#dc2626' }]}>{selectedMonthDetail.absent_count}</Text>
                    <Text style={styles.modalStatLbl}>Mangkir/Alpha</Text>
                  </View>
                  <View style={styles.modalStatCell}>
                    <Text style={[styles.modalStatVal, { color: '#d97706' }]}>{selectedMonthDetail.incomplete_count}</Text>
                    <Text style={styles.modalStatLbl}>Tanpa Checkout</Text>
                  </View>
                  <View style={styles.modalStatCell}>
                    <Text style={[styles.modalStatVal, { color: '#059669' }]}>{selectedMonthDetail.leave_count}</Text>
                    <Text style={styles.modalStatLbl}>Cuti/Izin</Text>
                  </View>
                </View>

                {/* Log Presensi Harian Snapshot */}
                <Text style={styles.modalSectionHeading}>Log Presensi Harian ({selectedMonthDetail.attendance_logs?.length || 0} Catatan)</Text>
                {selectedMonthDetail.attendance_logs && selectedMonthDetail.attendance_logs.length > 0 ? (
                  selectedMonthDetail.attendance_logs.map((log, idx) => {
                    const isLate = log.is_late;
                    const isIncomplete = log.is_incomplete;
                    const dateFormatted = new Date(log.date).toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    });

                    return (
                      <View key={idx} style={styles.logItemRow}>
                        <View style={styles.logDateCol}>
                          <Text style={styles.logDateText}>{dateFormatted}</Text>
                          <Text style={styles.logStatusText}>{log.status}</Text>
                        </View>

                        <View style={styles.logTimeCol}>
                          <Text style={styles.logTimeVal}>
                            {log.clock_in ? log.clock_in.substring(0, 5) : '--:--'} - {log.clock_out ? log.clock_out.substring(0, 5) : '--:--'}
                          </Text>
                          <View style={styles.logBadgeRow}>
                            {isLate ? (
                              <View style={[styles.logMiniBadge, { backgroundColor: '#fee2e2' }]}>
                                <Text style={[styles.logMiniBadgeText, { color: '#dc2626' }]}>
                                  Telat {log.late_minutes}m
                                </Text>
                              </View>
                            ) : (
                              <View style={[styles.logMiniBadge, { backgroundColor: '#dcfce7' }]}>
                                <Text style={[styles.logMiniBadgeText, { color: '#166534' }]}>
                                  Tepat Waktu
                                </Text>
                              </View>
                            )}
                            {isIncomplete ? (
                              <View style={[styles.logMiniBadge, { backgroundColor: '#fef3c7', marginLeft: 4 }]}>
                                <Text style={[styles.logMiniBadgeText, { color: '#b45309' }]}>
                                  No Out
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.noLogsText}>Tidak ada log presensi khusus tercatat.</Text>
                )}

                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* DETAIL MODAL TIM CABANG */}
      <Modal
        visible={teamDetailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setTeamDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Detail Disiplin Tim</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedTeamMember?.employee?.name || 'Karyawan'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setTeamDetailModalVisible(false)}
              >
                <MaterialIcons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedTeamMember && (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Score Banner */}
                <View style={[
                  styles.modalScoreCard,
                  {
                    backgroundColor: getPredicateTheme(selectedTeamMember.predicate, selectedTeamMember.score).bg,
                    borderColor: getPredicateTheme(selectedTeamMember.predicate, selectedTeamMember.score).border,
                  }
                ]}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[
                      styles.modalScoreBig,
                      { color: getPredicateTheme(selectedTeamMember.predicate, selectedTeamMember.score).text }
                    ]}>
                      {Number(selectedTeamMember.score).toFixed(1)}
                    </Text>
                    <View style={[
                      styles.predicateBadge,
                      { backgroundColor: getPredicateTheme(selectedTeamMember.predicate, selectedTeamMember.score).badgeBg, marginTop: 4 }
                    ]}>
                      <Text style={styles.predicateBadgeText}>{selectedTeamMember.predicate}</Text>
                    </View>
                    <Text style={styles.modalStatusText}>
                      Departemen: <Text style={{ fontWeight: 'bold' }}>{selectedTeamMember.department}</Text>
                    </Text>
                  </View>
                </View>

                {/* Score Breakdown from detail_json */}
                {selectedTeamMember.detail_json?.scores ? (
                  <View style={styles.teamScoreBreakdownCard}>
                    <Text style={styles.modalSectionHeading}>Komponen Penilaian:</Text>
                    <View style={styles.teamScoreRow}>
                      <Text style={styles.teamScoreLbl}>Skor Kehadiran:</Text>
                      <Text style={styles.teamScoreVal}>{selectedTeamMember.detail_json.scores.attendance_score} pts</Text>
                    </View>
                    <View style={styles.teamScoreRow}>
                      <Text style={styles.teamScoreLbl}>Skor Perilaku & Tata Tertib:</Text>
                      <Text style={styles.teamScoreVal}>{selectedTeamMember.detail_json.scores.conduct_score} pts</Text>
                    </View>
                  </View>
                ) : null}

                {/* Review Note */}
                {selectedTeamMember.review_note ? (
                  <View style={styles.modalReviewNoteCard}>
                    <MaterialIcons name="verified-user" size={18} color="#6366f1" style={{ marginRight: 8, marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalReviewNoteTitle}>Catatan Owner:</Text>
                      <Text style={styles.modalReviewNoteContent}>"{selectedTeamMember.review_note}"</Text>
                    </View>
                  </View>
                ) : null}

                {/* Stats */}
                <Text style={styles.modalSectionHeading}>Rekap Bulan Ini</Text>
                <View style={styles.modalStatsGrid}>
                  <View style={styles.modalStatCell}>
                    <Text style={styles.modalStatVal}>{selectedTeamMember.present_days}/{selectedTeamMember.total_work_days}</Text>
                    <Text style={styles.modalStatLbl}>Hari Hadir</Text>
                  </View>
                  <View style={styles.modalStatCell}>
                    <Text style={styles.modalStatVal}>{selectedTeamMember.consistency_pct}%</Text>
                    <Text style={styles.modalStatLbl}>Konsistensi</Text>
                  </View>
                  <View style={styles.modalStatCell}>
                    <Text style={[styles.modalStatVal, { color: '#ea580c' }]}>
                      {selectedTeamMember.late_count}x ({selectedTeamMember.total_late_minutes}m)
                    </Text>
                    <Text style={styles.modalStatLbl}>Terlambat</Text>
                  </View>
                  <View style={styles.modalStatCell}>
                    <Text style={[styles.modalStatVal, { color: '#dc2626' }]}>{selectedTeamMember.absent_count}</Text>
                    <Text style={styles.modalStatLbl}>Alpha</Text>
                  </View>
                </View>

                {/* Logs if available */}
                {selectedTeamMember.detail_json?.attendance_logs && selectedTeamMember.detail_json.attendance_logs.length > 0 ? (
                  <>
                    <Text style={styles.modalSectionHeading}>Log Presensi Harian</Text>
                    {selectedTeamMember.detail_json.attendance_logs.map((l, idx) => (
                      <View key={idx} style={styles.logItemRow}>
                        <View style={styles.logDateCol}>
                          <Text style={styles.logDateText}>{l.date}</Text>
                          <Text style={styles.logStatusText}>{l.status}</Text>
                        </View>
                        <View style={styles.logTimeCol}>
                          <Text style={styles.logTimeVal}>
                            {l.clock_in ? l.clock_in.substring(0, 5) : '--:--'} - {l.clock_out ? l.clock_out.substring(0, 5) : '--:--'}
                          </Text>
                          {l.is_late ? (
                            <View style={[styles.logMiniBadge, { backgroundColor: '#fee2e2' }]}>
                              <Text style={[styles.logMiniBadgeText, { color: '#dc2626' }]}>Telat {l.late_minutes}m</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}

                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* YEAR PICKER MODAL */}
      <Modal
        visible={yearPickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setYearPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.yearPickerOverlay}
          activeOpacity={1}
          onPress={() => setYearPickerVisible(false)}
        >
          <View style={styles.yearPickerContent}>
            <Text style={styles.yearPickerTitle}>Pilih Tahun Penilaian</Text>
            {availableYears.map((yr) => {
              const isSelected = yr === selectedYear;
              return (
                <TouchableOpacity
                  key={yr}
                  style={[styles.yearPickerItem, isSelected && styles.yearPickerItemActive]}
                  onPress={() => {
                    setSelectedYear(yr);
                    setYearPickerVisible(false);
                  }}
                >
                  <Text style={[styles.yearPickerItemText, isSelected && styles.yearPickerItemTextActive]}>
                    Tahun {yr}
                  </Text>
                  {isSelected ? (
                    <MaterialIcons name="check" size={20} color={theme.colors.primary} />
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
    backgroundColor: '#f8fafc',
  },
  headerContainer: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  yearButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Hero Card
  heroScoreCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginTop: 4,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreCircleWrapper: {
    marginRight: 14,
  },
  scoreCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  scoreText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scoreScale: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '600',
  },
  heroSummaryDetails: {
    flex: 1,
  },
  predicateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  predicateBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  heroSummarySubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8,
  },
  heroMiniMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  heroMiniMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroMiniMetricVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  heroMiniMetricLbl: {
    fontSize: 9.5,
    color: '#64748b',
  },
  heroMiniMetricDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#cbd5e1',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#eff6ff',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },

  // Scroll Content
  contentScroll: {
    flex: 1,
  },
  contentScrollInner: {
    padding: 16,
  },
  centerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 10,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primary,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },

  // Monthly Card
  monthlyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  monthCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  monthName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginRight: 8,
  },
  monthSubText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  scoreBadgeBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  scoreBadgeVal: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  scoreBadgeLbl: {
    fontSize: 8.5,
    fontWeight: '600',
  },
  predicateRowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  predicateRowText: {
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
  },
  metricGridItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  metricGridVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  metricGridLbl: {
    fontSize: 10,
    color: '#64748b',
  },
  reviewNoteBanner: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  reviewNoteTitle: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#334155',
  },
  reviewNoteContent: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
    marginTop: 1,
  },
  reviewNoteDate: {
    fontSize: 9.5,
    color: '#94a3b8',
    marginTop: 2,
  },
  cardFooterAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  viewDetailActionText: {
    fontSize: 11.5,
    color: theme.colors.primary,
    fontWeight: '600',
  },

  // Tab 2: Rekap Tahunan
  annualProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  annualAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  annualName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  annualSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  annualBranch: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: '500',
    marginTop: 1,
  },
  annualStatsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  annualStatBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  annualStatVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  annualStatLbl: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  matrixCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  matrixTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  matrixSub: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 12,
  },
  matrixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  matrixItem: {
    width: (width - 64) / 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    marginBottom: 8,
  },
  matrixMonthName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#334155',
  },
  matrixScore: {
    fontSize: 13,
    fontWeight: 'bold',
    marginVertical: 2,
  },
  matrixStatus: {
    fontSize: 8.5,
    fontWeight: '600',
  },
  matrixEmptyText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 6,
  },
  breakdownCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 10,
  },
  predicateCountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  predicateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  predicateCountLabel: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
  },
  predicateCountVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  },

  // Tab 3: Tim Cabang
  teamMonthFilterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  teamMonthFilterLbl: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  teamMonthScroll: {
    flexDirection: 'row',
  },
  teamMonthChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  teamMonthChipActive: {
    backgroundColor: theme.colors.primary,
  },
  teamMonthChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  teamMonthChipTextActive: {
    color: '#ffffff',
  },
  teamSummaryBanner: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  teamSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  teamSummaryVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  teamSummaryLbl: {
    fontSize: 10.5,
    color: '#64748b',
  },
  teamSummaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#e2e8f0',
  },
  teamListContainer: {
    marginTop: 2,
  },
  teamMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  teamMemberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamMemberName: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    marginRight: 8,
  },
  scorePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  scorePillText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  teamMemberDept: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  teamMemberFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  teamPredicatePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  teamPredicatePillText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  teamMemberStatsText: {
    fontSize: 10.5,
    color: '#64748b',
  },
  ownerApprovedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ownerApprovedTagText: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '600',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modalScoreCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  modalScoreBig: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  modalStatusText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  modalReviewNoteCard: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  modalReviewNoteTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#3730a3',
  },
  modalReviewNoteContent: {
    fontSize: 12,
    color: '#4338ca',
    fontStyle: 'italic',
    marginTop: 2,
  },
  modalReviewNoteDate: {
    fontSize: 10,
    color: '#6366f1',
    marginTop: 4,
  },
  modalSectionHeading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
    marginVertical: 8,
  },
  modalStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
  },
  modalStatCell: {
    width: '33.33%',
    padding: 6,
    alignItems: 'center',
  },
  modalStatVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  modalStatLbl: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  logItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  logDateCol: {
    flex: 1,
  },
  logDateText: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  logStatusText: {
    fontSize: 10.5,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  logTimeCol: {
    alignItems: 'flex-end',
  },
  logTimeVal: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  logBadgeRow: {
    flexDirection: 'row',
    marginTop: 3,
  },
  logMiniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  logMiniBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  noLogsText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginVertical: 8,
  },
  teamScoreBreakdownCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  teamScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  teamScoreLbl: {
    fontSize: 12,
    color: '#475569',
  },
  teamScoreVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  },

  // Year Picker
  yearPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  yearPickerContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    width: '80%',
    elevation: 5,
  },
  yearPickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
  },
  yearPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  yearPickerItemActive: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  yearPickerItemText: {
    fontSize: 14,
    color: '#334155',
  },
  yearPickerItemTextActive: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
});

