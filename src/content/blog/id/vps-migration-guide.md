---
title: "Memindahkan Stack Laravel ke VPS Baru: Cara yang Benar-Benar Berhasil"
description: "Panduan praktis migrasi stack Laravel + PostgreSQL + Nginx antar VPS — transfer source code, migrasi database, setup SSL, dan cutover DNS."
pubDate: 2026-07-06
heroImage: "/blog/vps-migration-hero.png"
tags: ["linux", "laravel", "nginx", "postgresql", "devops", "vps"]
---

Sudah beberapa kali melakukan migrasi ini, dan setiap kali selalu ada satu langkah yang terlupa. Makanya ditulis di sini dengan benar: cara memindahkan stack Laravel + PostgreSQL + Nginx + Node/Vite dari satu VPS ke VPS lain tanpa kehilangan data atau menyebabkan downtime yang tidak perlu.

Urutannya lebih penting dari yang kebanyakan orang kira. Cutover DNS sebelum database selesai dipulihkan berarti pengguna melihat situs yang rusak. Menerbitkan sertifikat SSL sebelum Nginx benar-benar melayani port 80 berarti Certbot gagal. Ikuti urutan ini dan sebagian besar masalah bisa dihindari.

## Urutan Kerja

1. Siapkan VPS2
2. Transfer source code
3. Migrasi database PostgreSQL
4. Install dependency dan konfigurasi Laravel
5. Konfigurasi Nginx
6. Terbitkan sertifikat SSL
7. Uji semuanya
8. Cutover DNS

## Setup Variabel

Isi ini sekali dan pakai sepanjang proses. Menjalankan perintah dengan nilai yang sudah diisi menghindari banyak kesalahan copy-paste.

```bash
VPS1_USER=user_vps1
VPS1_IP=IP_VPS1
VPS2_USER=user_vps2
VPS2_IP=IP_VPS2

PROJECT=projectname
PROJECT_PATH=/var/www/projectname

DOMAIN=domain.com
WWW_DOMAIN=www.domain.com
SUBDOMAIN_APP=app.domain.com
SUBDOMAIN_API=api.domain.com

DB_NAME=projectdb
DB_USER=projectdb
DB_PASS_VPS1='PASSWORD_DB_VPS1'
DB_PASS_VPS2='PASSWORD_DB_VPS2'
DB_OLD_OWNER='oldowner'
DB_OLD_OWNER_PASS='PASSWORD_OLD_OWNER'
```

## 1. Siapkan VPS2

SSH ke VPS2 dan pastikan bisa dijangkau dulu sebelum melakukan apapun:

```bash
ssh ${VPS2_USER}@${VPS2_IP}
```

Jika package utama belum terpasang:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx \
  php8.4-fpm php8.4-cli php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-pgsql \
  postgresql postgresql-contrib unzip git curl
```

Cek juga apakah Node tersedia:

```bash
node -v
npm -v
```

## 2. Transfer Source Code

`rsync` adalah tool yang tepat di sini — bisa dilanjutkan kalau terputus, melewati file yang tidak berubah, dan bisa dijalankan berkali-kali.

Buat direktori project di VPS2 dulu:

```bash
sudo mkdir -p ${PROJECT_PATH}
sudo chown -R $USER:$USER ${PROJECT_PATH}
```

Lalu tarik semuanya dari VPS1, kecuali folder besar yang akan diinstall ulang:

```bash
rsync -avz \
  --exclude 'node_modules' \
  --exclude 'vendor' \
  ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/ \
  ${PROJECT_PATH}/
```

Kalau hanya perlu menyalin file dump database saja:

```bash
scp ${VPS1_USER}@${VPS1_IP}:/tmp/${PROJECT}.dump /tmp/${PROJECT}.dump
```

## 3. Setup Laravel di VPS2

Masuk ke folder project, install dependency PHP, dan buat file environment:

```bash
cd ${PROJECT_PATH}
composer install --no-dev --optimize-autoloader
cp .env.example .env
nano .env
```

Kunci yang paling penting untuk diisi dengan benar di `.env`:

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://domain.com

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=projectdb
DB_USERNAME=projectdb
DB_PASSWORD=PASSWORD_DB_VPS2
```

Generate app key dan rebuild cache:

```bash
php artisan key:generate
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Izin cepat untuk storage dan cache:

```bash
sudo chown -R www-data:www-data storage bootstrap/cache
sudo find storage -type d -exec chmod 775 {} \;
sudo find bootstrap/cache -type d -exec chmod 775 {} \;
```

### Soal Permission File

Di sinilah kebanyakan orang mengalami masalah. Permission di proyek Laravel bukan hanya soal folder `storage` dan `bootstrap/cache` — file log di dalam `storage/logs/` juga perlu bisa ditulis oleh user yang menjalankan PHP-FPM. Kalau salah, akan muncul `failed to open stream: Permission denied` di halaman error Laravel.

Untuk setup Nginx + PHP-FPM, pola yang paling aman adalah menjadikan user deploy sebagai pemilik dan `www-data` sebagai grup, lalu beri akses tulis pada grup di folder yang membutuhkannya:

```bash
cd ${PROJECT_PATH}

sudo chown -R $USER:www-data ${PROJECT_PATH}
sudo find ${PROJECT_PATH} -type f -exec chmod 644 {} \;
sudo find ${PROJECT_PATH} -type d -exec chmod 755 {} \;

sudo chown -R $USER:www-data storage bootstrap/cache
sudo find storage -type d -exec chmod 775 {} \;
sudo find storage -type f -exec chmod 664 {} \;
sudo find bootstrap/cache -type d -exec chmod 775 {} \;
sudo find bootstrap/cache -type f -exec chmod 664 {} \;
```

Kalau file log belum ada atau dibuat oleh root dari perintah sebelumnya:

```bash
sudo mkdir -p storage/logs
sudo touch storage/logs/laravel.log
sudo chown $USER:www-data storage/logs/laravel.log
sudo chmod 664 storage/logs/laravel.log
```

Ini menjaga kita dari permission `777`, yang kebiasaan buruk di server production manapun. Untuk memastikan user mana yang dipakai PHP-FPM pool:

```bash
grep -E '^(user|group)\s*=' /etc/php/8.4/fpm/pool.d/www.conf
```

Setelah mengubah permission, selalu reload PHP-FPM dan bersihkan cache:

```bash
sudo systemctl reload php8.4-fpm
php artisan optimize:clear
php artisan config:cache
```

Tanda permission sudah benar: `storage/logs/laravel.log` mulai bertambah ukurannya saat aplikasi diakses, dan tidak ada error permission di output Laravel, queue, maupun perintah Artisan.

## 4. Migrasi Database PostgreSQL

Cara paling aman adalah dump di VPS1, salin filenya, restore di VPS2. Jangan ambil jalan pintas — mencoba migrasi live membawa risiko yang tidak sebanding.

**Di VPS1 — cek apa yang ada:**

```bash
ssh ${VPS1_USER}@${VPS1_IP}
sudo -u postgres psql
```

```sql
\l
\du
\q
```

Cross-check dengan `.env` project kalau tidak yakin database mana yang benar-benar dipakai aplikasi:

```bash
cd ${PROJECT_PATH}
cat .env | grep '^DB_'
```

**Buat dump di VPS1:**

Gunakan format custom (`-F c`) supaya bisa di-restore dengan `pg_restore`, yang memberi lebih banyak kontrol dibanding dump SQL biasa:

```bash
PGPASSWORD='${DB_PASS_VPS1}' \
pg_dump -U ${DB_USER} -h localhost -d ${DB_NAME} -F c -f /tmp/${PROJECT}.dump
```

Verifikasi file memang ada isinya:

```bash
ls -lh /tmp/${PROJECT}.dump
```

Kalau muncul `permission denied for table`, user yang dipakai untuk dump tidak memiliki tabel tersebut. Gunakan superuser postgres:

```bash
sudo -u postgres pg_dump -d ${DB_NAME} -F c -f /tmp/${PROJECT}.dump
```

**Salin dump ke VPS2** (jalankan dari VPS2):

```bash
scp ${VPS1_USER}@${VPS1_IP}:/tmp/${PROJECT}.dump /tmp/${PROJECT}.dump
```

**Di VPS2 — buat role dan database:**

```bash
sudo -u postgres psql
```

Buat user aplikasi dan role pemilik lama. Role lama dibutuhkan untuk menghindari error `role does not exist` saat restore:

```sql
CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS_VPS2}';
CREATE ROLE ${DB_OLD_OWNER} LOGIN PASSWORD '${DB_OLD_OWNER_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
\du
\l
\q
```

**Restore:**

```bash
PGPASSWORD='${DB_PASS_VPS2}' \
pg_restore -U ${DB_USER} -h localhost -d ${DB_NAME} /tmp/${PROJECT}.dump
```

**Bersihkan role lama.** Setelah restore selesai, kepemilikan objek harus dipindah dulu sebelum role bisa di-drop:

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
REASSIGN OWNED BY ${DB_OLD_OWNER} TO ${DB_USER};
DROP OWNED BY ${DB_OLD_OWNER};
\q
```

Lalu drop:

```bash
sudo -u postgres psql
```

```sql
DROP ROLE ${DB_OLD_OWNER};
\q
```

Kalau `DROP ROLE` masih complain, berarti role itu punya objek di database lain. Jalankan sequence `REASSIGN OWNED` dan `DROP OWNED` di setiap database yang mungkin pernah disentuh role tersebut.

**Verifikasi restore terlihat benar:**

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
\dt
SELECT COUNT(*) FROM users;
SELECT current_database(), current_user;
\q
```

## 5. Node.js dan Frontend Build

Kalau project punya langkah build frontend:

```bash
cd ${PROJECT_PATH}
npm install
npm run build
```

Kalau `npm install` gagal dengan `npm ERR! code ERESOLVE`, ada konflik versi dependency. Paksa dengan:

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

Solusi permanennya adalah memperbarui `package.json` agar versi dependency kompatibel, tapi `--legacy-peer-deps` bisa buat kita lanjut dulu.

## 6. Konfigurasi Nginx

Mulai dengan HTTP saja — jangan tulis blok `443` dulu. Certbot perlu menjangkau port 80 untuk verifikasi domain, dan kalau kita referensikan file sertifikat yang belum ada, `nginx -t` akan langsung gagal.

Buat `/etc/nginx/sites-available/${PROJECT}`:

```nginx
server {
    listen 80;
    server_name domain.com www.domain.com;

    root /var/www/projectname/public;
    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~* \.(jpg|jpeg|png|gif|bmp|svg|webp|css|js|ico|ttf|otf|woff|woff2)$ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
        log_not_found off;
        access_log off;
    }

    client_max_body_size 50M;
}
```

Aktifkan dan test:

```bash
sudo ln -s /etc/nginx/sites-available/${PROJECT} /etc/nginx/sites-enabled/${PROJECT}
sudo nginx -t
sudo systemctl restart nginx
```

## 7. SSL dengan Certbot

Setelah port 80 aktif dan DNS sudah mengarah ke VPS2, jalankan Certbot:

```bash
sudo certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN}
```

Setelah selesai, test dan reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Versi final config yang bersih biasanya seperti ini — dengan redirect dari www dan plain HTTP:

```nginx
server {
    listen 80;
    server_name domain.com www.domain.com;
    return 301 https://domain.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name domain.com www.domain.com;

    root /var/www/projectname/public;
    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~* \.(jpg|jpeg|png|gif|bmp|svg|webp|css|js|ico|ttf|otf|woff|woff2)$ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
        log_not_found off;
        access_log off;
    }

    client_max_body_size 50M;

    ssl_certificate /etc/letsencrypt/live/domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

## 8. Subdomain

Kalau ada subdomain (`app.domain.com`, `api.domain.com`), prosesnya sama persis dengan domain utama — DNS record, config Nginx, sertifikat SSL. Tinggal diulangi per subdomain.

Tambahkan `A` record di DNS provider:
- `app` → `IP_VPS2`
- `api` → `IP_VPS2`

Kalau masing-masing subdomain adalah project terpisah, beri direktori sendiri:

```bash
/var/www/main-domain
/var/www/app-domain
/var/www/api-domain
```

Config Nginx untuk subdomain mirip dengan domain utama, hanya beda di `server_name` dan `root`:

```nginx
server {
    listen 80;
    server_name app.domain.com;

    root /var/www/app-domain/public;
    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    client_max_body_size 50M;
}
```

Aktifkan, lalu terbitkan SSL:

```bash
sudo ln -s /etc/nginx/sites-available/app-domain /etc/nginx/sites-enabled/app-domain
sudo nginx -t
sudo systemctl restart nginx

sudo certbot --nginx -d app.domain.com
```

Kalau mau satu sertifikat yang mencakup semuanya sekaligus:

```bash
sudo certbot --nginx -d domain.com -d www.domain.com -d app.domain.com -d api.domain.com
```

## 9. Subdomain yang Berbagi Satu Codebase

Kadang domain utama dan subdomain-nya sebenarnya satu aplikasi — codebase sama, database sama, hanya perilakunya berbeda berdasarkan hostname. Dalam kasus ini, semua hostname diarahkan ke root Nginx yang sama.

```nginx
server {
    listen 80;
    server_name example.com www.example.com app.example.com api.example.com;

    root /var/www/example/public;
    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    client_max_body_size 50M;
}
```

SSL perlu mencakup semua hostname:

```bash
sudo certbot --nginx \
  -d example.com \
  -d www.example.com \
  -d app.example.com \
  -d api.example.com
```

Dan dari sisi Laravel, bisa membedakan perilaku berdasarkan host:

```php
$host = request()->getHost();

if ($host === 'app.example.com') {
    // tampilkan modul app
}

if ($host === 'api.example.com') {
    // tampilkan modul API
}
```

Patokan praktisnya: kalau subdomain hanya berbeda bagian atau modul dari produk yang sama, satu codebase lebih mudah dikelola. Kalau punya tim, database, atau siklus deployment yang berbeda, pisahkan jadi project sendiri.

## 10. Test Sebelum Sentuh DNS

Jangan cutover DNS sebelum semuanya dicek di VPS2. Ini kesempatan terakhir menemukan masalah tanpa mempengaruhi traffic live.

Servis berjalan:

```bash
sudo nginx -t
sudo systemctl status nginx
sudo systemctl status php8.4-fpm
```

HTTP dan HTTPS merespons dengan benar:

```bash
curl -I http://${DOMAIN}
curl -I http://${WWW_DOMAIN}
curl -I https://${DOMAIN}
curl -I https://${WWW_DOMAIN}
```

Untuk subdomain:

```bash
curl -I http://${SUBDOMAIN_APP}
curl -I https://${SUBDOMAIN_APP}
curl -I http://${SUBDOMAIN_API}
curl -I https://${SUBDOMAIN_API}
```

Aplikasi Laravel sehat:

```bash
cd ${PROJECT_PATH}
php artisan about
php artisan migrate:status
```

Database terlihat benar:

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
\dt
SELECT COUNT(*) FROM users;
\q
```

## 11. Cutover DNS

Perbarui `A` record di DNS provider untuk mengarah ke IP VPS2. Waktu propagasi bervariasi — biasanya hitungan menit, kadang sampai satu jam tergantung TTL yang dikonfigurasi.

Kalau ada file upload atau file storage yang berubah di VPS1 selama proses setup VPS2, lakukan sinkronisasi terakhir sebelum mematikan VPS1:

```bash
rsync -avz ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/storage/ ${PROJECT_PATH}/storage/
rsync -avz ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/public/uploads/ ${PROJECT_PATH}/public/uploads/
```

## Troubleshooting

**`DROP ROLE` gagal** — Masih ada objek yang dimiliki role tersebut di suatu tempat. Jalankan ini di setiap database yang mungkin pernah disentuh role itu:

```sql
REASSIGN OWNED BY oldowner TO newowner;
DROP OWNED BY oldowner;
```

Lalu coba `DROP ROLE` lagi.

**`nginx -t` gagal dengan `fullchain.pem not found`** — Ada blok SSL di config tapi Certbot belum dijalankan. Comment out blok `listen 443 ssl` dan direktif sertifikat, reload Nginx, jalankan Certbot, lalu kembalikan seperti semula.

**`npm install` gagal dengan ERESOLVE** — Konflik peer dependency. Jalankan dengan `--legacy-peer-deps`:

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

## Checklist Cepat

- [ ] VPS2 bisa diakses, package utama terpasang
- [ ] Source code ditransfer dengan `rsync`
- [ ] Database PostgreSQL di-dump, disalin, dan di-restore
- [ ] Role lama dibersihkan dan di-drop
- [ ] `.env` Laravel dikonfigurasi, cache di-rebuild, permission benar
- [ ] Nginx port 80 aktif
- [ ] Sertifikat SSL berhasil diterbitkan untuk semua domain dan subdomain
- [ ] Frontend build selesai
- [ ] Semua domain lulus test HTTP/HTTPS curl
- [ ] `A` record DNS diperbarui ke VPS2
