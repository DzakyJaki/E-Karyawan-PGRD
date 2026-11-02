import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  KedisiplinanResponse,
  MonthDetailKedisiplinan,
  AnnualRekapData,
  TeamKedisiplinanResponse,
} from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';

async function getAuthHeaders() {
  const token = await AsyncStorage.getItem('userToken');
  return {
    Authorization: token ? `Bearer ${token}` : '',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export const evaluasiService = {
  /**
   * Mengambil daftar evaluasi kedisiplinan bulanan & ringkasan tahunan karyawan
   * GET /api/my/kedisiplinan?year={year}
   */
  async getMyKedisiplinan(year: number): Promise<KedisiplinanResponse> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/my/kedisiplinan?year=${year}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gagal memuat evaluasi kedisiplinan (${res.status})`);
    }

    return await res.json();
  },

  /**
   * Mengambil detail snapshot evaluasi kedisiplinan per bulan tertentu
   * GET /api/my/kedisiplinan/{year}/{month}
   */
  async getMonthDetail(year: number, month: number): Promise<MonthDetailKedisiplinan> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/my/kedisiplinan/${year}/${month}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gagal memuat detail kedisiplinan bulan ${month}/${year} (${res.status})`);
    }

    return await res.json();
  },

  /**
   * Mengambil rekapitulasi penilaian tahunan (12 bulan)
   * GET /api/my/kedisiplinan/rekap-tahunan?year={year}
   */
  async getAnnualRekap(year: number): Promise<AnnualRekapData> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/my/kedisiplinan/rekap-tahunan?year=${year}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gagal memuat rekap tahunan (${res.status})`);
    }

    return await res.json();
  },

  /**
   * Mengambil data kedisiplinan seluruh tim / cabang
   * GET /api/my/kedisiplinan-team?year={year}&month={month}
   */
  async getTeamKedisiplinan(year: number, month: number): Promise<TeamKedisiplinanResponse> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/my/kedisiplinan-team?year=${year}&month=${month}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gagal memuat kedisiplinan tim (${res.status})`);
    }

    return await res.json();
  },
};

