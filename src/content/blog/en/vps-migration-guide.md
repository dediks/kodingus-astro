---
title: "Moving a Laravel Stack to a New VPS: What Actually Worked"
description: "A practical walkthrough of migrating a Laravel + PostgreSQL + Nginx stack between two VPS instances — source code transfer, database migration, SSL setup, and DNS cutover."
pubDate: 2026-07-06
heroImage: "/blog/vps-migration-hero.png"
tags: ["linux", "laravel", "nginx", "postgresql", "devops", "vps"]
---

I've done this migration a few times now, and every time I forget at least one step. So here it is written down properly: moving a Laravel + PostgreSQL + Nginx + Node/Vite stack from one VPS to another without losing data or causing unnecessary downtime.

The order matters more than most people realize. Cutting over DNS before the database is restored means your users hit a broken site. Issuing an SSL certificate before Nginx is actually serving port 80 means Certbot fails. Do it in this sequence and you'll avoid most of the pain.

## The Order of Operations

1. Prepare VPS2
2. Transfer source code
3. Migrate the PostgreSQL database
4. Install dependencies and configure Laravel
5. Configure Nginx
6. Issue SSL certificates
7. Test everything
8. Cut over DNS

## Variable Setup

Fill these in once and use them throughout. Running the commands as-is with actual values avoids a lot of copy-paste errors.

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

## 1. Get VPS2 Ready

SSH into VPS2 and make sure it's actually reachable before doing anything else:

```bash
ssh ${VPS2_USER}@${VPS2_IP}
```

If the core packages aren't installed yet:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx \
  php8.4-fpm php8.4-cli php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-pgsql \
  postgresql postgresql-contrib unzip git curl
```

Check whether Node is available too:

```bash
node -v
npm -v
```

## 2. Transfer the Source Code

`rsync` is the right tool here — it's resumable, skips unchanged files, and you can run it multiple times if the transfer gets interrupted.

Create the project directory on VPS2 first:

```bash
sudo mkdir -p ${PROJECT_PATH}
sudo chown -R $USER:$USER ${PROJECT_PATH}
```

Then pull everything over from VPS1, excluding the heavy folders you'll reinstall anyway:

```bash
rsync -avz \
  --exclude 'node_modules' \
  --exclude 'vendor' \
  ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/ \
  ${PROJECT_PATH}/
```

If you only need to copy the database dump file specifically:

```bash
scp ${VPS1_USER}@${VPS1_IP}:/tmp/${PROJECT}.dump /tmp/${PROJECT}.dump
```

## 3. Set Up Laravel on VPS2

Go into the project folder, install PHP dependencies, and set up the environment file:

```bash
cd ${PROJECT_PATH}
composer install --no-dev --optimize-autoloader
cp .env.example .env
nano .env
```

The critical keys to get right in `.env`:

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

Generate the app key and rebuild the caches:

```bash
php artisan key:generate
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Quick permissions pass for storage and cache:

```bash
sudo chown -R www-data:www-data storage bootstrap/cache
sudo find storage -type d -exec chmod 775 {} \;
sudo find bootstrap/cache -type d -exec chmod 775 {} \;
```

### Getting File Permissions Right

This is where most people run into trouble. Permissions in a Laravel project aren't just about the `storage` and `bootstrap/cache` folders — the log files inside `storage/logs/` also need to be writable by whatever user PHP-FPM runs as. Get this wrong and you'll see `failed to open stream: Permission denied` in your Laravel error pages.

For Nginx + PHP-FPM setups, the safest pattern is to make your deploy user the owner and `www-data` the group, then give the group write access on folders that need it:

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

If the log file doesn't exist yet or was created by root during a previous command:

```bash
sudo mkdir -p storage/logs
sudo touch storage/logs/laravel.log
sudo chown $USER:www-data storage/logs/laravel.log
sudo chmod 664 storage/logs/laravel.log
```

This keeps you away from `777` permissions, which is a bad habit on any production server. To double-check which user your PHP-FPM pool actually runs as:

```bash
grep -E '^(user|group)\s*=' /etc/php/8.4/fpm/pool.d/www.conf
```

After touching permissions, always reload PHP-FPM and clear caches:

```bash
sudo systemctl reload php8.4-fpm
php artisan optimize:clear
php artisan config:cache
```

You'll know permissions are correct when `storage/logs/laravel.log` starts growing as you use the app, and there are no permission errors anywhere in the Laravel output, queues, or Artisan commands.

## 4. Migrate the PostgreSQL Database

The safest approach is dump on VPS1, copy the file, restore on VPS2. No shortcuts here — skipping the dump and trying to do a live migration introduces risk that isn't worth it.

**On VPS1 — check what you're working with:**

```bash
ssh ${VPS1_USER}@${VPS1_IP}
sudo -u postgres psql
```

```sql
\l
\du
\q
```

Cross-reference with the project's `.env` if you're not sure which database the app is actually using:

```bash
cd ${PROJECT_PATH}
cat .env | grep '^DB_'
```

**Create the dump on VPS1:**

Use the custom format (`-F c`) so you can restore it with `pg_restore`, which gives you more control than a plain SQL dump:

```bash
PGPASSWORD='${DB_PASS_VPS1}' \
pg_dump -U ${DB_USER} -h localhost -d ${DB_NAME} -F c -f /tmp/${PROJECT}.dump
```

Verify the file actually has content:

```bash
ls -lh /tmp/${PROJECT}.dump
```

If you hit `permission denied for table`, the user you're dumping as doesn't own those tables. Fall back to the postgres superuser:

```bash
sudo -u postgres pg_dump -d ${DB_NAME} -F c -f /tmp/${PROJECT}.dump
```

**Copy the dump to VPS2** (run this from VPS2):

```bash
scp ${VPS1_USER}@${VPS1_IP}:/tmp/${PROJECT}.dump /tmp/${PROJECT}.dump
```

**On VPS2 — create the roles and database:**

```bash
sudo -u postgres psql
```

Create both the app user and the old owner role. The old owner role is needed to avoid `role does not exist` errors when restoring the dump:

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

**Clean up the old owner role.** Once the restore is done, the old role's ownership needs to be transferred before you can drop it:

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
REASSIGN OWNED BY ${DB_OLD_OWNER} TO ${DB_USER};
DROP OWNED BY ${DB_OLD_OWNER};
\q
```

Then drop it:

```bash
sudo -u postgres psql
```

```sql
DROP ROLE ${DB_OLD_OWNER};
\q
```

If `DROP ROLE` still complains, the role has objects in another database. Run the `REASSIGN OWNED` and `DROP OWNED` sequence in every database that role might have touched.

**Verify the restore looked right:**

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
\dt
SELECT COUNT(*) FROM users;
SELECT current_database(), current_user;
\q
```

## 5. Node.js and the Frontend Build

If the project has a frontend build step:

```bash
cd ${PROJECT_PATH}
npm install
npm run build
```

If `npm install` dies with `npm ERR! code ERESOLVE`, the dependencies have a version conflict. Force it with:

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

The real fix is updating `package.json` to have compatible versions, but `--legacy-peer-deps` gets you unblocked for now.

## 6. Nginx Configuration

Start with HTTP only — don't write the `443` block yet. Certbot needs to reach port 80 to verify your domain, and if you reference SSL certificate files that don't exist yet, `nginx -t` will fail.

Create `/etc/nginx/sites-available/${PROJECT}`:

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

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/${PROJECT} /etc/nginx/sites-enabled/${PROJECT}
sudo nginx -t
sudo systemctl restart nginx
```

## 7. SSL with Certbot

Once port 80 is serving and DNS is pointed at VPS2, run Certbot:

```bash
sudo certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN}
```

After it completes, test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Certbot will have modified your Nginx config. A clean final version typically looks like this — with a redirect from www and plain HTTP:

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

## 8. Subdomains

If you have subdomains (`app.domain.com`, `api.domain.com`), the process is the same as the main domain — DNS record, Nginx config, SSL certificate. Just repeated per subdomain.

Add `A` records at your DNS provider:
- `app` → `IP_VPS2`
- `api` → `IP_VPS2`

If each subdomain is its own separate project, give it its own directory:

```bash
/var/www/main-domain
/var/www/app-domain
/var/www/api-domain
```

Nginx config for a subdomain looks like the main domain config, just with a different `server_name` and `root`:

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

Enable it, then issue SSL:

```bash
sudo ln -s /etc/nginx/sites-available/app-domain /etc/nginx/sites-enabled/app-domain
sudo nginx -t
sudo systemctl restart nginx

sudo certbot --nginx -d app.domain.com
```

If you want one certificate covering everything at once:

```bash
sudo certbot --nginx -d domain.com -d www.domain.com -d app.domain.com -d api.domain.com
```

## 9. When Subdomains Share a Codebase

Sometimes the main domain and its subdomains are really one app — same codebase, same database, just different behavior based on the hostname. In that case, all the hostnames point at the same Nginx root.

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

SSL needs to cover all of them:

```bash
sudo certbot --nginx \
  -d example.com \
  -d www.example.com \
  -d app.example.com \
  -d api.example.com
```

And on the Laravel side, you can branch behavior by host:

```php
$host = request()->getHost();

if ($host === 'app.example.com') {
    // show app module
}

if ($host === 'api.example.com') {
    // show API module
}
```

A quick rule of thumb: if subdomains are just different sections of the same product, one codebase is easier to maintain. If they have separate teams, separate databases, or meaningfully different deployment cycles, keep them as separate projects.

## 10. Test Before Touching DNS

Don't cut over DNS until everything checks out on VPS2. This is the last chance to catch something without affecting live traffic.

Services up:

```bash
sudo nginx -t
sudo systemctl status nginx
sudo systemctl status php8.4-fpm
```

HTTP and HTTPS responding correctly:

```bash
curl -I http://${DOMAIN}
curl -I http://${WWW_DOMAIN}
curl -I https://${DOMAIN}
curl -I https://${WWW_DOMAIN}
```

Same for subdomains:

```bash
curl -I http://${SUBDOMAIN_APP}
curl -I https://${SUBDOMAIN_APP}
curl -I http://${SUBDOMAIN_API}
curl -I https://${SUBDOMAIN_API}
```

Laravel app healthy:

```bash
cd ${PROJECT_PATH}
php artisan about
php artisan migrate:status
```

Database looks right:

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
\dt
SELECT COUNT(*) FROM users;
\q
```

## 11. DNS Cutover

Update the `A` records at your DNS provider to point at VPS2's IP. Propagation time varies — usually minutes, sometimes up to an hour depending on your TTL settings.

If any file uploads or storage files changed on VPS1 during the time you were setting up VPS2, do one final sync before you shut VPS1 down:

```bash
rsync -avz ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/storage/ ${PROJECT_PATH}/storage/
rsync -avz ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/public/uploads/ ${PROJECT_PATH}/public/uploads/
```

## Troubleshooting

**`DROP ROLE` fails** — There are still objects owned by that role somewhere. Run this in every database the role might have touched:

```sql
REASSIGN OWNED BY oldowner TO newowner;
DROP OWNED BY oldowner;
```

Then try `DROP ROLE` again.

**`nginx -t` fails with `fullchain.pem not found`** — You have an SSL block in your config but Certbot hasn't run yet. Comment out the `listen 443 ssl` block and the certificate directives, reload Nginx, run Certbot, then put them back.

**`npm install` fails with ERESOLVE** — Peer dependency conflict. Run with `--legacy-peer-deps`:

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

## Quick Checklist

- [ ] VPS2 accessible, core packages installed
- [ ] Source code transferred with `rsync`
- [ ] PostgreSQL database dumped, copied, and restored
- [ ] Old role cleaned up and dropped
- [ ] Laravel `.env` configured, caches rebuilt, permissions correct
- [ ] Nginx port 80 active
- [ ] SSL certificates issued for all domains and subdomains
- [ ] Frontend build done
- [ ] All domains pass HTTP/HTTPS curl tests
- [ ] DNS `A` records updated to VPS2
