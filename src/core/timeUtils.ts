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
