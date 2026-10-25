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

  const isClosedToday = daySchedule?.is_closed != null
    ? Boolean(daySchedule.is_closed)
    : (Boolean(workTimeData.is_closed_today) || isClosedDay);

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
  const rawKantorBreakUntil = daySchedule?.kantor_break_until || workTimeData.kantor_break_until || null;

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
    kantor_break_until: rawKantorBreakUntil,
    simultaneous_break_start: simultaneousStart,
    simultaneous_break_end: simultaneousEnd,
    has_simultaneous_break: hasSimultaneousBreak,
    break_type: effectiveBreakType,
    break_shift_name: effectiveShiftName,
    break_start_time: effectiveBreakStart,
    break_end_time: effectiveBreakEnd,
    is_closed_today: isClosedToday,
    is_friday: dayOfWeek === 5,
    day_of_week: dayOfWeek,
  };
}

