import AsyncStorage from '@react-native-async-storage/async-storage';
import { KasbonSummary, KasbonItem, CreateKasbonPayload } from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://dieselmart.pagaruyungdiesel.cloud';

async function getAuthHeaders() {
  const token = await AsyncStorage.getItem('userToken');
  return {
    Authorization: token ? `Bearer ${token}` : '',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function parseKasbonItem(item: any): KasbonItem {
  const totalAmount = Number(item.amount || 0);
  const remaining = item.remaining_balance !== undefined ? Number(item.remaining_balance) : totalAmount;
  const installmentCount = Math.max(1, Number(item.installment_count || 1));
  const monthlyDeduction = Number(
    item.monthly_deduction || (installmentCount > 0 ? Math.ceil(totalAmount / installmentCount) : 0)
  );

  // Extract raw payments / deductions array if available from backend
  const rawPayments: any[] = Array.isArray(item.payments)
    ? item.payments
    : Array.isArray(item.loan_payments)
    ? item.loan_payments
    : Array.isArray(item.installments)
    ? item.installments
    : Array.isArray(item.riwayat_potongan)
    ? item.riwayat_potongan
    : Array.isArray(item.deductions)
    ? item.deductions
    : [];

  const calculatedPaidDiff = Math.max(0, totalAmount - remaining);
  const paymentsSum = rawPayments.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
  const paidAmount = Number(item.paid_amount ?? (paymentsSum > 0 ? paymentsSum : calculatedPaidDiff));

  const statusLower = (item.status || 'pending').toLowerCase();
  const isCompleted = statusLower === 'completed' || statusLower === 'paid' || statusLower === 'lunas' || statusLower === 'selesai';

  let paidInstallmentsCount = 0;
  if (isCompleted) {
    paidInstallmentsCount = installmentCount;
  } else if (item.paid_installments_count !== undefined && item.paid_installments_count !== null && Number(item.paid_installments_count) > 0) {
    paidInstallmentsCount = Number(item.paid_installments_count);
  } else if (item.paid_count !== undefined && item.paid_count !== null && Number(item.paid_count) > 0) {
    paidInstallmentsCount = Number(item.paid_count);
  } else if (item.sudah_dibayar_bulan !== undefined && item.sudah_dibayar_bulan !== null && Number(item.sudah_dibayar_bulan) > 0) {
    paidInstallmentsCount = Number(item.sudah_dibayar_bulan);
  } else if (rawPayments.length > 0) {
    paidInstallmentsCount = rawPayments.length;
  } else if (monthlyDeduction > 0 && paidAmount > 0) {
    paidInstallmentsCount = Math.min(installmentCount, Math.round(paidAmount / monthlyDeduction));
  } else if (totalAmount > 0 && calculatedPaidDiff > 0) {
    paidInstallmentsCount = Math.min(installmentCount, Math.round((calculatedPaidDiff / totalAmount) * installmentCount));
  }

  // Construct payments array: gunakan data riil jika ada, atau buat data potongan payroll yang terkonfirmasi
  const payments = rawPayments.length > 0
    ? rawPayments.map((p: any, idx: number) => ({
        id: p.id || idx + 1,
        employee_loan_id: p.employee_loan_id || item.id,
        payroll_id: p.payroll_id ?? null,
        amount: Number(p.amount || monthlyDeduction),
        payment_date: p.payment_date || p.paid_at || p.created_at || item.updated_at || item.created_at,
        notes: p.notes || `Potongan Gaji Payroll (Bulan ${idx + 1})`,
        created_at: p.created_at || item.updated_at || item.created_at,
      }))
    : Array.from({ length: paidInstallmentsCount }, (_, i) => ({
        id: i + 1,
        employee_loan_id: item.id,
        payroll_id: null,
        amount: monthlyDeduction > 0 ? monthlyDeduction : (paidInstallmentsCount > 0 ? Math.round(paidAmount / paidInstallmentsCount) : 0),
        payment_date: item.updated_at || item.loan_date || item.created_at,
        notes: `Potongan Gaji Payroll (Bulan ${i + 1})`,
        created_at: item.updated_at || item.created_at,
      }));

  return {
    id: item.id,
    employee_id: item.employee_id,
    branch_id: item.branch_id,
    loan_date: item.loan_date || item.created_at,
    amount: totalAmount,
    installment_count: installmentCount,
    monthly_deduction: monthlyDeduction,
    remaining_balance: remaining,
    paid_amount: paidAmount,
    paid_installments_count: paidInstallmentsCount,
    notes: item.notes || item.reason || '',
    status: statusLower,
    reason: item.reason,
    approval_notes: item.approval_notes,
    approved_at: item.approved_at || (statusLower === 'approved' ? item.updated_at : null),
    rejected_at: item.rejected_at || (statusLower === 'rejected' ? item.updated_at : null),
    created_at: item.created_at || item.loan_date || new Date().toISOString(),
    updated_at: item.updated_at,
    payments: payments,
    installments: payments.map((p: any, idx: number) => ({
      id: p.id,
      installment_number: idx + 1,
      amount: Number(p.amount || monthlyDeduction),
      due_date: p.payment_date,
      status: 'paid',
      paid_at: p.payment_date,
    })),
  };
}

export const kasbonService = {
  /**
   * Fetch Kasbon Summary dari Database
   * GET /api/my/kasbon/summary
   */
  async getSummary(): Promise<KasbonSummary> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/my/kasbon/summary`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gagal mengambil ringkasan kasbon (${res.status})`);
    }

    const json = await res.json();
    const data = json.data || json.summary || json;

    const remainingBal = Number(data.total_remaining_balance ?? data.remaining_balance ?? data.sisa_kasbon ?? 0);
    const activeCount = Number(data.active_loan_count ?? data.active_count ?? 0);
    const pendingAmt = Number(data.total_pending_amount ?? 0);
    const pendingCount = pendingAmt > 0 ? 1 : Number(data.pending_count || 0);

    return {
      total_active_loan: Number(data.total_active_loan ?? remainingBal),
      remaining_balance: remainingBal,
      monthly_deduction: Number(data.monthly_deduction || data.cicilan_bulanan || 0),
      remaining_installments: Number(data.remaining_installments || data.sisa_angsuran || 0),
      active_count: activeCount,
      pending_count: pendingCount,
      total_pending_amount: pendingAmt,
      base_salary: data.base_salary !== undefined ? Number(data.base_salary) : undefined,
      limit_available: data.limit_available !== undefined ? Number(data.limit_available) : undefined,
      raw: data,
    };
  },

  /**
   * Fetch Kasbon List dari Database
   * GET /api/my/kasbon?status=all
   */
  async getList(status = 'all'): Promise<KasbonItem[]> {
    const headers = await getAuthHeaders();
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/my/kasbon${query}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gagal mengambil riwayat kasbon (${res.status})`);
    }

    const json = await res.json();
    let rawList: any[] = [];

    if (Array.isArray(json.data)) {
      rawList = json.data;
    } else if (Array.isArray(json.kasbon)) {
      rawList = json.kasbon;
    } else if (Array.isArray(json)) {
      rawList = json;
    }

    return rawList.map((item: any) => parseKasbonItem(item));
  },

  /**
   * Create new Kasbon request ke Database
   * POST /api/my/kasbon
   */
  async createKasbon(payload: CreateKasbonPayload): Promise<{ success: boolean; data?: any; message?: string }> {
    const headers = await getAuthHeaders();

    // Sesuai aturan: jika potongan ditentukan oleh akuntansi di web, jangan kirim min:1000 atau kirim hanya jika > 0
    const body: Record<string, any> = {
      amount: payload.amount,
      installment_count: payload.installment_count,
      notes: payload.notes,
    };

    if (payload.monthly_deduction && payload.monthly_deduction > 0) {
      body.monthly_deduction = payload.monthly_deduction;
    }

    const res = await fetch(`${API_BASE_URL}/api/my/kasbon`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json.message || `Gagal mengajukan kasbon (${res.status})`);
    }

    return {
      success: true,
      data: json.data || json,
      message: json.message || 'Pengajuan kasbon berhasil dikirim.',
    };
  },

  /**
   * Get Kasbon Detail dari Database
   * GET /api/my/kasbon/:id
   */
  async getDetail(id: number | string): Promise<KasbonItem> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/my/kasbon/${id}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gagal mengambil detail kasbon (${res.status})`);
    }

    const json = await res.json();
    const item = json.data || json;

    return parseKasbonItem(item);
  },

  /**
   * Cancel / Delete Kasbon dari Database (khusus status pending)
   * DELETE /api/my/kasbon/:id
   */
  async cancelKasbon(id: number | string): Promise<boolean> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/my/kasbon/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Gagal membatalkan pengajuan kasbon');
    }

    return true;
  },
};
