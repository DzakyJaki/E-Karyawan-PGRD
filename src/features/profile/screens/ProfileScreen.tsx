import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../core/theme';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfirm } from '../../../core/ConfirmContext';
import { useToast } from '../../../core/ToastContext';

interface UserProfileData {
  user?: {
    id: number;
    name: string;
    email: string;
    branch_id: number;
  };
  employee?: {
    id: number;
    nik: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    gender: string;
    joined_date: string;
    status: string;
    position: string;
  };
  branch?: {
    id: number;
    name: string;
    type?: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    status?: string;
  };
}

export function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();

  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showFullNik, setShowFullNik] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/login');
        return;
      }

      const response = await fetch(`${apiUrl}/api/my/profile`, {
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
        setProfileData(json);
        await AsyncStorage.setItem('fullProfile', JSON.stringify(json));
      } else {
        // Fallback to cache if network/server issue
        const cached = await AsyncStorage.getItem('fullProfile');
        if (cached) setProfileData(JSON.parse(cached));
      }
    } catch {
      const cached = await AsyncStorage.getItem('fullProfile');
      if (cached) setProfileData(JSON.parse(cached));
    }
  }, [router]);

  useEffect(() => {
    // Load cached profile first for instant UI
    const loadCache = async () => {
      const cached = await AsyncStorage.getItem('fullProfile');
      if (cached) {
        try {
          setProfileData(JSON.parse(cached));
        } catch {}
      }
    };
    loadCache();
    fetchProfile();
  }, [fetchProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  };

  const calculateMasaKerja = (joinedDateStr?: string) => {
    if (!joinedDateStr) return '-';
    const joined = new Date(joinedDateStr);
    if (isNaN(joined.getTime())) return '-';
    const now = new Date();
    const diffYears = now.getFullYear() - joined.getFullYear();
    const diffMonths = now.getMonth() - joined.getMonth();
    const totalMonths = diffYears * 12 + diffMonths;
    if (totalMonths <= 0) return 'Baru';
    if (totalMonths < 12) return `${totalMonths} Bulan`;
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    return m > 0 ? `${y} Thn ${m} Bln` : `${y} Tahun`;
  };

  const handleLogout = () => {
    showConfirm({
      title: 'Konfirmasi Logout',
      message: 'Apakah Anda yakin ingin keluar dari aplikasi?',
      confirmText: 'Keluar',
      cancelText: 'Batal',
      type: 'danger',
      onConfirm: async () => {
        try {
          const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
          const token = await AsyncStorage.getItem('userToken');
          
          if (token) {
            try {
              await fetch(`${apiUrl}/api/my/logout`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/json',
                  'Content-Type': 'application/json'
                }
              });
            } catch (err) {
              console.log('Error calling /api/my/logout:', err);
            }
          }

          await AsyncStorage.clear();
          showToast({
            title: 'Sukses',
            message: 'Berhasil keluar dari akun.',
            type: 'success'
          });
          router.replace('/login');
        } catch {
          showToast({
            title: 'Error',
            message: 'Gagal logout dari aplikasi.',
            type: 'error'
          });
        }
      }
    });
  };

  const employee = profileData?.employee;
  const user = profileData?.user;
  const branch = profileData?.branch;

  const nameCandidate = employee?.name || user?.name;
  const rawNameStr: string = typeof nameCandidate === 'string' && nameCandidate ? nameCandidate : 'Karyawan';
  const displayName = rawNameStr
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  const posRaw = employee?.position as any;
  const displayRole = typeof posRaw === 'object' && posRaw !== null
    ? (posRaw.name || posRaw.title || 'Karyawan')
    : (typeof posRaw === 'string' && posRaw ? posRaw : 'Karyawan');
  const rawNik = typeof employee?.nik === 'string' ? employee?.nik : (employee?.nik ? String(employee.nik) : '-');
  const maskNik = (nikStr: string) => {
    if (!nikStr || nikStr === '-') return '-';
    const clean = nikStr.trim();
    if (clean.length <= 8) return clean;
    const start = clean.slice(0, 4);
    const end = clean.slice(-4);
    const middle = '*'.repeat(clean.length - 8);
    return `${start}${middle}${end}`;
  };
  const displayNik = showFullNik ? rawNik : maskNik(rawNik);
  const statusRaw = employee?.status as any;
  const displayStatus = typeof statusRaw === 'object' && statusRaw !== null
    ? (statusRaw.name || statusRaw.label || 'Aktif')
    : (typeof statusRaw === 'string' && statusRaw ? statusRaw : 'Aktif');
  const masaKerja = calculateMasaKerja(employee?.joined_date);

  const menuGroups = [
    {
      title: 'Administrasi',
      items: [
        { icon: 'assignment-ind', label: 'Data Karyawan', color: theme.colors.primary, route: '/profile/employee-data' },
        { icon: 'history-toggle-off', label: 'Form Pengajuan Presensi', color: '#ea580c', route: '/profile/late-explanation' },
      ]
    },
    {
      title: 'Pengaturan Akun & Keamanan',
      items: [
        { icon: 'lock', label: 'Ubah Password', color: '#f59e0b', route: '/profile/change-password' },
        // PIN & Sidik Jari dinonaktifkan sementara untuk platform Web
        // { icon: 'dialpad', label: 'PIN Keamanan', color: '#10b981', route: '/profile/pin-setup' },
        // { icon: 'fingerprint', label: 'Kunci Sidik Jari (Biometrik)', color: '#ec4899', route: '/profile/biometrics' },
        { icon: 'chat', label: 'Tutorial Penggunaan', color: '#8b5cf6', route: '/profile/chat-support' },
      ]
    }
  ];

  return (
    <View style={styles.rootWrapper}>
      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        bounces={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor="#ffffff" />}
      >
        
        {/* HERO HEADER SECTION (CLEAN, SOLID BLUE, ZERO REDUNDANCY) */}
        <View style={[styles.headerBackground, { paddingTop: Math.max(insets.top + 20, 44) }]}>
          {/* Centered Avatar Icon */}
          <View style={styles.avatarWrapper}>
            <MaterialCommunityIcons name="account-circle" size={96} color="#ffffff" />
          </View>

          {/* User Name & Role (Clean & Single Occurrence) */}
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.roleText}>
            {displayRole} {branch?.name ? `• ${branch.name}` : ''}
          </Text>
        </View>
        
        {/* FLOATING STATS CARD (MATCHING HOME SCREEN FLOATING CARD PATTERN) */}
        <View style={styles.floatingStatsCard}>
          <TouchableOpacity 
            style={styles.statBox} 
            activeOpacity={0.7} 
            onPress={() => setShowFullNik(prev => !prev)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.statLabel}>NIK Karyawan</Text>
              <MaterialIcons 
                name={showFullNik ? "visibility-off" : "visibility"} 
                size={12} 
                color={theme.colors.textMuted} 
                style={{ marginLeft: 3, marginBottom: 2 }} 
              />
            </View>
            <Text style={styles.statValue} numberOfLines={1}>{displayNik}</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={[styles.statValue, { color: '#16a34a' }]}>{displayStatus}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Masa Kerja</Text>
            <Text style={styles.statValue}>{masaKerja}</Text>
          </View>
        </View>

        {/* MENU LISTS */}
        <View style={styles.menusWrapper}>
          {menuGroups.map((group, gIndex) => (
            <View key={gIndex} style={styles.menuGroup}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.card}>
                {group.items.map((item, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={[styles.menuItem, index === group.items.length - 1 && { borderBottomWidth: 0 }]}
                    activeOpacity={0.7}
                    onPress={() => item.route ? router.push(item.route as any) : null}
                  >
                    <View style={[styles.iconWrapper, { backgroundColor: item.color + '20' }]}>
                      <MaterialIcons name={item.icon as any} size={22} color={item.color} />
                    </View>
                    <Text style={styles.menuText}>{item.label}</Text>
                    <MaterialIcons name="chevron-right" size={24} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {/* LOGOUT BUTTON */}
          <TouchableOpacity style={styles.btnLogout} onPress={handleLogout} activeOpacity={0.8}>
            <MaterialIcons name="logout" size={22} color={theme.colors.danger} />
            <Text style={styles.btnLogoutText}>Keluar dari Akun</Text>
          </TouchableOpacity>
          
          <Text style={styles.versionText}>E-Karyawan v1.0.0</Text>
        </View>
        
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrapper: { flex: 1, backgroundColor: theme.colors.primary },
  container: { flex: 1, backgroundColor: '#f4f4f5' },
  
  headerBackground: { 
    backgroundColor: theme.colors.primary, 
    alignItems: 'center',
    paddingHorizontal: theme.spacing.l,
    paddingBottom: 48,
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarBorder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ffffff',
    padding: 3,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primaryLight,
    padding: 7,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#ffffff',
    elevation: 4,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  roleText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  
  floatingStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    marginHorizontal: theme.spacing.l,
    marginTop: -26,
    borderRadius: theme.radius.l,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.m,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginBottom: 3,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#f1f5f9',
    height: '70%',
    alignSelf: 'center',
  },
  
  menusWrapper: { padding: theme.spacing.l, paddingTop: theme.spacing.m, paddingBottom: 40 },
  menuGroup: { marginBottom: theme.spacing.l },
  groupTitle: { fontSize: 14, fontWeight: 'bold', color: theme.colors.textMuted, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', borderRadius: theme.radius.l, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m, borderBottomWidth: 1, borderColor: '#f4f4f5' },
  iconWrapper: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.m },
  menuText: { flex: 1, fontSize: 16, fontWeight: '500', color: theme.colors.text },
  
  btnLogout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2', padding: theme.spacing.m, borderRadius: theme.radius.m, marginTop: theme.spacing.m },
  btnLogoutText: { color: theme.colors.danger, fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  versionText: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 12, marginTop: theme.spacing.xl }
});