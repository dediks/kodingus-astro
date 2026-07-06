# Panduan Migrasi Lengkap VPS1 ke VPS2

Dokumen ini menggabungkan panduan migrasi sebelumnya dengan tambahan penanganan domain utama, subdomain, Laravel, PostgreSQL, Node/Vite, Nginx, SSL, dan pola troubleshooting yang sempat muncul selama proses migrasi. Pola yang dipakai mengikuti alur aman: siapkan server tujuan, pindahkan source code, migrasikan database, aktifkan web server, pasang SSL, uji aplikasi, lalu cutover DNS ke VPS2.[cite:618][cite:619]

## Gambaran proses

Urutan migrasi yang aman untuk stack Laravel dan PostgreSQL adalah sebagai berikut:[cite:618][cite:619]

1. Siapkan VPS2.
2. Salin source code dari VPS1 ke VPS2.
3. Pindahkan database PostgreSQL.
4. Install dependency aplikasi.
5. Konfigurasi Nginx.
6. Aktifkan SSL dengan Certbot.
7. Uji aplikasi dan database.
8. Arahkan DNS ke VPS2.
9. Lakukan verifikasi pascacutover.[cite:618][cite:619]

## Placeholder yang dipakai

Sesuaikan variabel berikut sebelum menjalankan command.

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

## 1. Persiapan VPS2

Pastikan VPS2 sudah bisa diakses via SSH dan service dasar tersedia. Menyiapkan server tujuan lebih dulu adalah langkah inti sebelum file, database, dan DNS dipindah.[cite:618][cite:619]

```bash
ssh ${VPS2_USER}@${VPS2_IP}
```

Kalau paket inti belum ada, instal sesuai stack yang dipakai.

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx \
  php8.4-fpm php8.4-cli php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-pgsql \
  postgresql postgresql-contrib unzip git curl
```

Jika Node.js belum ada, pasang Node sesuai versi project.

```bash
node -v
npm -v
```

## 2. Transfer source code dari VPS1 ke VPS2

Untuk source code, pola yang paling nyaman adalah `rsync` karena bisa dipakai ulang untuk incremental sync. `rsync` memang umum dipakai untuk migrasi file antarsesama VPS Linux karena efisien dan bisa menghindari transfer ulang file yang tidak berubah.[cite:619]

Siapkan folder project di VPS2:

```bash
sudo mkdir -p ${PROJECT_PATH}
sudo chown -R $USER:$USER ${PROJECT_PATH}
```

Pull source code dari VPS1:

```bash
rsync -avz \
  --exclude 'node_modules' \
  --exclude 'vendor' \
  ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/ \
  ${PROJECT_PATH}/
```

Kalau perlu copy file dump database atau backup file tunggal, gunakan `scp`.[cite:595][cite:596][cite:604]

```bash
scp ${VPS1_USER}@${VPS1_IP}:/tmp/${PROJECT}.dump /tmp/${PROJECT}.dump
```

## 3. Setup Laravel di VPS2

Masuk ke folder aplikasi lalu install dependency PHP. Pengaturan `.env`, permission, dan cache config/route/view merupakan langkah standar pascamigrasi Laravel.[cite:619]

```bash
cd ${PROJECT_PATH}
composer install --no-dev --optimize-autoloader
cp .env.example .env
nano .env
```

Contoh isi `.env` minimal:

```env
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

Lanjutkan dengan key dan cache Laravel:

```bash
php artisan key:generate
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Set permission yang dibutuhkan Laravel:

```bash
sudo chown -R www-data:www-data storage bootstrap/cache
sudo find storage -type d -exec chmod 775 {} \;
sudo find bootstrap/cache -type d -exec chmod 775 {} \;
```



### 3.1 Best practice permission untuk storage, cache, dan logs

Pada project Laravel, permission tidak cukup hanya benar di level folder `storage` dan `bootstrap/cache`; file log juga harus bisa ditulis oleh user yang menjalankan PHP-FPM atau web server. Praktik yang aman adalah memastikan owner dan group konsisten, folder bisa ditulis oleh proses aplikasi, lalu file log seperti `storage/logs/laravel.log` ikut dibuat dengan owner yang benar agar tidak muncul error seperti `failed to open stream: Permission denied` saat aplikasi menulis log.[cite:619]

Rekomendasi yang paling umum untuk deployment Nginx + PHP-FPM adalah menjadikan `www-data` sebagai group atau owner pada folder yang memang perlu write access, terutama `storage` dan `bootstrap/cache`.[cite:619]

Contoh yang aman:

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

Kalau file log belum ada atau sebelumnya dibuat oleh user yang salah, buat ulang file log dengan owner yang benar:

```bash
sudo mkdir -p storage/logs
sudo touch storage/logs/laravel.log
sudo chown $USER:www-data storage/logs/laravel.log
sudo chmod 664 storage/logs/laravel.log
```

Kalau proses PHP-FPM di server kamu berjalan sebagai `www-data`, pola di atas membuat aplikasi bisa menulis log tanpa harus memberi permission terlalu longgar seperti `777`, yang sebaiknya dihindari pada server produksi.[cite:619]

Cek juga user pool PHP-FPM bila ingin memastikan user proses yang benar:

```bash
grep -E '^(user|group)\s*=' /etc/php/8.4/fpm/pool.d/www.conf
```

Setelah permission diubah, reload PHP-FPM dan bersihkan cache Laravel:

```bash
sudo systemctl reload php8.4-fpm
php artisan optimize:clear
php artisan config:cache
```

Tanda permission log sudah benar:

- `storage/logs/laravel.log` bisa bertambah isinya saat aplikasi diakses.
- Tidak ada error `Permission denied` pada page Laravel, queue, scheduler, atau command Artisan.
- Folder `storage/framework`, `storage/logs`, dan `bootstrap/cache` tetap writable setelah deploy berikutnya.

## 4. Migrasi database PostgreSQL

Cara paling aman untuk PostgreSQL adalah dump di VPS1, salin file dump ke VPS2, lalu restore. Dump and restore adalah metode migrasi PostgreSQL yang paling umum dipakai untuk pindah antarmesin.[cite:585][cite:589]

### 4.1 Cek database dan role di VPS1

Login ke VPS1 lalu cek nama database dan user yang benar.

```bash
ssh ${VPS1_USER}@${VPS1_IP}
sudo -u postgres psql
```

Di dalam `psql`:

```sql
\l
\du
\q
```

Kalau perlu, cek `.env` project agar tahu DB mana yang benar-benar dipakai aplikasi.

```bash
cd ${PROJECT_PATH}
cat .env | grep '^DB_'
```

### 4.2 Buat dump di VPS1

Buat dump custom format agar nanti dipulihkan dengan `pg_restore`.[cite:585][cite:589]

```bash
PGPASSWORD='${DB_PASS_VPS1}' \
pg_dump -U ${DB_USER} -h localhost -d ${DB_NAME} -F c -f /tmp/${PROJECT}.dump
```

Cek file dump:

```bash
ls -lh /tmp/${PROJECT}.dump
```

Jika muncul `permission denied for table ...`, itu berarti user dump bukan owner penuh atau tidak punya hak yang cukup. Dalam kondisi itu, jalankan dump dengan owner DB atau user `postgres`.[cite:586]

```bash
sudo -u postgres pg_dump -d ${DB_NAME} -F c -f /tmp/${PROJECT}.dump
```

### 4.3 Salin dump ke VPS2

Dari VPS2:

```bash
scp ${VPS1_USER}@${VPS1_IP}:/tmp/${PROJECT}.dump /tmp/${PROJECT}.dump
```

### 4.4 Buat role dan database di VPS2

Masuk ke PostgreSQL di VPS2:

```bash
sudo -u postgres psql
```

Buat user aplikasi dan, bila perlu, role owner lama dari dump agar restore tidak error owner not found.

```sql
CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS_VPS2}';
CREATE ROLE ${DB_OLD_OWNER} LOGIN PASSWORD '${DB_OLD_OWNER_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
\du
\l
\q
```

### 4.5 Restore dump di VPS2

```bash
PGPASSWORD='${DB_PASS_VPS2}' \
pg_restore -U ${DB_USER} -h localhost -d ${DB_NAME} /tmp/${PROJECT}.dump
```

Kalau dump dibuat dari server lama yang masih menulis owner `eventtuban` atau role lain, keberadaan role itu di VPS2 akan mencegah error `role does not exist` saat restore.[cite:585][cite:587]

### 4.6 Pindahkan ownership dari role lama ke role baru

Masuk ke DB target:

```bash
sudo -u postgres psql -d ${DB_NAME}
```

Lalu jalankan urutan resmi PostgreSQL berikut.[cite:585][cite:587]

```sql
REASSIGN OWNED BY ${DB_OLD_OWNER} TO ${DB_USER};
DROP OWNED BY ${DB_OLD_OWNER};
\q
```

### 4.7 Drop role lama

Setelah ownership dan privilege dibersihkan, baru hapus role lama.

```bash
sudo -u postgres psql
```

```sql
DROP ROLE ${DB_OLD_OWNER};
\q
```

Jika `DROP ROLE` masih gagal, berarti masih ada objek atau privilege tersisa di salah satu database dalam cluster. Dokumentasi PostgreSQL memang menyarankan menjalankan `REASSIGN OWNED` dan `DROP OWNED` di setiap database yang mungkin pernah disentuh role tersebut sebelum role dihapus.[cite:585][cite:588]

### 4.8 Verifikasi restore

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
\dt
SELECT COUNT(*) FROM users;
SELECT current_database(), current_user;
\q
```

## 5. Node.js, npm, dan Vite build

Kalau project memakai frontend build, install dependency lalu build. Pada beberapa project, `npm install` bisa gagal karena konflik peer dependency, seperti kasus `react-day-picker` dengan `date-fns` versi yang tidak kompatibel.[cite:536][cite:538]

Langkah normal:

```bash
cd ${PROJECT_PATH}
npm install
npm run build
```

Jika muncul `npm ERR! code ERESOLVE`, jalankan mode legacy peer deps:

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

Kalau ingin solusi permanen, sesuaikan `package.json` agar versi dependency kompatibel. Konflik peer dependency memang harus dibereskan lewat versi paket yang cocok atau pemasangan dengan mode legacy.[cite:536][cite:538]

## 6. Konfigurasi Nginx untuk domain utama

Untuk site baru, mulailah dengan config HTTP port 80 dulu. Menulis blok 443 sebelum sertifikat tersedia bisa menyebabkan `nginx -t` gagal karena file sertifikat belum ada.[cite:489][cite:490]

Contoh file `/etc/nginx/sites-available/${PROJECT}`:

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

Aktifkan site:

```bash
sudo ln -s /etc/nginx/sites-available/${PROJECT} /etc/nginx/sites-enabled/${PROJECT}
sudo nginx -t
sudo systemctl restart nginx
```

## 7. SSL dengan Certbot untuk domain utama

Setelah Nginx port 80 aktif dan DNS sudah mengarah ke VPS2, buat sertifikat dengan Certbot. Plugin `--nginx` akan memvalidasi hostname dan menambahkan directive SSL yang dibutuhkan di konfigurasi Nginx.[cite:489][cite:490][cite:499]

```bash
sudo certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN}
```

Setelah selesai:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Final config yang rapi biasanya memakai canonical non-www seperti ini:[cite:432][cite:441]

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

## 8. Tambahan bila ada subdomain

Kalau ada subdomain seperti `app.domain.com`, `api.domain.com`, atau `admin.domain.com`, buat record DNS dan server block terpisah agar lebih mudah dikelola. Penanganan subdomain tetap mengikuti alur yang sama: DNS diarahkan ke VPS2, Nginx port 80 diaktifkan, baru SSL diissue untuk hostname tersebut.[cite:618][cite:619][cite:490]

### 8.1 DNS subdomain

Tambahkan record seperti berikut di DNS provider:

- `A` record `app` → `IP_VPS2`
- `A` record `api` → `IP_VPS2`
- `A` record `admin` → `IP_VPS2`

Pada lingkungan kerja kamu, DNS domain memang dikelola melalui Cloudflare, jadi host utama dan subdomain diarahkan ke VPS2 dari zona yang sama.[cite:447]

### 8.2 Project subdomain terpisah

Kalau subdomain adalah project terpisah, buat folder, `.env`, DB, dan Nginx sendiri.

```bash
/var/www/main-domain
/var/www/app-domain
/var/www/api-domain
```

Contoh `.env` untuk subdomain app:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://app.domain.com

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=app_domain
DB_USERNAME=app_domain
DB_PASSWORD=PASSWORD_DB
```

### 8.3 Nginx subdomain

Contoh `/etc/nginx/sites-available/app-domain`:

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

Aktifkan:

```bash
sudo ln -s /etc/nginx/sites-available/app-domain /etc/nginx/sites-enabled/app-domain
sudo nginx -t
sudo systemctl restart nginx
```

### 8.4 SSL subdomain

Issue sertifikat khusus untuk subdomain:

```bash
sudo certbot --nginx -d app.domain.com
```

Atau jika ingin beberapa host sekaligus dalam satu sertifikat:

```bash
sudo certbot --nginx -d domain.com -d www.domain.com -d app.domain.com -d api.domain.com
```

Hostname yang ingin aktif di HTTPS memang harus disebut saat issue cert agar file sertifikat dan konfigurasi Nginx yang sesuai bisa dibuat.[cite:490][cite:499]



## 8A. Satu website dengan beberapa subdomain dalam satu ekosistem

Kasus ini berbeda dari subdomain yang benar-benar project terpisah. Pada pola ini, domain utama dan beberapa subdomain masih berada di bawah satu brand atau satu website besar, misalnya `bejagung.web.id` sebagai domain utama, lalu `haul.bejagung.web.id` dan `nariyah.bejagung.web.id` sebagai subdomain fitur, microsite, atau modul yang masih terkait. Secara infrastruktur, tiap subdomain tetap harus diperlakukan sebagai hostname yang berdiri sendiri di level DNS, Nginx, dan SSL, walaupun codebase dan databasenya bisa saja sama atau saling berbagi sebagian resource.[cite:618][cite:619][cite:490]

### 8A.1 Pola arsitektur yang mungkin

Ada tiga pola yang umum dipakai:

1. **Satu codebase, banyak hostname** — misalnya satu Laravel app melayani `bejagung.web.id`, `haul.bejagung.web.id`, dan `nariyah.bejagung.web.id`, dengan route, middleware, atau konfigurasi tenant yang membedakan perilaku masing-masing hostname.
2. **Satu codebase per subdomain** — misalnya `haul` dan `nariyah` masih satu brand, tetapi masing-masing punya folder project sendiri di `/var/www/haul-bejagung` dan `/var/www/nariyah-bejagung`.
3. **Campuran** — domain utama punya project sendiri, sedangkan satu atau dua subdomain menempel ke codebase yang sama atau memakai project terpisah sesuai kebutuhan bisnis.[cite:618][cite:619]

Panduan migrasi tetap sama untuk ketiga pola itu, tetapi implementasi folder, `.env`, database, dan `server_name` di Nginx akan berbeda.[cite:618][cite:619]

### 8A.2 DNS untuk domain utama dan subdomain

Untuk contoh `bejagung.web.id`, `haul.bejagung.web.id`, dan `nariyah.bejagung.web.id`, seluruh hostname yang akan dipindah ke VPS2 harus punya record DNS yang mengarah ke IP VPS2. Kalau salah satu subdomain belum diarahkan ke VPS2, challenge HTTP dari Let’s Encrypt dan pengujian aplikasi untuk host tersebut bisa gagal.[cite:447][cite:490][cite:619]

Contoh record yang perlu ada:

- `A` record `@` → `IP_VPS2`
- `A` record `www` → `IP_VPS2` jika `www.bejagung.web.id` dipakai
- `A` record `haul` → `IP_VPS2`
- `A` record `nariyah` → `IP_VPS2`[cite:447][cite:619]

### 8A.3 Opsi A: satu codebase untuk semua subdomain

Kalau semua hostname dilayani oleh satu project Laravel yang sama, cukup satu folder project, misalnya:

```bash
/var/www/bejagung
```

Transfer source code tetap satu kali:

```bash
rsync -avz \
  --exclude 'node_modules' \
  --exclude 'vendor' \
  ${VPS1_USER}@${VPS1_IP}:/var/www/bejagung/ \
  /var/www/bejagung/
```

Contoh `.env`:

```env
APP_NAME=Bejagung
APP_ENV=production
APP_DEBUG=false
APP_URL=https://bejagung.web.id

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=bejagung
DB_USERNAME=bejagung
DB_PASSWORD=PASSWORD_DB_VPS2
```

Di level aplikasi, pembedaan `bejagung.web.id`, `haul.bejagung.web.id`, dan `nariyah.bejagung.web.id` bisa dilakukan dengan pengecekan host di route, middleware, config, atau tenancy logic.[cite:618][cite:619]

Contoh sederhana di Laravel:

```php
$host = request()->getHost();

if ($host === 'haul.bejagung.web.id') {
    // tampilkan modul haul
}

if ($host === 'nariyah.bejagung.web.id') {
    // tampilkan modul nariyah
}
```

### 8A.4 Nginx untuk satu codebase, banyak subdomain

Kalau satu codebase melayani semua hostname, kamu bisa memakai satu file Nginx dengan beberapa `server_name` yang menunjuk ke root project yang sama.[cite:489][cite:490]

Contoh HTTP dulu:

```nginx
server {
    listen 80;
    server_name bejagung.web.id www.bejagung.web.id haul.bejagung.web.id nariyah.bejagung.web.id;

    root /var/www/bejagung/public;
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

Aktifkan dan tes:

```bash
sudo ln -s /etc/nginx/sites-available/bejagung /etc/nginx/sites-enabled/bejagung
sudo nginx -t
sudo systemctl restart nginx
```

### 8A.5 SSL untuk satu domain dengan beberapa subdomain

Karena setiap subdomain adalah hostname terpisah, semuanya harus disertakan saat issue sertifikat jika ingin aktif di HTTPS. Dengan plugin `certbot --nginx`, kamu bisa meminta sertifikat untuk beberapa hostname sekaligus dalam satu perintah.[cite:489][cite:490][cite:499]

```bash
sudo certbot --nginx \
  -d bejagung.web.id \
  -d www.bejagung.web.id \
  -d haul.bejagung.web.id \
  -d nariyah.bejagung.web.id
```

Setelah sukses, blok HTTPS final biasanya tetap satu file, tetapi `server_name` memuat semua hostname tersebut.[cite:489][cite:490]

```nginx
server {
    listen 80;
    server_name bejagung.web.id www.bejagung.web.id haul.bejagung.web.id nariyah.bejagung.web.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name bejagung.web.id www.bejagung.web.id haul.bejagung.web.id nariyah.bejagung.web.id;

    root /var/www/bejagung/public;
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

    ssl_certificate /etc/letsencrypt/live/bejagung.web.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bejagung.web.id/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

Kalau kamu ingin domain utama diarahkan ke non-www, tetapi subdomain tetap dipertahankan apa adanya, aturan redirect harus dibuat lebih spesifik agar `haul.bejagung.web.id` dan `nariyah.bejagung.web.id` tidak ikut diarahkan ke host utama.[cite:432][cite:441]

### 8A.6 Opsi B: subdomain sebagai project terpisah

Kalau `haul.bejagung.web.id` dan `nariyah.bejagung.web.id` adalah aplikasi terpisah, perlakukan masing-masing sebagai project sendiri. Itu berarti source code, `.env`, build, database, dan Nginx bisa dipisah agar maintenance lebih mudah.[cite:618][cite:619]

Contoh folder:

```bash
/var/www/bejagung-main
/var/www/bejagung-haul
/var/www/bejagung-nariyah
```

Contoh sinkronisasi file:

```bash
rsync -avz ${VPS1_USER}@${VPS1_IP}:/var/www/bejagung-main/ /var/www/bejagung-main/
rsync -avz ${VPS1_USER}@${VPS1_IP}:/var/www/bejagung-haul/ /var/www/bejagung-haul/
rsync -avz ${VPS1_USER}@${VPS1_IP}:/var/www/bejagung-nariyah/ /var/www/bejagung-nariyah/
```

Contoh database terpisah:

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE bejagung LOGIN PASSWORD 'PASSWORD_MAIN';
CREATE ROLE bejagung_haul LOGIN PASSWORD 'PASSWORD_HAUL';
CREATE ROLE bejagung_nariyah LOGIN PASSWORD 'PASSWORD_NARIYAH';

CREATE DATABASE bejagung OWNER bejagung;
CREATE DATABASE bejagung_haul OWNER bejagung_haul;
CREATE DATABASE bejagung_nariyah OWNER bejagung_nariyah;
\q
```

Contoh file Nginx terpisah untuk `haul.bejagung.web.id`:

```nginx
server {
    listen 80;
    server_name haul.bejagung.web.id;

    root /var/www/bejagung-haul/public;
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
}
```

Issue sertifikat per host atau sekaligus:

```bash
sudo certbot --nginx -d bejagung.web.id -d www.bejagung.web.id -d haul.bejagung.web.id -d nariyah.bejagung.web.id
```

### 8A.7 Testing untuk domain utama + beberapa subdomain

Jangan hanya tes domain utama. Dalam pola multi-subdomain, setiap hostname harus dicek sendiri karena DNS, Nginx, SSL, dan route aplikasi bisa berbeda-beda antarhost.[cite:618][cite:619]

Contoh checklist:

```bash
curl -I http://bejagung.web.id
curl -I https://bejagung.web.id
curl -I http://haul.bejagung.web.id
curl -I https://haul.bejagung.web.id
curl -I http://nariyah.bejagung.web.id
curl -I https://nariyah.bejagung.web.id
```

Kalau semua hostname satu project Laravel, tes juga logika host di aplikasi:

```bash
cd /var/www/bejagung
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### 8A.8 Rekomendasi praktis

- Kalau `haul` dan `nariyah` hanya berbeda halaman atau modul, pakai **satu codebase** agar maintenance lebih ringan.
- Kalau masing-masing punya tim, fitur, build, atau database yang sangat berbeda, pakai **project terpisah** per subdomain.
- Untuk SSL, paling simpel minta satu sertifikat yang mencakup seluruh hostname yang memang akan dipakai di produksi.[cite:618][cite:619][cite:490]

## 9. Testing akhir sebelum cutover

Lakukan pengujian per lapisan: service, Nginx, HTTPS, Laravel, dan PostgreSQL. Pengujian berlapis sebelum DNS final diarahkan ke server baru adalah langkah penting untuk meminimalkan downtime.[cite:618][cite:619]

Cek service:

```bash
sudo nginx -t
sudo systemctl status nginx
sudo systemctl status php8.4-fpm
```

Cek HTTP dan HTTPS:

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

Cek Laravel:

```bash
cd ${PROJECT_PATH}
php artisan about
php artisan migrate:status
```

Cek database:

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
\dt
SELECT COUNT(*) FROM users;
\q
```

## 10. Cutover DNS ke VPS2

Setelah semua tes lolos, arahkan A record domain utama dan subdomain ke IP VPS2. Setelah propagasi selesai, trafik produksi akan masuk ke VPS2 dan migrasi dianggap selesai.[cite:447][cite:619]

Jika ada file upload atau storage yang berubah saat masa transisi, lakukan sync tambahan sekali lagi sebelum menutup VPS1.

```bash
rsync -avz ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/storage/ ${PROJECT_PATH}/storage/
rsync -avz ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/public/uploads/ ${PROJECT_PATH}/public/uploads/
```

## 11. Catatan troubleshooting yang sempat muncul

### PostgreSQL role lama tidak bisa dihapus

Jika `DROP ROLE oldowner;` gagal karena masih ada dependensi, jalankan di setiap database terkait:[cite:585][cite:588]

```sql
REASSIGN OWNED BY oldowner TO newowner;
DROP OWNED BY oldowner;
```

Baru setelah itu:

```sql
DROP ROLE oldowner;
```

### Nginx gagal karena SSL file belum ada

Kalau `nginx -t` gagal dengan error file `fullchain.pem` tidak ditemukan, hapus dulu blok `listen 443 ssl` atau nonaktifkan directive SSL sampai Certbot selesai membuat sertifikat.[cite:489][cite:490]

### npm install gagal karena ERESOLVE

Jika dependency frontend bentrok:

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

## 12. Checklist singkat

- VPS2 siap dan service dasar terpasang.[cite:618][cite:619]
- Source code sudah dipindah dengan `rsync`.[cite:619]
- Database PostgreSQL sudah di-dump, disalin, dan di-restore.[cite:585][cite:589]
- Ownership DB lama sudah dipindahkan ke user final.[cite:585][cite:587]
- Laravel `.env` sudah benar dan cache sudah di-refresh.[cite:619]
- Nginx port 80 sudah aktif.[cite:489][cite:490]
- Certbot berhasil issue sertifikat domain utama dan subdomain.[cite:489][cite:490][cite:499]
- Build frontend berhasil, termasuk penanganan peer dependency bila perlu.[cite:536][cite:538]
- Domain utama dan subdomain lolos test HTTP/HTTPS.[cite:618][cite:619]
- DNS utama dan subdomain sudah diarahkan ke VPS2.[cite:447]

