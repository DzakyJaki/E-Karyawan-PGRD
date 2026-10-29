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

  const rawStartTime = daySchedule?.work_start_time || workTimeData.work_start_time || '00:00';
  const rawEndTime = daySchedule?.work_end_time || workTimeData.work_end_time || '00:00';
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

/**
 * Nama-nama bulan dalam bahasa Indonesia
 */
export const MONTH_NAMES_INDONESIA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Nama-nama hari dalam bahasa Indonesia (0 = Minggu ... 6 = Sabtu)
 */
export const DAY_NAMES_INDONESIA = [
  'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'
];

/**
 * Mendapatkan timezone perangkat secara otomatis (default fallback: 'Asia/Jakarta' untuk WIB)
 */
export function getDeviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {}
  return 'Asia/Jakarta';
}

/**
 * Menentukan singkatan zona waktu Indonesia secara otomatis (WIB, WITA, WIT)
 * berdasarkan timezone yang terdeteksi dari perangkat / Asia/Jakarta.
 */
export function getTimeZoneAbbrev(date: Date = new Date(), timeZone?: string): string {
  const tz = (timeZone || getDeviceTimeZone()).toLowerCase();
  if (tz.includes('jakarta') || tz.includes('pontianak') || tz.includes('bangkok') || tz.includes('saigon')) {
    return 'WIB';
  }
  if (tz.includes('makassar') || tz.includes('ujung_pandang') || tz.includes('bali') || tz.includes('singapore') || tz.includes('kuala_lumpur')) {
    return 'WITA';
  }
  if (tz.includes('jayapura')) {
    return 'WIT';
  }

  try {
    const targetTz = timeZone || getDeviceTimeZone();
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: targetTz }));
    const diffMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
    if (diffMinutes === 420) return 'WIB';   // UTC+7
    if (diffMinutes === 480) return 'WITA';  // UTC+8
    if (diffMinutes === 540) return 'WIT';   // UTC+9
  } catch {
    const offsetMin = -date.getTimezoneOffset();
    if (offsetMin === 420) return 'WIB';
    if (offsetMin === 480) return 'WITA';
    if (offsetMin === 540) return 'WIT';
  }

  return 'WIB';
}

/**
 * Parsing data tanggal dan waktu dari string server ke zona waktu Asia/Jakarta.
 * Mengantisipasi format ISO UTC (2026-10-29T01:25:55.000000Z),
 * format MySQL tanpa offset (2026-10-29 08:25:55),
 * maupun format tanggal saja (2026-10-29).
 */
export function parseDateAsiaJakarta(input?: string | Date | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  const s = String(input).trim();
  if (!s) return null;

  // Format YYYY-MM-DD (tanggal kalender saja)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Format ISO dengan timezone eksplisit (Z atau offset +07:00 / -05:00)
  if (/T.*\d(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Format YYYY-MM-DD HH:mm:ss atau YYYY-MM-DDTHH:mm:ss tanpa timezone
  // Dianggap sebagai data waktu Asia/Jakarta (+07:00) dari backend
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(s)) {
    const iso = s.replace(' ', 'T');
    if (!iso.includes('+') && !iso.includes('Z')) {
      const parts = iso.split('T');
      const timeParts = parts[1].split(':');
      const sec = timeParts[2] ? timeParts[2].split('.')[0] : '00';
      const cleanIso = `${parts[0]}T${timeParts[0]}:${timeParts[1]}:${sec}+07:00`;
      const parsed = new Date(cleanIso);
      if (!isNaN(parsed.getTime())) return parsed;
    } else {
      const parsed = new Date(iso);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Format tanggal ke bahasa Indonesia (Hari, Tanggal Bulan Tahun)
 * Contoh: "Kamis, 29 Oktober 2026" atau "Kamis, 29 Okt 2026"
 */
export function formatDateIndo(
  dateInput?: string | Date | null,
  shortMonth: boolean = false,
  includeDayName: boolean = true
): string {
  if (!dateInput) return '--';

  // Jika formatnya murni YYYY-MM-DD
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [y, m, d] = dateInput.trim().split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayName = DAY_NAMES_INDONESIA[dateObj.getDay()] || '';
    const rawMonth = MONTH_NAMES_INDONESIA[m - 1] || String(m);
    const monthName = shortMonth ? rawMonth.substring(0, 3) : rawMonth;
    return includeDayName && dayName
      ? `${dayName}, ${d} ${monthName} ${y}`
      : `${d} ${monthName} ${y}`;
  }

  const dateObj = parseDateAsiaJakarta(dateInput);
  if (!dateObj) return typeof dateInput === 'string' ? dateInput : '--';

  const tz = getDeviceTimeZone();
  try {
    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      weekday: includeDayName ? 'long' : undefined,
      year: 'numeric',
      month: shortMonth ? 'short' : 'long',
      day: 'numeric'
    });
    return formatter.format(dateObj);
  } catch {
    const dayName = DAY_NAMES_INDONESIA[dateObj.getDay()] || '';
    const d = dateObj.getDate();
    const m = dateObj.getMonth();
    const y = dateObj.getFullYear();
    const rawMonth = MONTH_NAMES_INDONESIA[m] || '';
    const monthName = shortMonth ? rawMonth.substring(0, 3) : rawMonth;
    return includeDayName && dayName
      ? `${dayName}, ${d} ${monthName} ${y}`
      : `${d} ${monthName} ${y}`;
  }
}

/**
 * Format tanggal dan waktu ke bahasa Indonesia dengan zona waktu otomatis
 * Contoh: "29 Okt 2026, 08:25 WIB" atau "Kamis, 29 Oktober 2026 • 08:25 WIB"
 */
export function formatDateTimeIndo(
  dateTimeInput?: string | Date | null,
  options?: {
    shortMonth?: boolean;
    includeDayName?: boolean;
    separator?: string;
  }
): string {
  if (!dateTimeInput) return '--';

  const dateObj = parseDateAsiaJakarta(dateTimeInput);
  if (!dateObj) return typeof dateTimeInput === 'string' ? dateTimeInput : '--';

  const shortMonth = options?.shortMonth ?? true;
  const includeDayName = options?.includeDayName ?? false;
  const separator = options?.separator ?? ', ';

  const tz = getDeviceTimeZone();
  const tzAbbrev = getTimeZoneAbbrev(dateObj, tz);

  try {
    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: shortMonth ? 'short' : 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(dateObj);
    const getVal = (type: string) => parts.find(p => p.type === type)?.value || '';

    const dayName = getVal('weekday');
    const day = getVal('day');
    const month = getVal('month');
    const year = getVal('year');
    const hour = getVal('hour');
    const minute = getVal('minute');

    const dateStr = includeDayName && dayName
      ? `${dayName}, ${day} ${month} ${year}`
      : `${day} ${month} ${year}`;
    const timeStr = `${hour}:${minute} ${tzAbbrev}`;

    return `${dateStr}${separator}${timeStr}`;
  } catch {
    const d = dateObj.getDate();
    const m = dateObj.getMonth();
    const y = dateObj.getFullYear();
    const rawMonth = MONTH_NAMES_INDONESIA[m] || '';
    const monthName = shortMonth ? rawMonth.substring(0, 3) : rawMonth;
    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    const dayName = DAY_NAMES_INDONESIA[dateObj.getDay()] || '';

    const dateStr = includeDayName && dayName
      ? `${dayName}, ${d} ${monthName} ${y}`
      : `${d} ${monthName} ${y}`;
    return `${dateStr}${separator}${h}:${min} ${tzAbbrev}`;
  }
}

/**
 * Format waktu saja ke format 24 jam dengan zona waktu otomatis
 * Contoh: "08:25 WIB"
 */
export function formatTimeIndo(timeInput?: string | Date | null): string {
  if (!timeInput) return '--:--';
  const tzAbbrev = getTimeZoneAbbrev();

  if (typeof timeInput === 'string') {
    const clean = timeInput.trim();
    // Jika format HH:mm atau HH:mm:ss
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) {
      return `${clean.substring(0, 5)} ${tzAbbrev}`;
    }
  }

  const dateObj = parseDateAsiaJakarta(timeInput);
  if (!dateObj) return typeof timeInput === 'string' ? timeInput : '--:--';

  const tz = getDeviceTimeZone();
  try {
    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return `${formatter.format(dateObj)} ${tzAbbrev}`;
  } catch {
    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${h}:${min} ${tzAbbrev}`;
  }
}

