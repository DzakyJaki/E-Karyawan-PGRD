export interface KedisiplinanSummary {
  final_months_count: number;
  avg_score: number;
  annual_predicate: string;
  annual_predicate_color?: string;
  total_late_count: number;
  total_late_minutes: number;
  total_break_violations: number;
  total_incomplete: number;
}

export interface MonthlyKedisiplinan {
  id: number;
  year: number;
  month: number;
  month_name: string;
  score: number;
  predicate: string;
  predicate_color: string;
  status: 'draft' | 'approved' | string;
  status_label: string;
  total_work_days: number;
  present_days: number;
  consistency_pct: number;
  late_count: number;
  excused_late_count: number;
  total_late_minutes: number;
  early_leave_count: number;
  break_violation_count: number;
  incomplete_count: number;
  absent_count: number;
  leave_count: number;
  review_note: string | null;
  reviewed_at: string | null;
}

export interface KedisiplinanResponse {
  year: number;
  summary: KedisiplinanSummary;
  data: MonthlyKedisiplinan[];
}

export interface AttendanceLogItem {
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  is_late: boolean;
  late_minutes: number;
  is_late_excused: boolean;
  is_early_leave: boolean;
  is_break_late: boolean;
  is_incomplete: boolean;
}

export interface MonthDetailKedisiplinan {
  is_snapshot?: boolean;
  id: number;
  year: number;
  month: number;
  month_name: string;
  status: string;
  status_label: string;
  score: number;
  predicate: string;
  predicate_color: string;
  total_work_days: number;
  present_days: number;
  consistency_pct: number;
  late_count: number;
  excused_late_count: number;
  total_late_minutes: number;
  early_leave_count: number;
  break_violation_count: number;
  incomplete_count: number;
  absent_count: number;
  leave_count: number;
  penalties?: {
    unexcused_late: number;
    unexcused_late_minutes: number;
    absent_count: number;
  };
  attendance_logs?: AttendanceLogItem[];
  review_note?: string | null;
  reviewed_at?: string | null;
  correction_note?: string | null;
}

export interface AnnualMonthData {
  score: number;
  predicate: string;
  status: string;
  late_count: number;
  total_late_minutes: number;
  break_violation_count: number;
  incomplete_count: number;
  is_approved: boolean;
}

export interface AnnualRekapData {
  year: number;
  data: {
    employee_id: number;
    employee_name: string;
    nik: string;
    branch_id: number;
    branch_name: string;
    department: string;
    position_name: string;
    months: Record<string, AnnualMonthData | null>;
    final_months_count: number;
    avg_score: number;
    max_score: number;
    min_score: number;
    annual_predicate: string;
    predicate_counts: {
      sangat_disiplin: number;
      disiplin: number;
      cukup_disiplin: number;
      kurang_disiplin: number;
      tidak_disiplin: number;
    };
    totals: {
      late_count: number;
      late_minutes: number;
      break_violations: number;
      incomplete: number;
    };
  };
}

export interface TeamMemberKedisiplinan {
  id: number;
  employee_id: number;
  branch_id: number;
  department: string;
  year: number;
  month: number;
  total_work_days: number;
  present_days: number;
  late_count: number;
  excused_late_count: number;
  total_late_minutes: number;
  early_leave_count: number;
  break_violation_count: number;
  incomplete_count: number;
  absent_count: number;
  leave_count: number;
  consistency_pct: number;
  score: number;
  predicate: string;
  status: string;
  detail_json?: {
    scores?: {
      attendance_score: number;
      conduct_score: number;
    };
    penalties?: {
      unexcused_late: number;
      unexcused_late_minutes: number;
      absent_count: number;
    };
    attendance_logs?: AttendanceLogItem[];
  };
  review_note: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  correction_note: string | null;
  created_at?: string;
  updated_at?: string;
  employee?: {
    id: number;
    name: string;
    nik: string;
  };
  branch?: {
    id: number;
    name: string;
  };
}

export interface TeamKedisiplinanResponse {
  year: number;
  month: number;
  total: number;
  draft_count: number;
  approved_count: number;
  data: TeamMemberKedisiplinan[];
}

