# E-Karyawan Mobile App (HRIS) - PT. Dumai

Aplikasi Mobile HRIS (Human Resource Information System) untuk karyawan PT. Dumai berbasis **React Native** & **Expo SDK 54** (Expo Router).

## 🚀 Fitur Utama

- **Presensi GPS & Selfie**: Presensi kehadiran masuk/pulang dengan validasi radius GPS kantor cabang dan foto live.
- **Pengajuan Cuti**: Formulir pengajuan cuti, pelacakan kuota cuti tahunan, dan status persetujuan.
- **Pengajuan Lembur**: Pencatatan jam kerja lembur mandiri dan riwayat lembur.
- **Slip Gaji Digital**: Akses rincian slip gaji bulanan terlindungi autentikasi PIN & Biometrik, dengan fitur cetak PDF / berbagi slip.
- **Profil & Keamanan Akun**: Pengaturan profil karyawan, ubah kata sandi, setup PIN keamanan 6-digit, serta autentikasi biometrik (Fingerprint).
- **Pusat Panduan & Tutorial**: Panduan interaktif fitur aplikasi dengan navigasi pintas langsung ke halaman terkait.

## 🛠️ Teknologi & Stack

- **Framework**: [Expo](https://expo.dev) (SDK 54) & [React Native](https://reactnative.dev)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based routing)
- **Icons**: `@expo/vector-icons` (MaterialIcons)
- **Storage**: `@react-native-async-storage/async-storage`
- **Security**: `expo-local-authentication` (Biometrics)

## 📦 Menjalankan Project

1. **Clone repository**:
   ```bash
   git clone https://github.com/jakfarshodiq230/hris-karyawan-react-native.git
   cd hris-karyawan-react-native
   ```

2. **Install dependensi**:
   ```bash
   npm install
   ```

3. **Konfigurasi Environment**:
   Salin file `.env.example` menjadi `.env` dan sesuaikan URL backend API:
   ```bash
   cp .env.example .env
   ```

4. **Jalankan aplikasi**:
   ```bash
   npx expo start
   ```
