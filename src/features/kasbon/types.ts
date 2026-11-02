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

export interface KasbonPayment {
  id?: number;
  employee_loan_id?: number;
  payroll_id?: number | null;
  amount: number | string;
  payment_date?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
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
  employee_id?: number;
  branch_id?: number;
  loan_date?: string;
  amount: number | string;
  installment_count: number;
  monthly_deduction: number | string;
  remaining_balance?: number | string;
  paid_amount?: number | string;
  paid_installments_count?: number;
  notes?: string;
  status: 'pending' | 'approved' | 'active' | 'rejected' | 'completed' | 'paid' | 'cancelled' | string;
  approved_by?: number | null;
  reason?: string;
  approval_notes?: string;
  approved_at?: string | null;
  rejected_at?: string | null;
  created_at: string;
  updated_at?: string;
  payments?: KasbonPayment[];
  installments?: KasbonInstallment[];
}

export interface CreateKasbonPayload {
  amount: number;
  installment_count: number;
  monthly_deduction?: number;
  notes: string;
}
