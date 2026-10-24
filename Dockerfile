# ==========================================
# E-KARYAWAN Web Production Dockerfile
# VPS: /home/manajement_absensi/
# ==========================================
FROM nginx:alpine

# Hapus file default Nginx bawaan
RUN rm -rf /usr/share/nginx/html/*

# Salin konfigurasi Nginx untuk SPA (Single Page Application / Expo Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Salin isi folder WebServer (berisi file export web) ke dalam root HTML Nginx
COPY WebServer /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
