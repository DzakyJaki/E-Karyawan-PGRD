# ==========================================
# E-KARYAWAN Web Production Dockerfile
# Hanya menggunakan Nginx Alpine (sangat ringan ~25MB)
# Menyajikan folder dist hasil export Expo Web
# ==========================================
FROM nginx:alpine

# Hapus file default Nginx bawaan
RUN rm -rf /usr/share/nginx/html/*

# Salin konfigurasi Nginx untuk SPA (Single Page Application / Expo Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Salin isi folder dist hasil "npx expo export -p web" ke dalam root HTML Nginx
COPY dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
