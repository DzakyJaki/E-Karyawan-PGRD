/**
 * timeUtils.ts
 * Utility fungsi normalisasi dan kalkulasi waktu kerja, istirahat, dan jam lembur
 */

/**
 * Normalisasi format string waktu (HH:mm) agar konsisten dalam format 24 jam.
 * Mengantisipasi input jam kerja dari backend/database admin yang menggunakan format 12 jam tanpa AM/PM
 * (contoh: jam pulang diinput "05:30" sore, otomatis dinormalisasi menjadi "17:30").
 *
 * @param timeStr String waktu target (misal: "05:30" atau "17:30")
 * @param startStr String waktu mulai/masuk sebagai acuan (misal: "08:00")
 * @returns Waktu 24 jam dalam format "HH:mm" (misal: "17:30")
 */
export function normalizeTimeString(timeStr?: string | null, startStr?: string | null): string {
  if (!timeStr) return '';
  const clean = timeStr.trim();
  const parts = clean.split(':');
  if (parts.length < 2) return clean;

  let hour = parseInt(parts[0], 10);
  const min = parts[1].substring(0, 2);
  if (isNaN(hour)) return clean;

  // Jika hour bernilai antara 1 s/d 11:
  // Cek apakah jam pulang lebih kecil dari jam masuk kerja pagi (misal jam masuk 08:00 dan jam pulang 05:30)
  if (hour >= 1 && hour <= 11) {
    if (startStr) {
      const startHour = parseInt(startStr.split(':')[0], 10);
      if (!isNaN(startHour) && startHour >= 6 && hour < startHour) {
        hour += 12;
      }
    } else if (hour <= 7) {
      // Kantor / toko normal biasanya pulang kerja sore jam 13:00 - 19:00
      hour += 12;
    }
  }

  return `${String(hour).padStart(2, '0')}:${min}`;
}

/**
 * Mendapatkan string tanggal lokal (YYYY-MM-DD) berdasarkan zona waktu perangkat lokal.
 * Mencegah pergeseran tanggal ke kemarin saat jam subuh (00:00 - 06:59 WIB) yang terjadi jika memakai toISOString().
 */
export function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Mendapatkan konfigurasi jadwal kerja aktif hari ini berdasarkan array schedules dan hari saat ini (0 = Minggu ... 6 = Sabtu).
 * Jika ada pengaturan harian spesifik (misal hari Jumat / day_of_week: 5), jadwal hari tersebut yang diutamakan.
 */
export function getEffectiveScheduleForToday(workTimeData: any, targetDate: Date = new Date()): any {
  if (!workTimeData) return null;

  const dayOfWeek = targetDate.getDay(); // 0 = Minggu, 1 = Senin, ..., 5 = Jumat, 6 = Sabtu
  const schedules = Array.isArray(workTimeData.schedules) ? workTimeData.schedules : [];
  const daySchedule = schedules.find((s: any) => Number(s.day_of_week) === dayOfWeek);

  const isClosedDay = Array.isArray(workTimeData.closed_days)
    ? workTimeData.closed_days.includes(dayOfWeek)
    : false;

  const isRestDay = Array.isArray(workTimeData.rest_days)
    ? workTimeData.rest_days.includes(dayOfWeek)
    : false;

  const isClosedToday = daySchedule?.is_closed != null
    ? Boolean(daySchedule.is_closed)
    : (Boolean(workTimeData.is_closed_today) || isClosedDay);

  const isRestToday = daySchedule?.is_rest != null
    ? Boolean(daySchedule.is_rest)
    : (Boolean(workTimeData.is_rest_today) || isRestDay);

  const isEffectiveClosedToday = isClosedToday || isRestToday;

  const rawStartTime = daySchedule?.work_start_time || workTimeData.work_start_time || '08:00';
  const rawEndTime = daySchedule?.work_end_time || workTimeData.work_end_time || '17:00';
  const normalizedEndTime = normalizeTimeString(rawEndTime, rawStartTime);

  // Deteksi Istirahat Serentak (misal hari Jumat Sholat Jumat 11:30 - 13:30)
  const simultaneousStart = daySchedule?.simultaneous_break_start || workTimeData.simultaneous_break_start || null;
  const simultaneousEnd = daySchedule?.simultaneous_break_end || workTimeData.simultaneous_break_end || null;
  const hasSimultaneousBreak = Boolean(simultaneousStart && simultaneousEnd);

  let effectiveBreakType = workTimeData.break_type || 'kantor';
  let effectiveBreakStart = workTimeData.break_start_time || null;
  let effectiveBreakEnd = workTimeData.break_end_time || null;
  let effectiveShiftName = workTimeData.break_shift_name || null;

  if (hasSimultaneousBreak) {
    // Pada hari dengan istirahat serentak (seperti Jumat 11:30 - 13:30),
    // seluruh karyawan (baik shift maupun kantor) mengikuti jendela istirahat serentak
    effectiveBreakType = 'shift';
    effectiveBreakStart = simultaneousStart;
    effectiveBreakEnd = simultaneousEnd;
    effectiveShiftName = dayOfWeek === 5 ? 'Sholat Jumat' : 'Istirahat Serentak';
  }

  const rawDispensation = daySchedule?.dispensation_time || workTimeData.dispensation_time || null;
  const rawOvertime = daySchedule?.overtime_start_time || workTimeData.overtime_start_time || null;
  const rawKantorBreakFrom = daySchedule?.kantor_break_from || workTimeData.kantor_break_from || null;
  const rawKantorBreakUntil = daySchedule?.kantor_break_until || workTimeData.kantor_break_until || null;
  const rawKantorBreakDuration = daySchedule?.kantor_break_duration != null 
    ? Number(daySchedule.kantor_break_duration) 
    : (workTimeData.kantor_break_duration != null ? Number(workTimeData.kantor_break_duration) : 60);

  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = workTimeData.day_name || DAY_NAMES[dayOfWeek];

  return {
    ...workTimeData,
    day_name: dayName,
    work_start_time: rawStartTime,
    dispensation_time: rawDispensation,
    work_end_time: normalizedEndTime,
    raw_work_end_time: rawEndTime,
    overtime_start_time: rawOvertime,
    kantor_break_from: rawKantorBreakFrom,
    kantor_break_until: rawKantorBreakUntil,
    kantor_break_duration: rawKantorBreakDuration,
    simultaneous_break_start: simultaneousStart,
    simultaneous_break_end: simultaneousEnd,
    has_simultaneous_break: hasSimultaneousBreak,
    break_type: effectiveBreakType,
    break_shift_name: effectiveShiftName,
    break_start_time: effectiveBreakStart,
    break_end_time: effectiveBreakEnd,
    is_rest_today: isRestToday,
    is_closed_today: isEffectiveClosedToday,
    is_friday: dayOfWeek === 5,
    day_of_week: dayOfWeek,
  };
}

/**
 * Menghitung jam deadline/batas selesai istirahat berdasarkan jam mulai dan durasi istirahat yang diizinkan (menit).
 * Contoh: Mulai 12:30, durasi 60m -> Batas kembali 13:30 WIB.
 * Jika melewati batas akhir rentang kantor (misal 15:00), batas dipotong pada 15:00.
 */
export function calculateBreakDeadline(
  breakStart?: string | null,
  kantorBreakDuration: number = 60,
  kantorBreakUntil?: string | null
): string | null {
  if (!breakStart) return null;
  const parts = breakStart.trim().split(':');
  if (parts.length < 2) return null;
  const startH = parseInt(parts[0], 10);
  const startM = parseInt(parts[1], 10);
  if (isNaN(startH) || isNaN(startM)) return null;

  let targetTotalMin = startH * 60 + startM + kantorBreakDuration;

  if (kantorBreakUntil) {
    const uParts = kantorBreakUntil.trim().split(':');
    if (uParts.length >= 2) {
      let uH = parseInt(uParts[0], 10);
      const uM = parseInt(uParts[1], 10);
      if (uH >= 1 && uH <= 7) uH += 12;
      const uTotal = uH * 60 + uM;
      if (!isNaN(uTotal) && targetTotalMin > uTotal) {
        targetTotalMin = uTotal;
      }
    }
  }

  const endH = Math.floor(targetTotalMin / 60) % 24;
  const endM = targetTotalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

/**
 * Menghitung status dan durasi keterlambatan istirahat berdasarkan durasi aktual istirahat (break_end - break_start)
 * terhadap kantor_break_duration (default 60 menit) atau break_end_time shift.
 */
export function calculateBreakLateDetails(
  breakStart?: string | null,
  breakEnd?: string | null,
  effectiveSchedule?: any
): { isLate: boolean; lateMinutes: number; actualDurationMinutes: number; allowedDurationMinutes: number } {
  if (!breakEnd) {
    return { isLate: false, lateMinutes: 0, actualDurationMinutes: 0, allowedDurationMinutes: 0 };
  }

  const isShift = effectiveSchedule?.break_type === 'shift' || (
    Boolean(effectiveSchedule?.break_start_time) &&
    Boolean(effectiveSchedule?.break_end_time) &&
    effectiveSchedule?.break_type !== 'kantor'
  );

  const [endH, endM] = breakEnd.split(':').map(Number);
  if (isNaN(endH) || isNaN(endM)) {
    return { isLate: false, lateMinutes: 0, actualDurationMinutes: 0, allowedDurationMinutes: 0 };
  }
  const endTotalMin = endH * 60 + endM;

  // Jika shift / istirahat serentak (misal Jumat 11:30 - 13:30)
  if (isShift && effectiveSchedule?.break_end_time) {
    const [limH, limM] = effectiveSchedule.break_end_time.split(':').map(Number);
    if (!isNaN(limH) && !isNaN(limM)) {
      const limTotalMin = limH * 60 + limM;
      const diff = endTotalMin - limTotalMin;
      return {
        isLate: diff > 0,
        lateMinutes: diff > 0 ? diff : 0,
        actualDurationMinutes: 0,
        allowedDurationMinutes: 0
      };
    }
  }

  // Tipe kantor: Karyawan istirahat maksimal selama kantor_break_duration (default 60 menit)
  const allowedDuration = Number(effectiveSchedule?.kantor_break_duration) || 60;

  let actualDuration = 0;
  if (breakStart) {
    const [sH, sM] = breakStart.split(':').map(Number);
    if (!isNaN(sH) && !isNaN(sM)) {
      actualDuration = endTotalMin - (sH * 60 + sM);
    }
  }

  const diffDuration = actualDuration > 0 ? actualDuration - allowedDuration : 0;

  // Cek juga batas akhir rentang kantor (kantor_break_until, misal 15:00)
  let diffUntil = 0;
  if (effectiveSchedule?.kantor_break_until) {
    let [uH, uM] = effectiveSchedule.kantor_break_until.split(':').map(Number);
    if (uH >= 1 && uH <= 7) uH += 12;
    const uTotalMin = uH * 60 + uM;
    if (!isNaN(uTotalMin)) {
      diffUntil = endTotalMin - uTotalMin;
    }
  }

  const maxLate = Math.max(diffDuration, diffUntil);
  return {
    isLate: maxLate > 0,
    lateMinutes: maxLate > 0 ? maxLate : 0,
    actualDurationMinutes: actualDuration > 0 ? actualDuration : 0,
    allowedDurationMinutes: allowedDuration
  };
}

