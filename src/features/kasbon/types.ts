export interface KasbonSummary {
  total_active_loan?: number;
  remaining_balance?: number;
  monthly_deduction?: number;
  remaining_installments?: number;
  active_count?: number;
  pending_count?: number;
  total_pending_amount?: number;
  base_salary?: number;
  limit_available?: number;
  raw?: any;
}

export interface KasbonInstallment {
  id?: number;
  installment_number: number;
  amount: number;
  due_date?: string;
  status?: 'pending' | 'paid' | 'overdue' | string;
  paid_at?: string | null;
}

export interface KasbonItem {
  id: number;
  amount: number | string;
  installment_count: number;
  monthly_deduction: number | string;
  remaining_balance?: number | string;
  paid_amount?: number | string;
  paid_installments_count?: number;
  notes?: string;
  status: 'pending' | 'approved' | 'active' | 'rejected' | 'completed' | 'paid' | 'cancelled' | string;
  reason?: string;
  approval_notes?: string;
  approved_at?: string | null;
  rejected_at?: string | null;
  created_at: string;
  updated_at?: string;
  installments?: KasbonInstallment[];
}

export interface CreateKasbonPayload {
  amount: number;
  installment_count: number;
  monthly_deduction: number;
  notes: string;
}

