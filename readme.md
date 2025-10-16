# WordPress Pete Docker Environment 

This **README** groups the most‑used commands and maintenance tasks for running WordPress Pete locally with Docker. Feel free to adapt it to your own workflow.

---

\## 1. Prerequisites

- **Docker Engine** ≥ 20.10
- **Docker Compose**
  - macOS (Docker Desktop ≤ v1): `docker‑compose`
  - Linux & Docker Desktop v2+: `docker compose`

> In the snippets below we use the **Compose v2** syntax (`docker compose`).\
> If you are on an older macOS setup, simply replace `docker compose` with `docker‑compose`.

---

\## 2. Starting & Stopping the stack

```bash
# Build images (if needed) and start containers in the background
docker compose up --build

# Shut everything down
docker compose down
```

---

\## 3. Working inside containers

```bash
# Apache (web server)
docker compose exec apache bash

# PHP-FPM (CLI tasks, Composer, Artisan, …)
docker compose exec php bash

# MySQL shell
docker compose exec db mysql -u root -p
```

---

\## 4. Rebuilding images after editing **Dockerfile**

```bash
# Rebuild Apache image
docker compose build --no-cache apache

# Rebuild PHP image
docker compose build --no-cache php
```

---

\## 5. Database & phpMyAdmin

```bash
# Reset phpMyAdmin volume (removes database cache only)
docker compose down
docker volume rm wp-pete-docker_pma_data
```

phpMyAdmin is mapped (when enabled) at:

```
http://pete.petelocal.net/phpmyadmin
```

---

\## 6. Volume & Container housekeeping

```bash
# Remove **all** volumes defined in docker‑compose.yml
docker compose down -v
```

---

\## 7. Restarting Apache quickly

```bash
# Inside the **apache** container
apache2ctl restart
```

Virtual‑host files live in:

```
/etc/apache2/sites-available
/etc/apache2/sites-enabled
```

---

\## 8. Triggering an Apache reload from PHP (internal)

```bash
curl -sf -H "X-Reload-Secret: <YOUR_SECRET>" \
     http://apache/internal-reload || true
```

---

\## 9. Sample WordPress site (optional)

```bash
# Apache container example
docker compose exec apache bash -c "cd /var/www/html && \
  curl -LO https://wordpresspete.com/demov5.tar.gz && \
  chown www-data:www-data demov5.tar.gz"
```

---

\## 10. Harden your VM (optional but recommended)

```bash
# Change SSH port
vim /etc/ssh/sshd_config   # Port 2222
sudo systemctl reload sshd

# Lock down the firewall
sudo ufw delete limit 22/tcp
sudo ufw limit 2222/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Request a free Let’s Encrypt certificate via the built‑in Certbot helper:

```bash
curl -s -H "X-Reload-Secret: <YOUR_SECRET>" \
     "http://apache/internal-certbot?domain=example.com&email=you@example.com"
```

---

\## 11. Apache tuning & production rebuild

```bash
# Re‑compute limits for this host
./bin/tune_apache_env.sh        # Defaults to auto‑detect cores & RAM
# or manually: ./bin/tune_apache_env.sh 4c 8G

# Bake new numbers into the image
docker compose build apache

# Restart the stack
docker compose up -d apache
```

Performance conf: `/etc/apache2/conf-available/performance.conf`

---

\## 12. Laravel optimisation helper

```bash
php artisan optimize:clear
```

---

\## 13. Troubleshooting **Missing service provider after Composer update**

```bash
composer remove peteconsuegra/wordpress-plus-laravel \
                peteconsuegra/wordpress-plus-laravel-plugin --no-update
composer update --no-scripts   # Drops the packages

rm -f bootstrap/cache/packages.php bootstrap/cache/services.php
composer dump-autoload -o       # Re‑generate manifest
```

### 14. Start the stack in production
docker compose pull
docker compose build
docker compose up -d

---
TESTING MOVING TEST SITE INSIDE DOCKER FOLDER:
docker cp /Users/pedroconsuegra/Sites/wordpresspetepetelocalnet.tar.gz wp-pete-docker-php-1:/var/www/html/
docker exec -it wp-pete-docker-php-1 bash -c "chown -R www-data:www-data /var/www/html/wordpresspetepetelocalnet.tar.gz"

Cloud Test
docker cp /opt/wordpresspetepetelocalnet.tar.gz wordpress-pete-php-1:/var/www/html/
docker exec -it wp-pete-docker-php-1 bash -c "chown -R www-data:www-data /var/www/html/wordpresspetepetelocalnet.tar.gz"

Windows Test
docker cp \Users\user\Sites\wordpresspetepetelocalnet.tar.gz wp-pete-docker-php-1:/var/www/html/
docker exec -it wp-pete-docker-php-1 bash -c "chown -R www-data:www-data /var/www/html/wordpresspetepetelocalnet.tar.gz"


\### Common test URLs

```
http://pete.petelocal.net/server-status?refresh=5
http://pete.petelocal.net/phpmyadmin
```

---

\### Further reading Legacy wiki (archived): [https://github.com/peterconsuegra/wordpress-pete-docker/wiki](https://github.com/peterconsuegra/wordpress-pete-docker/wiki)

WordPress Pete © 2025 • Author Pedro Consuegra. pedroconsuegrat@gmail.com

