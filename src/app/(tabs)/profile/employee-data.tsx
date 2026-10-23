import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { theme } from '../../../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DeductionType {
  id: number;
  name: string;
  type?: string;
}

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
    status: string | { id?: number; name?: string; label?: string };
    position?: string | { id?: number; name?: string; department?: string; level?: number };
    deduction_types?: DeductionType[];
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

export default function EmployeeDataScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pribadi' | 'pegawai'>('pribadi');
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${apiUrl}/api/my/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      if (response.ok) {
        const json = await response.json();
        setProfileData(json);
        await AsyncStorage.setItem('fullProfile', JSON.stringify(json));
      } else {
        const cached = await AsyncStorage.getItem('fullProfile');
        if (cached) setProfileData(JSON.parse(cached));
      }
    } catch (_) {
      const cached = await AsyncStorage.getItem('fullProfile');
      if (cached) setProfileData(JSON.parse(cached));
    }
  }, []);

  useEffect(() => {
    const loadCache = async () => {
      const cached = await AsyncStorage.getItem('fullProfile');
      if (cached) {
        try {
          setProfileData(JSON.parse(cached));
        } catch (_) {}
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

  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
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
  const displayDepartment = typeof posRaw === 'object' && posRaw !== null
    ? (posRaw.department || '')
    : '';

  const deductions = Array.isArray(employee?.deduction_types) ? employee.deduction_types : [];
  const allowances = deductions.filter(
    (item) => item.type?.toLowerCase() === 'tunjangan' || (!item.type && item.name?.toLowerCase().includes('tunjangan'))
  );
  const deductionItems = deductions.filter(
    (item) => !(item.type?.toLowerCase() === 'tunjangan' || (!item.type && item.name?.toLowerCase().includes('tunjangan')))
  );

  const statusRaw = employee?.status as any;
  const displayStatus = typeof statusRaw === 'object' && statusRaw !== null
    ? (statusRaw.name || statusRaw.label || 'Aktif')
    : (typeof statusRaw === 'string' && statusRaw ? statusRaw : 'Aktif');
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=e0e7ff&color=3b82f6&size=200`;

  const InfoRow = ({ icon, label, value, isLast = false }: { icon: string, label: string, value: string, isLast?: boolean }) => (
    <View style={[styles.infoRow, !isLast && styles.borderBottom]}>
      <View style={styles.iconBox}>
        <MaterialIcons name={icon as any} size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.infoTextContainer}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '-'}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Data Karyawan',
          headerStyle: { backgroundColor: theme.colors.primary },
          headerShadowVisible: false,
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8, marginRight: 16 }}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }} 
      />

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {/* Header Background */}
        <View style={styles.headerBackground} />

        {/* Profile Card (Negative Margin for Overlap) */}
        <View style={styles.profileCard}>
          <Image 
            source={{ uri: avatarUrl }} 
            style={styles.avatar} 
          />
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.role}>{displayRole}</Text>
          <View style={styles.badgeContainer}>
            <View style={styles.badge}>
              <MaterialIcons name="verified-user" size={14} color="#10b981" />
              <Text style={styles.badgeText}>{displayStatus}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: '#eff6ff' }]}>
              <MaterialIcons name="work" size={14} color="#3b82f6" />
              <Text style={[styles.badgeText, { color: '#3b82f6' }]}>{branch?.name || 'Cabang'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {/* Tabs Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'pribadi' && styles.tabButtonActive]}
              onPress={() => setActiveTab('pribadi')}
            >
              <MaterialIcons name="person" size={20} color={activeTab === 'pribadi' ? theme.colors.primary : theme.colors.textMuted} />
              <Text style={[styles.tabText, activeTab === 'pribadi' && styles.tabTextActive]}>Informasi Pribadi</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'pegawai' && styles.tabButtonActive]}
              onPress={() => setActiveTab('pegawai')}
            >
              <MaterialIcons name="work" size={20} color={activeTab === 'pegawai' ? theme.colors.primary : theme.colors.textMuted} />
              <Text style={[styles.tabText, activeTab === 'pegawai' && styles.tabTextActive]}>Data Kepegawaian</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content inside Card */}
          <View style={styles.card}>
            {activeTab === 'pribadi' ? (
              <View>
                <InfoRow icon="credit-card" label="Nomor Induk Kependudukan (NIK)" value={employee?.nik || '-'} />
                <InfoRow icon="person" label="Nama Lengkap" value={displayName} />
                <InfoRow icon="email" label="Email" value={employee?.email || user?.email || '-'} />
                <InfoRow icon="wc" label="Jenis Kelamin" value={employee?.gender || '-'} />
                <InfoRow icon="home" label="Alamat Domisili" value={employee?.address || '-'} />
                <InfoRow icon="phone" label="Nomor Handphone" value={employee?.phone || '-'} isLast={true} />
              </View>
            ) : (
              <View>
                <InfoRow icon="badge" label="NIK Karyawan" value={employee?.nik || '-'} />
                <InfoRow icon="business" label="Kantor Cabang" value={branch?.name ? `${branch.name} (${branch.type || 'store'})` : '-'} />
                <InfoRow icon="event-available" label="Tanggal Bergabung" value={formatDateIndo(employee?.joined_date)} />
                <InfoRow icon="verified" label="Status Karyawan" value={displayStatus} />
                <InfoRow icon="work-outline" label="Jabatan / Posisi" value={displayRole} />
                {displayDepartment ? (
                  <InfoRow icon="apartment" label="Departemen" value={displayDepartment} />
                ) : null}

                {/* DAFTAR TUNJANGAN & POTONGAN GAJI (DEDUCTION TYPES) DARI DATABASE */}
                <View style={styles.deductionSection}>
                  <View style={styles.deductionHeader}>
                    <MaterialIcons name="account-balance-wallet" size={18} color={theme.colors.primary} />
                    <Text style={styles.deductionSectionTitle}>Daftar Tunjangan & Potongan Gaji</Text>
                  </View>
                  {deductions.length > 0 ? (
                    <View style={{ gap: 12 }}>
                      {allowances.length > 0 && (
                        <View style={styles.subGroupContainer}>
                          <View style={styles.subGroupHeader}>
                            <View style={[styles.dotIndicator, { backgroundColor: '#10b981' }]} />
                            <Text style={styles.subGroupTitle}>Tunjangan ({allowances.length})</Text>
                          </View>
                          <View style={styles.deductionList}>
                            {allowances.map((item, idx) => (
                              <View key={`allowance-${item.id || idx}`} style={[styles.chipBadge, styles.allowanceBadge]}>
                                <MaterialIcons name="add-circle-outline" size={14} color="#059669" />
                                <Text style={styles.allowanceBadgeText}>{item.name}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {deductionItems.length > 0 && (
                        <View style={styles.subGroupContainer}>
                          <View style={styles.subGroupHeader}>
                            <View style={[styles.dotIndicator, { backgroundColor: '#ef4444' }]} />
                            <Text style={styles.subGroupTitle}>Potongan Gaji ({deductionItems.length})</Text>
                          </View>
                          <View style={styles.deductionList}>
                            {deductionItems.map((item, idx) => (
                              <View key={`deduction-${item.id || idx}`} style={[styles.chipBadge, styles.deductionBadge]}>
                                <MaterialIcons name="remove-circle-outline" size={14} color="#dc2626" />
                                <Text style={styles.deductionBadgeText}>{item.name}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.emptyDeductionText}>Tidak ada tunjangan atau potongan terdaftar</Text>
                  )}
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.btnRequest} activeOpacity={0.8}>
            <MaterialIcons name="support-agent" size={20} color="#fff" />
            <Text style={styles.btnRequestText}>Hubungi HRD (Perubahan Data)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' }, // Slightly lighter background for modern feel
  
  headerBackground: { 
    backgroundColor: theme.colors.primary, 
    height: 120, 
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30 
  },
  
  profileCard: { 
    backgroundColor: '#fff', 
    marginHorizontal: theme.spacing.l, 
    marginTop: -80, // Negative margin to overlap the header cleanly
    borderRadius: theme.radius.xl, 
    padding: theme.spacing.xl, 
    alignItems: 'center', 
    elevation: 8, 
    shadowColor: '#3b82f6', 
    shadowOpacity: 0.15, 
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 }
  },
  
  avatar: { width: 90, height: 90, borderRadius: 45, marginBottom: 12, borderWidth: 4, borderColor: '#f1f5f9' },
  name: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  role: { fontSize: 15, color: theme.colors.textMuted, marginTop: 4 },
  
  badgeContainer: { flexDirection: 'row', marginTop: 12, gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeText: { color: '#10b981', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  
  content: { paddingHorizontal: theme.spacing.l, marginTop: theme.spacing.xl },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: theme.radius.m, padding: 4, marginBottom: theme.spacing.m },
  tabButton: { flex: 1, flexDirection: 'row', paddingVertical: 10, justifyContent: 'center', alignItems: 'center', borderRadius: theme.radius.s },
  tabButtonActive: { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  tabText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginLeft: 6 },
  tabTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  
  card: { backgroundColor: '#fff', borderRadius: theme.radius.l, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, marginBottom: theme.spacing.xl, padding: theme.spacing.s },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  infoTextContainer: { flex: 1 },
  infoLabel: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
  infoValue: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  
  btnRequest: { flexDirection: 'row', backgroundColor: theme.colors.primary, padding: 18, borderRadius: theme.radius.m, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: theme.colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  btnRequestText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },

  // Deduction & Allowance Styles
  deductionSection: {
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  deductionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  deductionSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  subGroupContainer: {
    marginBottom: 4,
  },
  subGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subGroupTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deductionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  allowanceBadge: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  allowanceBadgeText: {
    fontSize: 12,
    color: '#065f46',
    fontWeight: '600',
  },
  deductionBadge: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  deductionBadgeText: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '500',
  },
  emptyDeductionText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  }
});
