import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { theme } from '../../../core/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useToast } from '../../../core/ToastContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SlipGajiSummary {
  id: number;
  employee_id: number;
  branch_id: number;
  period_month: number;
  period_year: number;
  total_attendance_days: number;
  base_salary: string;
  overtime_pay: string;
  allowances: string;
  deductions: string;
  deductions_detail: any;
  bonus: string;
  loan_deduction: string;
  net_salary: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  employee?: {
    nik: string;
    name: string;
    bank_name: string | null;
    bank_account_number: string | null;
  };
  branch?: {
    id: number;
    name: string;
    type?: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
}

type SlipGajiDetail = SlipGajiSummary;

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function SalaryScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  // Auth / Security States
  const [isUnlocked, setIsUnlocked] = useState(false);
  const isUnlockedRef = useRef(isUnlocked);
  useEffect(() => {
    isUnlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  const [pin, setPin] = useState('');
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [isPinConfigured, setIsPinConfigured] = useState<boolean | null>(null);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [tempPin, setTempPin] = useState('');

  // API Data States
  const [slipList, setSlipList] = useState<SlipGajiSummary[]>([]);
  const [selectedSlipIndex, setSelectedSlipIndex] = useState(0);
  const [selectedSlipDetail, setSelectedSlipDetail] = useState<SlipGajiDetail | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filter States
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState<'all' | number>('all');

  const loadSavedPin = async () => {
    try {
      const p = await AsyncStorage.getItem('app_pin');
      if (p === '123456') {
        // Hapus PIN hardcoded lama jika tersimpan dari pengujian
        await AsyncStorage.removeItem('app_pin');
        setSavedPin(null);
        setIsPinConfigured(false);
      } else if (p && p.length === 6) {
        setSavedPin(p);
        setIsPinConfigured(true);
      } else {
        setSavedPin(null);
        setIsPinConfigured(false);
      }
    } catch {
      setSavedPin(null);
      setIsPinConfigured(false);
    }
  };

  // Kunci otomatis setiap kali pengguna beralih tab atau meninggalkan layar Slip Gaji
  useFocusEffect(
    useCallback(() => {
      let isFocused = true;
      let timer: any = null;

      loadSavedPin();

      // Periksa biometrik dan buka pemindaian sidik jari HANYA jika tab Slip Gaji sedang aktif/fokus
      const initAuth = async () => {
        try {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          const canBio = Boolean(hasHardware && isEnrolled);
          if (!isFocused) return;
          setHasBiometrics(canBio);

          // Panggil sidik jari otomatis HANYA jika pengguna sedang fokus di layar Slip Gaji dan belum terbuka
          if (canBio && !isUnlockedRef.current) {
            timer = setTimeout(async () => {
              if (!isFocused) return;
              try {
                const result = await LocalAuthentication.authenticateAsync({
                  promptMessage: 'Pindai Sidik Jari untuk Buka Slip Gaji',
                  cancelLabel: 'Gunakan PIN',
                  disableDeviceFallback: true,
                });
                if (result.success && isFocused) {
                  setIsUnlocked(true);
                }
              } catch (error) {
                console.log('Autentikasi Biometrik Batal/Error', error);
              }
            }, 350);
          }
        } catch {
          if (isFocused) setHasBiometrics(false);
        }
      };

      initAuth();

      return () => {
        isFocused = false;
        if (timer) clearTimeout(timer);
        // Otomatis kunci kembali saat berpindah tab
        setIsUnlocked(false);
        setPin('');
        setTempPin('');
        setSetupStep(1);
      };
    }, [])
  );

  const authenticate = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Pindai Sidik Jari untuk Buka Slip Gaji',
        cancelLabel: 'Gunakan PIN',
        disableDeviceFallback: true,
      });

      if (result.success) {
        setIsUnlocked(true);
      }
    } catch (error) {
      console.log('Autentikasi Biometrik Batal/Error', error);
    }
  };

  const handleKeyPress = async (num: string) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
      
      if (newPin.length === 6) {
        // Ambil data PIN tersimpan secara langsung untuk menghindari delay state
        const storedPin = await AsyncStorage.getItem('app_pin');
        const activePin = (savedPin && savedPin.length === 6 && savedPin !== '123456')
          ? savedPin
          : (storedPin && storedPin.length === 6 && storedPin !== '123456' ? storedPin : null);

        // Jika belum ada PIN sama sekali, jalankan mode pembuatan PIN
        if (!activePin) {
          setTimeout(async () => {
            if (setupStep === 1) {
              setTempPin(newPin);
              setPin('');
              setSetupStep(2);
            } else if (setupStep === 2) {
              if (newPin === tempPin) {
                await AsyncStorage.setItem('app_pin', newPin);
                setSavedPin(newPin);
                setIsPinConfigured(true);
                setIsUnlocked(true);
                setPin('');
                setTempPin('');
                setSetupStep(1);
                showToast({
                  title: 'PIN Dibuat',
                  message: 'PIN Slip Gaji Anda berhasil disimpan dan diaktifkan.',
                  type: 'success'
                });
              } else {
                showToast({
                  title: 'PIN Tidak Cocok',
                  message: 'Konfirmasi PIN berbeda. Silakan masukkan dari awal.',
                  type: 'error'
                });
                setPin('');
                setTempPin('');
                setSetupStep(1);
              }
            }
          }, 300);
        } else {
          // Validasi kecocokan PIN pengguna
          if (newPin === activePin) { 
            setIsUnlocked(true);
            setPin('');
          } else {
            showToast({
              title: 'PIN Salah',
              message: 'PIN yang Anda masukkan salah. Silakan coba lagi.',
              type: 'error'
            });
            setPin('');
          }
        }
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  // Fetch Detail Slip Gaji by ID
  const fetchSlipDetail = useCallback(async (slipGajiId: number, fallbackList?: SlipGajiSummary[]) => {
    try {
      setDetailLoading(true);
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${apiUrl}/api/my/slip-gaji/${slipGajiId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      if (response.ok) {
        const json = await response.json();
        setSelectedSlipDetail(json);
      } else {
        // Fallback ke data list jika detail gagal
        const list = fallbackList || slipList;
        const fallback = list.find(s => s.id === slipGajiId);
        if (fallback) setSelectedSlipDetail(fallback);
      }
    } catch {
      const list = fallbackList || slipList;
      const fallback = list.find(s => s.id === slipGajiId);
      if (fallback) setSelectedSlipDetail(fallback);
    } finally {
      setDetailLoading(false);
    }
  }, [slipList]);

  // Fetch List Slip Gaji
  const fetchSlipGajiList = useCallback(async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/login');
        return;
      }

      const response = await fetch(`${apiUrl}/api/my/slip-gaji`, {
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
        const list: SlipGajiSummary[] = Array.isArray(json) 
          ? json 
          : (Array.isArray(json.data) ? json.data : []);
        setSlipList(list);

        if (list.length > 0) {
          fetchSlipDetail(list[0].id, list);
        }
      } else {
        console.log('Gagal fetch slip gaji, HTTP status:', response.status);
        showToast({ title: 'Gagal', message: 'Gagal memuat daftar slip gaji', type: 'error' });
      }
    } catch (error) {
      console.log('Error fetch slip gaji:', error);
      showToast({ title: 'Error', message: 'Terjadi kesalahan jaringan', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [router, fetchSlipDetail, showToast]);

  useEffect(() => {
    if (isUnlocked) {
      fetchSlipGajiList();
    }
  }, [isUnlocked, fetchSlipGajiList]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSlipGajiList();
    setRefreshing(false);
  };

  const handlePrevMonth = () => {
    if (selectedSlipIndex < slipList.length - 1) {
      const nextIdx = selectedSlipIndex + 1;
      setSelectedSlipIndex(nextIdx);
      fetchSlipDetail(slipList[nextIdx].id);
    }
  };

  const handleNextMonth = () => {
    if (selectedSlipIndex > 0) {
      const prevIdx = selectedSlipIndex - 1;
      setSelectedSlipIndex(prevIdx);
      fetchSlipDetail(slipList[prevIdx].id);
    }
  };

  const formatRupiah = (val: string | number | undefined | null) => {
    if (!val) return 'Rp 0';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return 'Rp 0';
    return 'Rp ' + Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const capitalizeName = (name?: string) => {
    if (!name) return 'Karyawan';
    return name
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Available Years from slipList
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    slipList.forEach(item => {
      if (item.period_year) years.add(item.period_year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [slipList]);

  // Filtered Slip List based on search and year
  const filteredSlipList = useMemo(() => {
    return slipList.filter(item => {
      // 1. Filter Tahun
      if (selectedYearFilter !== 'all' && item.period_year !== selectedYearFilter) {
        return false;
      }
      // 2. Search Keyword (Bulan, Tahun, Status, atau Gaji)
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase().trim();
        const mName = (MONTH_NAMES[(item.period_month || 1) - 1] || '').toLowerCase();
        const yStr = (item.period_year || '').toString();
        const combined = `${mName} ${yStr}`;
        const statusStr = (item.status || '').toLowerCase();
        const netStr = (item.net_salary || '').toString();
        const match = mName.includes(q) || yStr.includes(q) || combined.includes(q) || statusStr.includes(q) || netStr.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [slipList, selectedYearFilter, searchKeyword]);

  const currentItem = selectedSlipDetail || (slipList.length > 0 ? slipList[selectedSlipIndex] : null);

  const monthLabel = currentItem
    ? `${MONTH_NAMES[(currentItem.period_month || 1) - 1]} ${currentItem.period_year}`
    : 'Periode Gaji';

  // Calculations
  const baseSalary = parseFloat(currentItem?.base_salary || '0');
  const overtimePay = parseFloat(currentItem?.overtime_pay || '0');
  const allowances = parseFloat(currentItem?.allowances || '0');
  const bonus = parseFloat(currentItem?.bonus || '0');
  const totalEarnings = baseSalary + overtimePay + allowances + bonus;

  const deductions = parseFloat(currentItem?.deductions || '0');
  const loanDeduction = parseFloat(currentItem?.loan_deduction || '0');
  const totalDeductions = deductions + loanDeduction;

  const netSalary = currentItem?.net_salary ? parseFloat(currentItem.net_salary) : (totalEarnings - totalDeductions);

  const handleDownloadPdf = async () => {
    if (!currentItem) {
      showToast({ title: 'Error', message: 'Data slip gaji belum dimuat', type: 'error' });
      return;
    }

    try {
      setGeneratingPdf(true);
      const employeeName = capitalizeName(currentItem.employee?.name);
      const employeeNik = currentItem.employee?.nik || '-';
      const branchName = currentItem.branch?.name || '-';
      const bankInfo = currentItem.employee?.bank_name 
        ? `${currentItem.employee.bank_name} - ${currentItem.employee.bank_account_number || '-'}`
        : '-';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 32px; color: #1e293b; background: #fff; }
            .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; }
            .company { font-size: 22px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
            .title { font-size: 16px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 1px; }
            .period { font-size: 14px; color: #64748b; margin-top: 4px; }
            .meta-table { width: 100%; margin-bottom: 24px; border-collapse: collapse; }
            .meta-table td { padding: 6px 0; font-size: 13px; }
            .meta-label { color: #64748b; width: 140px; font-weight: 500; }
            .meta-val { font-weight: 600; color: #0f172a; }
            .grid { display: flex; gap: 20px; margin-bottom: 24px; }
            .col { flex: 1; }
            .table-title { font-size: 14px; font-weight: bold; padding: 8px 12px; background: #f1f5f9; border-radius: 6px; margin-bottom: 12px; }
            .table-title.earnings { color: #16a34a; background: #dcfce7; }
            .table-title.deductions { color: #dc2626; background: #fee2e2; }
            .item-table { width: 100%; border-collapse: collapse; }
            .item-table td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
            .amount { text-align: right; font-weight: 600; }
            .subtotal { font-weight: bold; background: #fafafa; border-top: 1px solid #cbd5e1; }
            .net-box { background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 8px; padding: 16px 20px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
            .net-label { font-size: 15px; font-weight: bold; color: #1e40af; }
            .net-val { font-size: 24px; font-weight: bold; color: #1d4ed8; text-align: right; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company">E-Karyawan</div>
            <div class="title">SLIP GAJI KARYAWAN</div>
            <div class="period">Periode: ${monthLabel}</div>
          </div>

          <table class="meta-table">
            <tr>
              <td class="meta-label">Nama Karyawan</td>
              <td class="meta-val">: ${employeeName}</td>
              <td class="meta-label">Kantor Cabang</td>
              <td class="meta-val">: ${branchName}</td>
            </tr>
            <tr>
              <td class="meta-label">NIK</td>
              <td class="meta-val">: ${employeeNik}</td>
              <td class="meta-label">Total Kehadiran</td>
              <td class="meta-val">: ${currentItem.total_attendance_days || 0} Hari</td>
            </tr>
            <tr>
              <td class="meta-label">Rekening Bank</td>
              <td class="meta-val">: ${bankInfo}</td>
              <td class="meta-label">Status Slip</td>
              <td class="meta-val">: ${currentItem.status === 'approved' ? 'Disetujui' : currentItem.status}</td>
            </tr>
          </table>

          <table style="width: 100%; border-collapse: collapse;">
            <tr style="vertical-align: top;">
              <td style="width: 50%; padding-right: 10px;">
                <div class="table-title earnings">PENERIMAAN (EARNINGS)</div>
                <table class="item-table">
                  <tr>
                    <td>Gaji Pokok</td>
                    <td class="amount">${formatRupiah(baseSalary)}</td>
                  </tr>
                  ${overtimePay > 0 ? `
                  <tr>
                    <td>Uang Lembur</td>
                    <td class="amount">${formatRupiah(overtimePay)}</td>
                  </tr>` : ''}
                  ${allowances > 0 ? `
                  <tr>
                    <td>Tunjangan</td>
                    <td class="amount">${formatRupiah(allowances)}</td>
                  </tr>` : ''}
                  ${bonus > 0 ? `
                  <tr>
                    <td>Bonus / Insentif</td>
                    <td class="amount">${formatRupiah(bonus)}</td>
                  </tr>` : ''}
                  <tr class="subtotal">
                    <td>Total Penerimaan</td>
                    <td class="amount" style="color: #16a34a;">${formatRupiah(totalEarnings)}</td>
                  </tr>
                </table>
              </td>
              <td style="width: 50%; padding-left: 10px;">
                <div class="table-title deductions">POTONGAN (DEDUCTIONS)</div>
                <table class="item-table">
                  <tr>
                    <td>Potongan Lainnya</td>
                    <td class="amount">- ${formatRupiah(deductions)}</td>
                  </tr>
                  ${loanDeduction > 0 ? `
                  <tr>
                    <td>Potongan Pinjaman / Kasbon</td>
                    <td class="amount">- ${formatRupiah(loanDeduction)}</td>
                  </tr>` : ''}
                  <tr class="subtotal">
                    <td>Total Potongan</td>
                    <td class="amount" style="color: #dc2626;">- ${formatRupiah(totalDeductions)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <div class="net-box">
            <table style="width: 100%;">
              <tr>
                <td class="net-label">TOTAL PENERIMAAN BERSIH (TAKE HOME PAY)</td>
                <td class="net-val">${formatRupiah(netSalary)}</td>
              </tr>
            </table>
          </div>

          <div class="footer">
            Dokumen ini sah dan diterbitkan secara digital oleh Sistem HRIS E-Karyawan<br/>
            Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </body>
        </html>
      `;

      // Gunakan Print.printAsync untuk memunculkan dialog resmi OS (Bisa simpan PDF / Cetak langsung)
      // Ini 100% didukung di Android & iOS tanpa issue permission FileProvider
      try {
        await Print.printAsync({
          html: htmlContent,
        });
        showToast({ title: 'Berhasil', message: 'Dokumen slip gaji dibuka', type: 'success' });
      } catch {
        // Fallback jika pengguna ingin export file via printToFileAsync
        try {
          const { uri } = await Print.printToFileAsync({ html: htmlContent });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: `Unduh Slip Gaji - ${monthLabel}`,
              UTI: 'com.adobe.pdf'
            });
          }
        } catch (shareErr) {
          console.log('Share canceled or error:', shareErr);
        }
      }
    } catch (err) {
      console.log('Error generating PDF:', err);
      showToast({ title: 'Error', message: 'Gagal memproses dokumen slip gaji', type: 'error' });
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Slip Gaji',
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: '#fff',
          headerLeft: () => router.canGoBack() ? (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8, marginRight: 16 }}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ) : null
        }} 
      />

      {!isUnlocked ? (
        <ScrollView 
          contentContainerStyle={styles.lockScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.headerLock}>
            <View style={styles.lockIconCircle}>
              <MaterialIcons name={!isPinConfigured ? "security" : "lock"} size={36} color={theme.colors.primary} />
            </View>
            <Text style={styles.titleLock}>
              {!isPinConfigured 
                ? (setupStep === 1 ? 'Buat PIN Slip Gaji' : 'Konfirmasi PIN Baru')
                : 'Buka Slip Gaji'}
            </Text>
            <Text style={styles.subtitleLock}>
              {!isPinConfigured
                ? (setupStep === 1 ? 'Buat 6 digit PIN untuk mengamankan data slip gaji Anda.' : 'Ketik ulang 6 digit PIN untuk konfirmasi.')
                : (hasBiometrics ? 'Pindai sidik jari atau masukkan 6 digit PIN untuk melihat slip gaji.' : 'Masukkan 6 digit PIN untuk melihat slip gaji.')}
            </Text>
          </View>

          <View style={styles.dotsContainer}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
            ))}
          </View>

          <View style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <TouchableOpacity key={num} style={styles.keyBtn} onPress={() => handleKeyPress(num)} activeOpacity={0.7}>
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
            {hasBiometrics ? (
              <TouchableOpacity style={styles.keyBtnAction} onPress={authenticate} activeOpacity={0.7}>
                <MaterialIcons name="fingerprint" size={36} color={theme.colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.keyBtnAction} />
            )}
            <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeyPress('0')} activeOpacity={0.7}>
              <Text style={styles.keyText}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.keyBtnAction} onPress={handleBackspace} activeOpacity={0.7}>
              <MaterialIcons name="backspace" size={26} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.btnResetPinHint}
            onPress={() => {
              Alert.alert(
                'Bantuan Keamanan Slip Gaji',
                hasBiometrics
                  ? 'Anda dapat membuka slip gaji menggunakan sidik jari atau PIN. Anda juga dapat mengubah PIN melalui menu Profil > PIN Keamanan.'
                  : 'Anda dapat mengatur atau memperbarui PIN melalui menu Profil > PIN Keamanan.',
                [{ text: 'Mengerti' }]
              );
            }}
          >
            <MaterialIcons name="help-outline" size={16} color={theme.colors.primary} style={{ marginRight: 4 }} />
            <Text style={styles.btnResetPinText}>Bantuan PIN & Sidik Jari</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {loading && !refreshing ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={{ marginTop: 12, color: theme.colors.textMuted }}>Memuat data slip gaji...</Text>
          </View>
        ) : slipList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="receipt-long" size={64} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Belum Ada Slip Gaji</Text>
            <Text style={styles.emptySubtitle}>Data slip gaji Anda belum diterbitkan oleh bagian HRD/Keuangan.</Text>
          </View>
        ) : (
          <>
            {/* Month Selector Header */}
            <View style={styles.monthSelector}>
              <TouchableOpacity 
                style={[styles.iconBtn, selectedSlipIndex >= slipList.length - 1 && styles.iconBtnDisabled]} 
                onPress={handlePrevMonth}
                disabled={selectedSlipIndex >= slipList.length - 1}
              >
                <MaterialIcons 
                  name="chevron-left" 
                  size={28} 
                  color={selectedSlipIndex >= slipList.length - 1 ? theme.colors.border : theme.colors.primary} 
                />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.monthCenterBtn} 
                activeOpacity={0.7}
                onPress={() => setShowMonthPicker(true)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="event" size={20} color={theme.colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.monthText}>{monthLabel}</Text>
                  <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.primary} style={{ marginLeft: 2 }} />
                </View>
                <Text style={styles.monthSubtitle}>Tekan untuk cari / ganti periode</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.iconBtn, selectedSlipIndex <= 0 && styles.iconBtnDisabled]} 
                onPress={handleNextMonth}
                disabled={selectedSlipIndex <= 0}
              >
                <MaterialIcons 
                  name="chevron-right" 
                  size={28} 
                  color={selectedSlipIndex <= 0 ? theme.colors.border : theme.colors.primary} 
                />
              </TouchableOpacity>
            </View>

            {/* Modal Cari & Filter Periode Slip Gaji */}
            <Modal
              visible={showMonthPicker}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowMonthPicker(false)}
            >
              <TouchableOpacity 
                style={styles.modalOverlay} 
                activeOpacity={1} 
                onPress={() => setShowMonthPicker(false)}
              >
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="search" size={22} color={theme.colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.modalTitle}>Cari Periode Slip Gaji</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                      <MaterialIcons name="close" size={24} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Input Pencarian */}
                  <View style={styles.searchInputWrap}>
                    <MaterialIcons name="search" size={20} color={theme.colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Ketik bulan (Januari, Okt) atau tahun..."
                      value={searchKeyword}
                      onChangeText={setSearchKeyword}
                      clearButtonMode="while-editing"
                    />
                    {searchKeyword.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchKeyword('')}>
                        <MaterialIcons name="cancel" size={18} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Filter Tahun Chips */}
                  {availableYears.length > 0 && (
                    <View style={styles.yearFilterRow}>
                      <Text style={styles.yearFilterLabel}>Tahun:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.yearChip, selectedYearFilter === 'all' && styles.yearChipActive]}
                          onPress={() => setSelectedYearFilter('all')}
                        >
                          <Text style={[styles.yearChipText, selectedYearFilter === 'all' && styles.yearChipTextActive]}>
                            Semua
                          </Text>
                        </TouchableOpacity>
                        {availableYears.map(yr => (
                          <TouchableOpacity
                            key={yr}
                            style={[styles.yearChip, selectedYearFilter === yr && styles.yearChipActive]}
                            onPress={() => setSelectedYearFilter(yr)}
                          >
                            <Text style={[styles.yearChipText, selectedYearFilter === yr && styles.yearChipTextActive]}>
                              {yr}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Daftar Hasil Pencarian Periode */}
                  <ScrollView style={{ maxHeight: 280, marginTop: 8 }}>
                    {filteredSlipList.length === 0 ? (
                      <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                        <MaterialIcons name="find-in-page" size={40} color={theme.colors.textMuted} />
                        <Text style={{ marginTop: 8, color: theme.colors.textMuted, fontSize: 13 }}>
                          Tidak ada slip gaji yang cocok
                        </Text>
                      </View>
                    ) : (
                      filteredSlipList.map((item) => {
                        const originalIndex = slipList.findIndex(s => s.id === item.id);
                        const itemLabel = `${MONTH_NAMES[(item.period_month || 1) - 1]} ${item.period_year}`;
                        const isSelected = originalIndex === selectedSlipIndex;
                        const isApproved = (item.status || '').toLowerCase() === 'approved';

                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.monthOption, isSelected && styles.monthOptionSelected]}
                            onPress={() => {
                              setSelectedSlipIndex(originalIndex >= 0 ? originalIndex : 0);
                              setShowMonthPicker(false);
                              fetchSlipDetail(item.id);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[styles.monthOptionText, isSelected && styles.monthOptionTextSelected]}>
                                  {itemLabel}
                                </Text>
                                <View style={[styles.miniStatusBadge, isApproved ? styles.miniStatusApproved : styles.miniStatusPending]}>
                                  <Text style={[styles.miniStatusText, isApproved ? { color: '#16a34a' } : { color: '#d97706' }]}>
                                    {isApproved ? 'Disetujui' : item.status}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.monthOptionSubtext}>
                                Gaji Bersih: {formatRupiah(item.net_salary)}
                              </Text>
                            </View>
                            {isSelected && (
                              <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </Modal>

            {detailLoading && (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 8 }} />
            )}

            {/* Total Card - STATUS DISETUJUI DIPINDAHKAN KE SINI */}
            <View style={styles.netCard}>
              <View style={styles.netCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.netCardTitle}>Total Penerimaan Bersih</Text>
                  <Text style={styles.netCardSubtitle}>Periode: {monthLabel}</Text>
                </View>

                {/* STATUS DISETUJUI DI TOTAL PENERIMAAN BERSIH */}
                {currentItem?.status && (
                  <View style={[
                    styles.netStatusBadge, 
                    (currentItem.status || '').toLowerCase() === 'approved' ? styles.netStatusApproved : styles.netStatusPending
                  ]}>
                    <MaterialIcons 
                      name={(currentItem.status || '').toLowerCase() === 'approved' ? 'verified' : 'hourglass-empty'} 
                      size={14} 
                      color={(currentItem.status || '').toLowerCase() === 'approved' ? '#16a34a' : '#d97706'} 
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[
                      styles.netStatusBadgeText, 
                      (currentItem.status || '').toLowerCase() === 'approved' ? styles.netStatusTextApproved : styles.netStatusTextPending
                    ]}>
                      {(currentItem.status || '').toLowerCase() === 'approved' ? 'Disetujui' : currentItem.status}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.netCardAmount}>{formatRupiah(netSalary)}</Text>
              
              <View style={styles.netCardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="event-available" size={16} color="rgba(255,255,255,0.8)" style={{ marginRight: 4 }} />
                  <Text style={styles.netCardDate}>
                    {currentItem?.paid_at 
                      ? `Dibayarkan: ${currentItem.paid_at}` 
                      : `Kehadiran: ${currentItem?.total_attendance_days || 0} Hari`}
                  </Text>
                </View>
                <MaterialIcons name="account-balance-wallet" size={22} color="rgba(255,255,255,0.7)" />
              </View>
            </View>

            {/* Slip Details */}
            <View style={styles.slipContainer}>
              <View style={styles.employeeInfo}>
                <Text style={styles.employeeName}>{capitalizeName(currentItem?.employee?.name)}</Text>
                <Text style={styles.employeeRole}>
                  NIK: {currentItem?.employee?.nik || '-'} {currentItem?.branch?.name ? `• ${currentItem.branch.name}` : ''}
                </Text>
                {currentItem?.employee?.bank_name && (
                  <Text style={styles.bankInfo}>
                    {currentItem.employee.bank_name} - {currentItem.employee.bank_account_number || '-'}
                  </Text>
                )}
              </View>

              <View style={styles.divider} />

              {/* Penerimaan */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialIcons name="add-circle-outline" size={20} color={theme.colors.success} />
                  <Text style={styles.sectionTitle}>Penerimaan</Text>
                </View>
                
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Gaji Pokok</Text>
                  <Text style={styles.rowValue}>{formatRupiah(baseSalary)}</Text>
                </View>

                {overtimePay > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Uang Lembur</Text>
                    <Text style={styles.rowValue}>{formatRupiah(overtimePay)}</Text>
                  </View>
                )}

                {allowances > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Tunjangan</Text>
                    <Text style={styles.rowValue}>{formatRupiah(allowances)}</Text>
                  </View>
                )}

                {bonus > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Bonus / Insentif</Text>
                    <Text style={styles.rowValue}>{formatRupiah(bonus)}</Text>
                  </View>
                )}
                
                <View style={[styles.row, styles.subtotalRow]}>
                  <Text style={styles.subtotalLabel}>Total Penerimaan</Text>
                  <Text style={[styles.subtotalValue, { color: theme.colors.success }]}>{formatRupiah(totalEarnings)}</Text>
                </View>
              </View>

              {/* Potongan */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialIcons name="remove-circle-outline" size={20} color={theme.colors.danger} />
                  <Text style={styles.sectionTitle}>Potongan</Text>
                </View>
                
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Potongan Lainnya</Text>
                  <Text style={styles.rowValue}>- {formatRupiah(deductions)}</Text>
                </View>

                {loanDeduction > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Potongan Pinjaman / Kasbon</Text>
                    <Text style={styles.rowValue}>- {formatRupiah(loanDeduction)}</Text>
                  </View>
                )}
                
                <View style={[styles.row, styles.subtotalRow]}>
                  <Text style={styles.subtotalLabel}>Total Potongan</Text>
                  <Text style={[styles.subtotalValue, { color: theme.colors.danger }]}>- {formatRupiah(totalDeductions)}</Text>
                </View>
              </View>
              
            </View>

            {/* Download Button */}
            <TouchableOpacity 
              style={[styles.btnDownload, generatingPdf && { opacity: 0.7 }]} 
              activeOpacity={0.8}
              onPress={handleDownloadPdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.btnDownloadText}>Menyiapkan PDF...</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="file-download" size={24} color="#fff" />
                  <Text style={styles.btnDownloadText}>Unduh PDF</Text>
                </>
              )}
            </TouchableOpacity>
            
            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5' },
  
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.m, backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },
  monthCenterBtn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 8 },
  monthText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  monthSubtitle: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  iconBtn: { padding: 8 },
  iconBtnDisabled: { opacity: 0.3 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: theme.radius.l, padding: theme.spacing.l, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderColor: '#f4f4f5', paddingBottom: 10 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.text },
  
  // Search Bar
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
    padding: 0
  },

  // Year Filter Chips
  yearFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    gap: 8
  },
  yearFilterLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.textMuted
  },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f1f5f9'
  },
  yearChipActive: {
    backgroundColor: theme.colors.primary
  },
  yearChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted
  },
  yearChipTextActive: {
    color: '#fff',
    fontWeight: 'bold'
  },

  monthOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 6, backgroundColor: '#f8fafc' },
  monthOptionSelected: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: theme.colors.primary },
  monthOptionText: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginRight: 8 },
  monthOptionTextSelected: { color: theme.colors.primary, fontWeight: 'bold' },
  monthOptionSubtext: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  miniStatusBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  miniStatusApproved: { backgroundColor: '#dcfce7' },
  miniStatusPending: { backgroundColor: '#fef3c7' },
  miniStatusText: { fontSize: 10, fontWeight: 'bold' },

  // Net Card with Status Badge
  netCard: { margin: theme.spacing.m, backgroundColor: theme.colors.primary, borderRadius: theme.radius.l, padding: theme.spacing.l, elevation: 4, shadowColor: theme.colors.primary, shadowOpacity: 0.3, shadowRadius: 8 },
  netCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs },
  netCardTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  netCardSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  netCardAmount: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginVertical: 4 },
  netCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  netCardDate: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' },

  netStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#fff'
  },
  netStatusApproved: { backgroundColor: '#dcfce7' },
  netStatusPending: { backgroundColor: '#fef3c7' },
  netStatusBadgeText: { fontSize: 11, fontWeight: 'bold' },
  netStatusTextApproved: { color: '#16a34a' },
  netStatusTextPending: { color: '#d97706' },
  
  slipContainer: { marginHorizontal: theme.spacing.m, backgroundColor: '#fff', borderRadius: theme.radius.l, padding: theme.spacing.l, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  employeeInfo: { alignItems: 'center', paddingBottom: theme.spacing.m },
  employeeName: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  employeeRole: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  bankInfo: { fontSize: 12, color: theme.colors.primary, marginTop: 4, fontWeight: '500' },
  
  divider: { height: 1, backgroundColor: theme.colors.border, borderStyle: 'dashed', marginVertical: theme.spacing.m },
  
  section: { marginBottom: theme.spacing.l },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.m },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginLeft: 8 },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  rowLabel: { fontSize: 14, color: theme.colors.textMuted, flex: 1 },
  rowValue: { fontSize: 14, color: theme.colors.text, fontWeight: '500' },
  
  subtotalRow: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12, marginTop: 4, marginBottom: 0 },
  subtotalLabel: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  subtotalValue: { fontSize: 14, fontWeight: 'bold' },
  
  btnDownload: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10b981', marginHorizontal: theme.spacing.m, marginTop: theme.spacing.s, padding: theme.spacing.l, borderRadius: theme.radius.m, elevation: 2 },
  btnDownloadText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
  
  // Security & Lock Screen Styles
  lockScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: theme.spacing.l,
    backgroundColor: '#f8fafc',
  },
  headerLock: { alignItems: 'center', marginBottom: 20 },
  lockIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#dbeafe',
  },
  titleLock: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginBottom: 6 },
  subtitleLock: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 16 },
  
  dotsContainer: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 270 },
  keyBtn: { width: 72, height: 72, justifyContent: 'center', alignItems: 'center', borderRadius: 36, margin: 5, backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  keyText: { fontSize: 26, fontWeight: '600', color: theme.colors.text },
  keyBtnAction: { width: 72, height: 72, justifyContent: 'center', alignItems: 'center', margin: 5 },
  btnResetPinHint: { flexDirection: 'row', alignItems: 'center', marginTop: 24, padding: 8 },
  btnResetPinText: { fontSize: 13, color: theme.colors.primary, fontWeight: '600' },
});
