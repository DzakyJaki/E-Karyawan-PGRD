import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../core/theme';

const { width } = Dimensions.get('window');

const MONTH_NAMES_INDONESIA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

interface TodayAttendance {
  id?: number;
  date?: string;
  clock_in?: string | null;
  clock_out?: string | null;
  status?: string;
  is_late?: boolean | null;
  late_minutes?: number | null;
  is_early_leave?: boolean | null;
  early_leave_minutes?: number | null;
}

export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [refreshing, setRefreshing] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  
  // Real Database Metrics
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance | null>(null);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  const [remainingLeave, setRemainingLeave] = useState<number>(0);
  const [totalOvertimeHours, setTotalOvertimeHours] = useState<number>(0);
  const [workTimeData, setWorkTimeData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHomeScreenData = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/login');
        return;
      }

      const headers = { 
        Authorization: `Bearer ${token}`, 
        Accept: 'application/json' 
      };

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const todayYMD = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

      // 1. Fetch Profile (/api/my/profile)
      const profilePromise = fetch(`${apiUrl}/api/my/profile`, { headers })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null);

      // 2. Fetch Presensi Bulan Ini (/api/my/presensi)
      const presensiPromise = fetch(`${apiUrl}/api/my/presensi?month=${currentMonth}&year=${currentYear}`, { headers })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null);

      // 3. Fetch Saldo Cuti (/api/my/cuti/saldo)
      const cutiPromise = fetch(`${apiUrl}/api/my/cuti/saldo?year=${currentYear}`, { headers })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null);

      // 4. Fetch Lembur (/api/my/lembur)
      const lemburPromise = fetch(`${apiUrl}/api/my/lembur`, { headers })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null);

      // 5. Fetch Jam Kerja Cabang (/api/my/work-time)
      const workTimePromise = fetch(`${apiUrl}/api/my/work-time`, { headers })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null);

      const [profJson, presJson, cutiJson, lemburJson, workTimeJson] = await Promise.all([
        profilePromise,
        presensiPromise,
        cutiPromise,
        lemburPromise,
        workTimePromise
      ]);

      // Handle Profile
      if (profJson) {
        setProfileData(profJson);
        await AsyncStorage.setItem('fullProfile', JSON.stringify(profJson));
      }

      // Handle Work Time Cabang
      if (workTimeJson && workTimeJson.data) {
        setWorkTimeData(workTimeJson.data);
        await AsyncStorage.setItem('cachedWorkTime', JSON.stringify(workTimeJson.data));
      }

      // Handle Presensi Hari Ini & Total Bulan Ini
      if (presJson && Array.isArray(presJson.data)) {
        const todayRec = presJson.data.find((item: any) => item.date === todayYMD);
        setTodayAttendance(todayRec || null);
        setAttendanceCount(presJson.data.length);
      } else {
        setTodayAttendance(null);
        setAttendanceCount(0);
      }

      // Handle Sisa Cuti (Hanya jenis cuti yang memiliki alokasi kuota > 0)
      if (cutiJson && Array.isArray(cutiJson.balances)) {
        const quotaBalances = cutiJson.balances.filter((b: any) => (b.allocated || 0) > 0);
        const totalAllocated = quotaBalances.reduce((sum: number, b: any) => sum + (b.allocated || 0), 0);
        const totalUsed = quotaBalances.reduce((sum: number, b: any) => sum + (b.used || 0), 0);
        const totalRem = Math.max(0, totalAllocated - totalUsed);
        setRemainingLeave(totalRem);
      }

      // Handle Total Lembur Disetujui Bulan Ini
      if (lemburJson && Array.isArray(lemburJson.data)) {
        const currentMonthPrefix = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
        const totalOvt = lemburJson.data
          .filter((o: any) => {
            const isApproved = (o.status || '').toLowerCase() === 'approved';
            const isThisMonth = (o.date || '').startsWith(currentMonthPrefix);
            return isApproved && isThisMonth;
          })
          .reduce((sum: number, o: any) => sum + (parseFloat(o.hours) || 0), 0);
        setTotalOvertimeHours(totalOvt);
      }

    } catch (err) {
      console.log('Error fetch home data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadCache = async () => {
      const cached = await AsyncStorage.getItem('fullProfile');
      if (cached) {
        try { setProfileData(JSON.parse(cached)); } catch (_) {}
      }
      const cachedWt = await AsyncStorage.getItem('cachedWorkTime');
      if (cachedWt) {
        try { setWorkTimeData(JSON.parse(cachedWt)); } catch (_) {}
      }
    };
    loadCache();
    fetchHomeScreenData();
  }, [fetchHomeScreenData]);
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHomeScreenData();
    setRefreshing(false);
  }, [fetchHomeScreenData]);

  // Profil User Info
  const nameCandidate = profileData?.employee?.name || profileData?.user?.name;
  const rawNameStr: string = typeof nameCandidate === 'string' && nameCandidate ? nameCandidate : 'Karyawan';

  const displayName = rawNameStr
    .split(' ')
    .filter(Boolean)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  const posRaw = profileData?.employee?.position as any;
  const displayRole = typeof posRaw === 'object' && posRaw !== null
    ? (posRaw.name || posRaw.title || 'Karyawan')
    : (typeof posRaw === 'string' && posRaw ? posRaw : 'Karyawan');

  const branchRaw = profileData?.branch as any;
  const branchName = typeof branchRaw === 'object' && branchRaw !== null
    ? (branchRaw.name || '')
    : (typeof branchRaw === 'string' ? branchRaw : '');
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=fff&color=3b82f6&size=100`;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Selamat Pagi,';
    if (hour < 15) return 'Selamat Siang,';
    if (hour < 18) return 'Selamat Sore,';
    return 'Selamat Malam,';
  };

  const todayFormatted = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const checkInTime = todayAttendance?.clock_in ? todayAttendance.clock_in.substring(0, 5) : '--:--';
  const checkOutTime = todayAttendance?.clock_out ? todayAttendance.clock_out.substring(0, 5) : '--:--';

  const branchLat = workTimeData?.latitude ?? profileData?.branch?.latitude;
  const branchLon = workTimeData?.longitude ?? profileData?.branch?.longitude;
  const branchRadius = workTimeData?.radius_meters ?? profileData?.branch?.radius_meters;

  const isBranchLocationConfigured = useMemo(() => {
    const hasLat = branchLat != null && branchLat !== '' && !isNaN(Number(branchLat));
    const hasLon = branchLon != null && branchLon !== '' && !isNaN(Number(branchLon));
    const hasRadius = branchRadius != null && branchRadius !== '' && !isNaN(Number(branchRadius)) && Number(branchRadius) > 0;
    return Boolean(hasLat && hasLon && hasRadius);
  }, [branchLat, branchLon, branchRadius]);

  const getAttendanceBadge = () => {
    if (!isBranchLocationConfigured) {
      return { bg: '#fee2e2', text: '#991b1b', label: 'Lokasi Belum Diatur' };
    }
    if (todayAttendance?.is_late && !todayAttendance?.clock_out) {
      const lateTxt = todayAttendance.late_minutes ? `Telat ${todayAttendance.late_minutes}m` : 'Terlambat';
      return { bg: '#fee2e2', text: '#991b1b', label: lateTxt };
    }
    if (todayAttendance?.clock_in && todayAttendance?.clock_out) {
      if (todayAttendance.is_late) {
        return { bg: '#fef3c7', text: '#92400e', label: 'Selesai (Telat)' };
      }
      return { bg: '#dcfce7', text: '#166534', label: 'Sudah Selesai' };
    }
    if (todayAttendance?.clock_in) {
      return { bg: '#e0e7ff', text: '#3730a3', label: 'Sudah Masuk' };
    }
    return { bg: '#fee2e2', text: '#991b1b', label: 'Belum Presensi' };
  };

  const attendanceBadge = getAttendanceBadge();

  const todayDayName = workTimeData?.day_name || new Date().toLocaleDateString('id-ID', { weekday: 'long' });
  const isWorkClosedToday = Boolean(workTimeData?.is_closed_today);
  const workStartTime = workTimeData?.work_start_time ? workTimeData.work_start_time.substring(0, 5) : '08:00';
  const workEndTime = workTimeData?.work_end_time ? workTimeData.work_end_time.substring(0, 5) : '17:00';

  const todayScheduleText = isWorkClosedToday
    ? `${todayDayName} • Libur / Tutup`
    : `${todayDayName} • ${workStartTime} - ${workEndTime} WIB`;

  return (
    <View style={styles.rootWrapper}>
      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        bounces={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor="#ffffff" />}
      >
        
        {/* HEADER SECTION (FULL BLEED TO STATUS BAR) */}
        <View style={[styles.headerBackground, { paddingTop: Math.max(insets.top + 16, 40), minHeight: Math.max(insets.top + 16, 40) + 160 }]}>
          <View style={styles.headerContent}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.role} numberOfLines={1}>
                {displayRole} {branchName ? `| ${branchName}` : ''}
              </Text>
            </View>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.8}
          >
            <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* FLOATING ATTENDANCE CARD (SYNC REAL DATABASE) */}
      <TouchableOpacity 
        style={styles.floatingCard}
        onPress={() => router.push('/(tabs)/attendance')}
        activeOpacity={0.9}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={styles.cardTitle}>Status Presensi Hari Ini</Text>
          <View style={[styles.statusBadgeSmall, { backgroundColor: attendanceBadge.bg }]}>
            <Text style={[styles.statusBadgeSmallText, { color: attendanceBadge.text }]}>
              {attendanceBadge.label}
            </Text>
          </View>
        </View>

        <Text style={styles.currentDate}>{todayFormatted}</Text>
        
        <View style={styles.attendanceRow}>
          <View style={styles.attendanceBox}>
            <MaterialIcons 
              name="login" 
              size={24} 
              color={todayAttendance?.clock_in ? (todayAttendance.is_late ? '#b91c1c' : theme.colors.success) : theme.colors.textMuted} 
            />
            <Text style={[styles.timeText, todayAttendance?.clock_in && { color: todayAttendance.is_late ? '#b91c1c' : theme.colors.success }]}>
              {checkInTime}
            </Text>
            <Text style={[styles.statusLabel, todayAttendance?.is_late && { color: '#b91c1c', fontWeight: 'bold' }]}>
              {todayAttendance?.is_late ? `Telat ${todayAttendance.late_minutes ? `${todayAttendance.late_minutes}m` : ''}` : 'Jam Masuk'}
            </Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.attendanceBox}>
            <MaterialIcons 
              name="logout" 
              size={24} 
              color={todayAttendance?.clock_out ? (todayAttendance.is_early_leave ? '#b45309' : theme.colors.danger) : theme.colors.textMuted} 
            />
            <Text style={[styles.timeText, todayAttendance?.clock_out && { color: todayAttendance.is_early_leave ? '#b45309' : theme.colors.danger }]}>
              {checkOutTime}
            </Text>
            <Text style={[styles.statusLabel, todayAttendance?.is_early_leave && { color: '#b45309', fontWeight: 'bold' }]}>
              {todayAttendance?.is_early_leave ? `Cepat ${todayAttendance.early_leave_minutes ? `${todayAttendance.early_leave_minutes}m` : ''}` : 'Jam Pulang'}
            </Text>
          </View>
        </View>

        {!isBranchLocationConfigured ? (
          <View style={styles.homeLocationWarningBanner}>
            <MaterialIcons name="error-outline" size={15} color="#b91c1c" style={{ marginRight: 6 }} />
            <Text style={styles.homeLocationWarningText}>
              Titik GPS atau radius cabang belum dikonfigurasi Admin. Presensi dinonaktifkan.
            </Text>
          </View>
        ) : null}

        <View style={styles.tapToAttendPrompt}>
          <Text style={styles.tapToAttendText}>
            {!isBranchLocationConfigured ? 'Buka menu presensi (Perlu pengaturan admin)' : 'Tekan untuk buka menu presensi GPS'}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={theme.colors.primary} />
        </View>
      </TouchableOpacity>

      {/* QUICK STATS RINGKASAN DATABASE */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: '#dcfce7' }]}>
            <MaterialIcons name="event-available" size={20} color="#166534" />
          </View>
          <Text style={styles.statValue}>{attendanceCount} Hari</Text>
          <Text style={styles.statLabel}>Hadir Bulan Ini</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: '#eff6ff' }]}>
            <MaterialIcons name="beach-access" size={20} color={theme.colors.primary} />
          </View>
          <Text style={styles.statValue}>{remainingLeave} Hari</Text>
          <Text style={styles.statLabel}>Sisa Cuti</Text>
        </View>

        <TouchableOpacity 
          style={styles.statCard}
          onPress={() => router.push('/(tabs)/salary')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconWrap, { backgroundColor: '#fef3c7' }]}>
            <MaterialIcons name="payments" size={20} color="#b45309" />
          </View>
          <Text style={styles.statValue}>Bulan Ini</Text>
          <Text style={styles.statLabel}>Slip Gaji</Text>
        </TouchableOpacity>
      </View>

      {/* QUICK MENU GRID */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Menu Cepat</Text>
        <View style={styles.menuGrid}>
          <MenuButton icon="calendar-month" color={theme.colors.primaryLight} label="Pengajuan Cuti" route="/(tabs)/leave" router={router} />
          {/* Menu Lembur disembunyikan sementara sesuai instruksi owner, kodingan tetap disimpan: */}
          {/* <MenuButton icon="schedule" color={theme.colors.warning} label="Form Lembur" route="/(tabs)/overtime" router={router} /> */}
          <MenuButton icon="assignment-ind" color={theme.colors.warning} label="Data Karyawan" route="/profile/employee-data" router={router} />
          <MenuButton icon="payments" color={theme.colors.success} label="Slip Gaji" route="/(tabs)/salary" router={router} />
          <MenuButton icon="history" color={theme.colors.secondary} label="Riwayat Absen" route="/(tabs)/attendance" router={router} />
        </View>
      </View>

      {/* COMPANY RULES / ATURAN PEKERJAAN */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Aturan Pekerjaan</Text>
        
        <View style={styles.combinedCard}>
          <View style={styles.ruleItem}>
            <View style={[styles.iconWrap, { backgroundColor: '#E0E7FF' }]}>
              <MaterialIcons name="access-time" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Jam Kerja Hari Ini</Text>
              <Text style={styles.infoSubtitle}>
                {todayScheduleText}
              </Text>
            </View>
          </View>
          
          <View style={styles.cardDivider} />

          <View style={styles.ruleItem}>
            <View style={[styles.iconWrap, { backgroundColor: '#FEF3C7' }]}>
              <MaterialIcons name="checkroom" size={24} color={theme.colors.warning} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Tata Tertib Pakaian</Text>
              <Text style={styles.infoSubtitle}>Seragam kerja pada hari Senin-Rabu</Text>
            </View>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.ruleItem}>
            <View style={[styles.iconWrap, { backgroundColor: '#D1FAE5' }]}>
              <MaterialIcons name="health-and-safety" size={24} color={theme.colors.success} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>K3 & Keselamatan</Text>
              <Text style={styles.infoSubtitle}>Wajib memakai APD di area kerja/proyek</Text>
            </View>
          </View>
        </View>
      </View>
      
      <View style={{ height: 40 }} />
    </ScrollView>
    </View>
  );
}

const MenuButton = ({ icon, color, label, route, router }: { icon: any, color: string, label: string, route: string, router: any }) => (
  <TouchableOpacity style={styles.menuButton} onPress={() => router.push(route)} activeOpacity={0.8}>
    <View style={[styles.menuIconCircle, { backgroundColor: color + '20' }]}>
      <MaterialIcons name={icon} size={28} color={color} />
    </View>
    <Text style={styles.menuLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  rootWrapper: { flex: 1, backgroundColor: theme.colors.primary },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerBackground: {
    backgroundColor: theme.colors.primary,
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 76,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.m,
  },
  greeting: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  name: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginVertical: 4 },
  role: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  avatarContainer: {
    width: 56, height: 56,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6
  },
  
  floatingCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: theme.spacing.l,
    marginTop: -48,
    borderRadius: theme.radius.l,
    padding: theme.spacing.l,
    elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }
  },
  cardTitle: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },
  statusBadgeSmall: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeSmallText: { fontSize: 11, fontWeight: 'bold' },
  currentDate: { fontSize: 16, color: theme.colors.text, fontWeight: 'bold', marginBottom: theme.spacing.m },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.xs },
  attendanceBox: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 40, backgroundColor: '#f1f5f9' },
  timeText: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, marginTop: 4 },
  statusLabel: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  
  homeLocationWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 12
  },
  homeLocationWarningText: {
    fontSize: 11,
    color: '#991b1b',
    fontWeight: '500',
    flex: 1
  },

  tapToAttendPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  tapToAttendText: { fontSize: 12, color: theme.colors.primary, fontWeight: '600', marginRight: 2 },

  // Stats summary row
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.l,
    marginTop: 16,
    justifyContent: 'space-between'
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    marginHorizontal: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: theme.radius.m,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6
  },
  statValue: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, textAlign: 'center' },

  section: { paddingHorizontal: theme.spacing.l, marginTop: theme.spacing.xl },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m },
  
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  menuButton: { width: (width - 48) / 4, alignItems: 'center', marginBottom: theme.spacing.m },
  menuIconCircle: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  menuLabel: { fontSize: 12, color: theme.colors.text, textAlign: 'center', fontWeight: '500' },
  
  combinedCard: {
    backgroundColor: '#ffffff',
    borderRadius: theme.radius.m,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5,
    overflow: 'hidden'
  },
  ruleItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: theme.spacing.m,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: theme.spacing.m
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.m },
  infoTextContainer: { flex: 1 },
  infoTitle: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text, marginBottom: 2 },
  infoSubtitle: { fontSize: 12, color: theme.colors.textMuted }
});