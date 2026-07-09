---
title: "Complete VPS Migration Guide: Moving Your Laravel Stack to a New Server"
description: "A step-by-step guide to migrating a Laravel + PostgreSQL + Nginx stack from one VPS to another — covering source code transfer, database migration, SSL setup, and DNS cutover."
pubDate: 2026-07-06
heroImage: "/blog/vps-migration-hero.png"
tags: ["linux", "laravel", "nginx", "postgresql", "devops", "vps"]
---

This guide combines all the practical steps for migrating a Laravel + PostgreSQL + Nginx + Node/Vite stack from one VPS (VPS1) to another (VPS2). The safe order of operations is: prepare the destination server, transfer source code, migrate the database, configure the web server, install SSL, test the application, then cut over DNS.

## Overview

The safe migration order for a Laravel + PostgreSQL stack:

1. Prepare VPS2.
2. Transfer source code from VPS1 to VPS2.
3. Migrate the PostgreSQL database.
4. Install application dependencies.
5. Configure Nginx.
6. Enable SSL with Certbot.
7. Test the application and database.
8. Point DNS to VPS2.
9. Post-cutover verification.

## Placeholders

Customize the following variables before running any commands.

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

## 1. Prepare VPS2

Make sure VPS2 is accessible via SSH and that core services are available. Setting up the destination server first is the essential first step before files, databases, and DNS are moved.

```bash
ssh ${VPS2_USER}@${VPS2_IP}
```

If the core packages aren't installed yet, install them based on your stack.

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx \
  php8.4-fpm php8.4-cli php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-pgsql \
  postgresql postgresql-contrib unzip git curl
```

If Node.js isn't available, install the version your project requires.

```bash
node -v
npm -v
```

## 2. Transfer Source Code from VPS1 to VPS2

For source code, `rsync` is the most convenient tool because it can be re-run for incremental syncs. `rsync` is commonly used for file migration between Linux VPS instances because it's efficient and skips files that haven't changed.

Create the project folder on VPS2:

```bash
sudo mkdir -p ${PROJECT_PATH}
sudo chown -R $USER:$USER ${PROJECT_PATH}
```

Pull source code from VPS1:

```bash
rsync -avz \
  --exclude 'node_modules' \
  --exclude 'vendor' \
  ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/ \
  ${PROJECT_PATH}/
```

If you need to copy a single database dump file, use `scp`:

```bash
scp ${VPS1_USER}@${VPS1_IP}:/tmp/${PROJECT}.dump /tmp/${PROJECT}.dump
```

## 3. Set Up Laravel on VPS2

Go into the application folder and install PHP dependencies. Configuring `.env`, file permissions, and clearing config/route/view caches are standard post-migration steps for Laravel.

```bash
cd ${PROJECT_PATH}
composer install --no-dev --optimize-autoloader
cp .env.example .env
nano .env
```

Minimal `.env` example:

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

Then generate the key and cache Laravel config:

```bash
php artisan key:generate
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Set the required Laravel permissions:

```bash
sudo chown -R www-data:www-data storage bootstrap/cache
sudo find storage -type d -exec chmod 775 {} \;
sudo find bootstrap/cache -type d -exec chmod 775 {} \;
```

### 3.1 Best Practices for Storage, Cache, and Log Permissions

In a Laravel project, permissions aren't just about getting `storage` and `bootstrap/cache` right at the folder level — log files also need to be writable by the user running PHP-FPM or the web server. A safe practice is to ensure the owner and group are consistent, that application process-writable folders are set correctly, and that log files like `storage/logs/laravel.log` are created with the correct owner to avoid `failed to open stream: Permission denied` errors when the app writes logs.

The most common recommendation for Nginx + PHP-FPM deployments is to set `www-data` as the group or owner on folders that need write access, especially `storage` and `bootstrap/cache`.

A safe approach:

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

If log files don't exist or were created by the wrong user, recreate them with the correct owner:

```bash
sudo mkdir -p storage/logs
sudo touch storage/logs/laravel.log
sudo chown $USER:www-data storage/logs/laravel.log
sudo chmod 664 storage/logs/laravel.log
```

If your PHP-FPM process runs as `www-data`, the above pattern lets the application write logs without requiring overly permissive `777` permissions — which should be avoided on production servers.

Check the PHP-FPM pool user if you want to confirm the correct process user:

```bash
grep -E '^(user|group)\s*=' /etc/php/8.4/fpm/pool.d/www.conf
```

After changing permissions, reload PHP-FPM and clear the Laravel cache:

```bash
sudo systemctl reload php8.4-fpm
php artisan optimize:clear
php artisan config:cache
```

Signs that log permissions are correct:
- `storage/logs/laravel.log` grows in size as the application is accessed.
- No `Permission denied` errors on Laravel pages, queues, the scheduler, or Artisan commands.
- The `storage/framework`, `storage/logs`, and `bootstrap/cache` folders remain writable after subsequent deploys.

## 4. PostgreSQL Database Migration

The safest approach for PostgreSQL is to dump on VPS1, copy the dump file to VPS2, then restore. Dump-and-restore is the most common PostgreSQL migration method when moving between machines.

### 4.1 Check Databases and Roles on VPS1

Log into VPS1 and verify the correct database name and user.

```bash
ssh ${VPS1_USER}@${VPS1_IP}
sudo -u postgres psql
```

Inside `psql`:

```sql
\l
\du
\q
```

If needed, check the project's `.env` to confirm which database the application actually uses.

```bash
cd ${PROJECT_PATH}
cat .env | grep '^DB_'
```

### 4.2 Create a Dump on VPS1

Use the custom format dump so you can restore it with `pg_restore`.

```bash
PGPASSWORD='${DB_PASS_VPS1}' \
pg_dump -U ${DB_USER} -h localhost -d ${DB_NAME} -F c -f /tmp/${PROJECT}.dump
```

Verify the dump file:

```bash
ls -lh /tmp/${PROJECT}.dump
```

If you see `permission denied for table ...`, the dump user isn't a full owner or doesn't have sufficient rights. In that case, run the dump with the DB owner or the `postgres` user:

```bash
sudo -u postgres pg_dump -d ${DB_NAME} -F c -f /tmp/${PROJECT}.dump
```

### 4.3 Copy the Dump to VPS2

From VPS2:

```bash
scp ${VPS1_USER}@${VPS1_IP}:/tmp/${PROJECT}.dump /tmp/${PROJECT}.dump
```

### 4.4 Create Roles and Database on VPS2

Connect to PostgreSQL on VPS2:

```bash
sudo -u postgres psql
```

Create the application user and, if needed, the old owner role from the dump to prevent `role does not exist` errors during restore:

```sql
CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS_VPS2}';
CREATE ROLE ${DB_OLD_OWNER} LOGIN PASSWORD '${DB_OLD_OWNER_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
\du
\l
\q
```

### 4.5 Restore the Dump on VPS2

```bash
PGPASSWORD='${DB_PASS_VPS2}' \
pg_restore -U ${DB_USER} -h localhost -d ${DB_NAME} /tmp/${PROJECT}.dump
```

### 4.6 Reassign Ownership from Old Role to New Role

Connect to the target database:

```bash
sudo -u postgres psql -d ${DB_NAME}
```

Then run the standard PostgreSQL ownership transfer sequence:

```sql
REASSIGN OWNED BY ${DB_OLD_OWNER} TO ${DB_USER};
DROP OWNED BY ${DB_OLD_OWNER};
\q
```

### 4.7 Drop the Old Role

After ownership and privileges have been cleaned up, drop the old role:

```bash
sudo -u postgres psql
```

```sql
DROP ROLE ${DB_OLD_OWNER};
\q
```

If `DROP ROLE` still fails, it means objects or privileges remain in one of the databases in the cluster. PostgreSQL documentation recommends running `REASSIGN OWNED` and `DROP OWNED` in every database that the role may have touched before dropping the role.

### 4.8 Verify the Restore

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
\dt
SELECT COUNT(*) FROM users;
SELECT current_database(), current_user;
\q
```

## 5. Node.js, npm, and Vite Build

If the project uses a frontend build, install dependencies and build. On some projects, `npm install` can fail due to peer dependency conflicts.

Normal steps:

```bash
cd ${PROJECT_PATH}
npm install
npm run build
```

If you see `npm ERR! code ERESOLVE`, run with legacy peer deps:

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

For a permanent fix, align the versions in `package.json` so dependencies are compatible.

## 6. Configure Nginx for the Main Domain

For a new site, start with an HTTP port 80 config first. Writing a `443` block before a certificate exists will cause `nginx -t` to fail because the certificate files don't exist yet.

Example `/etc/nginx/sites-available/${PROJECT}`:

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

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/${PROJECT} /etc/nginx/sites-enabled/${PROJECT}
sudo nginx -t
sudo systemctl restart nginx
```

## 7. SSL with Certbot for the Main Domain

Once Nginx port 80 is active and DNS is pointing to VPS2, create the certificate with Certbot. The `--nginx` plugin will validate the hostname and add the required SSL directives to the Nginx configuration.

```bash
sudo certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN}
```

After completion:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

A clean final config typically uses a canonical non-www redirect like this:

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

## 8. Handling Subdomains

If you have subdomains like `app.domain.com` or `api.domain.com`, create separate DNS records and Nginx server blocks. The flow remains the same: point DNS to VPS2, enable Nginx port 80, then issue SSL for that hostname.

### 8.1 Subdomain DNS Records

Add the following records at your DNS provider:

- `A` record `app` → `IP_VPS2`
- `A` record `api` → `IP_VPS2`

### 8.2 Separate Subdomain Projects

If the subdomain is a separate project, give it its own folder, `.env`, database, and Nginx config:

```bash
/var/www/main-domain
/var/www/app-domain
/var/www/api-domain
```

### 8.3 Nginx for a Subdomain

Example `/etc/nginx/sites-available/app-domain`:

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

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/app-domain /etc/nginx/sites-enabled/app-domain
sudo nginx -t
sudo systemctl restart nginx
```

### 8.4 SSL for Subdomains

Issue a certificate just for the subdomain:

```bash
sudo certbot --nginx -d app.domain.com
```

Or include multiple hosts in a single certificate:

```bash
sudo certbot --nginx -d domain.com -d www.domain.com -d app.domain.com -d api.domain.com
```

## 9. One Website with Multiple Subdomains (Single Ecosystem)

This case differs from truly separate subdomain projects. Here, the main domain and several subdomains belong to the same brand or large website — for example, `example.com` as the main domain with `app.example.com` and `api.example.com` as feature subdomains or modules. Infrastructurally, each subdomain must still be treated as its own hostname at the DNS, Nginx, and SSL level, even if they share a codebase or database.

### Architecture Options

Three common patterns:

1. **One codebase, many hostnames** — A single Laravel app serves all hostnames, with routes, middleware, or tenant config differentiating behavior per host.
2. **One codebase per subdomain** — Each subdomain has its own project folder, even if they share a brand.
3. **Mixed** — The main domain has its own project; one or two subdomains share a codebase or use separate projects depending on business needs.

### Nginx for One Codebase, Multiple Subdomains

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

### SSL for One Domain with Multiple Subdomains

All subdomains that need HTTPS must be included when issuing the certificate:

```bash
sudo certbot --nginx \
  -d example.com \
  -d www.example.com \
  -d app.example.com \
  -d api.example.com
```

### Laravel Host-Based Routing

A simple example to differentiate behavior based on the incoming host:

```php
$host = request()->getHost();

if ($host === 'app.example.com') {
    // show app module
}

if ($host === 'api.example.com') {
    // show API module
}
```

### Practical Recommendations

- If subdomains only differ by page or module, use **one codebase** for lighter maintenance.
- If each has a separate team, feature set, build, or database, use **separate projects** per subdomain.
- For SSL, the simplest approach is one certificate covering all hostnames you need in production.

## 10. Final Testing Before Cutover

Test layer by layer: services, Nginx, HTTPS, Laravel, and PostgreSQL. Thorough testing before the final DNS switch is key to minimizing downtime.

Check services:

```bash
sudo nginx -t
sudo systemctl status nginx
sudo systemctl status php8.4-fpm
```

Check HTTP and HTTPS:

```bash
curl -I http://${DOMAIN}
curl -I http://${WWW_DOMAIN}
curl -I https://${DOMAIN}
curl -I https://${WWW_DOMAIN}
```

For subdomains:

```bash
curl -I http://${SUBDOMAIN_APP}
curl -I https://${SUBDOMAIN_APP}
curl -I http://${SUBDOMAIN_API}
curl -I https://${SUBDOMAIN_API}
```

Check Laravel:

```bash
cd ${PROJECT_PATH}
php artisan about
php artisan migrate:status
```

Check the database:

```bash
sudo -u postgres psql -d ${DB_NAME}
```

```sql
\dt
SELECT COUNT(*) FROM users;
\q
```

## 11. DNS Cutover to VPS2

Once all tests pass, update the A records for the main domain and all subdomains to point to VPS2's IP. After propagation completes, production traffic will land on VPS2 and the migration is complete.

If file uploads or storage changed during the transition window, do one more sync before shutting down VPS1:

```bash
rsync -avz ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/storage/ ${PROJECT_PATH}/storage/
rsync -avz ${VPS1_USER}@${VPS1_IP}:${PROJECT_PATH}/public/uploads/ ${PROJECT_PATH}/public/uploads/
```

## 12. Troubleshooting Notes

### PostgreSQL Old Role Cannot Be Dropped

If `DROP ROLE oldowner;` fails due to remaining dependencies, run in every related database:

```sql
REASSIGN OWNED BY oldowner TO newowner;
DROP OWNED BY oldowner;
```

Then:

```sql
DROP ROLE oldowner;
```

### Nginx Fails Because SSL Files Don't Exist Yet

If `nginx -t` fails with a `fullchain.pem not found` error, remove the `listen 443 ssl` block or disable SSL directives until Certbot has issued the certificate.

### npm install Fails with ERESOLVE

If frontend dependencies conflict:

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

## 13. Quick Checklist

- [ ] VPS2 is ready and core services are installed.
- [ ] Source code transferred with `rsync`.
- [ ] PostgreSQL database dumped, copied, and restored.
- [ ] Old DB ownership transferred to the final user.
- [ ] Laravel `.env` is correct and caches are refreshed.
- [ ] Nginx port 80 is active.
- [ ] Certbot successfully issued certificates for main domain and subdomains.
- [ ] Frontend build succeeded, including handling of peer dependency conflicts if needed.
- [ ] Main domain and subdomains pass HTTP/HTTPS tests.
- [ ] DNS A records for main domain and subdomains point to VPS2.
