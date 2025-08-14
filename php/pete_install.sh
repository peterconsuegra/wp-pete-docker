#!/bin/bash
set -e

# 1) Wait for MySQL to be ready
echo "Waiting for MySQL..."
until mysqladmin --skip-ssl ping -h db --silent; do
  sleep 3
done

chown -R www-data:www-data /var/www/html /etc/apache2/sites-* 2>/dev/null || true


# 3) Full Pete install (only once)
if [ ! -f /var/www/html/.installed ]; then
  echo "#######################################"
  echo "Starting WordPress Pete installation..."
  echo "#######################################"

  mkdir -p /var/www/html/wwwlog/Pete
  chown -R www-data:www-data /var/www/html/wwwlog
  rm -rf /var/www/html/Pete
  cd /var/www/html

  git clone https://ozone777@bitbucket.org/ozone777/wordpresspete3.git Pete
  cd Pete

  git fetch --tags
  latestTag=$(git describe --tags `git rev-list --tags --max-count=1`)
  git checkout $latestTag
  
  #latestTag=11.1
  #git checkout php_select

  # Reset composer & env
  rm -f auth.json composer.json
  cp composer_original.json composer.json
  cp .env.example .env

  cat <<EOF >> .env
DB_CONNECTION=mysql
DB_HOST=db
DB_PORT=3306
DB_DATABASE=${PETE_DB_NAME}
DB_USERNAME=${PETE_DB_USER}
DB_PASSWORD=${PETE_DB_PASSWORD}
PETE_ROOT_PASS=${PETE_ROOT_PASSWORD}
APACHE_RELOAD_URL=${APACHE_RELOAD_URL}
APACHE_RELOAD_SECRET=${APACHE_RELOAD_SECRET}
APACHE_CERTBOT_URL=${APACHE_CERTBOT_URL}
PETE_DASHBOARD_URL=https://mydashboard.wordpresspete.com
PETE_DEMO=inactive
PETE_ENVIRONMENT=production
PETE_DEBUG=inactive
EOF

  # Install PHP deps & migrate
  rm -rf vendor
  COMPOSER_CACHE_DIR=/dev/null composer install --ignore-platform-reqs --prefer-dist --no-dev
  php artisan key:generate
  php artisan migrate

  # Add general options
  php artisan addoption --option_name=os --option_value=docker
  php artisan addoption --option_name=server_status --option_value=off
  php artisan addoption --option_name=parent_version --option_value=11
  php artisan addoption --option_name=version --option_value="$latestTag"
  php artisan addoption --option_name=app_root --option_value=/var/www/html
  php artisan addoption --option_name=server_conf --option_value=/etc/apache2/sites-available
  php artisan addoption --option_name=server --option_value=apache
  php artisan addoption --option_name=server_version --option_value=24
  php artisan addoption --option_name=os_version --option_value=bionic
  php artisan addoption --option_name=os_distribution --option_value=ubuntu
  php artisan addoption --option_name=logs_route --option_value=/var/www/html/wwwlog
  php artisan addoption --option_name=os_stack --option_value=apache_mpm_prefork
  php artisan addoption --option_name=phpmyadmin_status --option_value=off
  php artisan addoption --option_name=security_status --option_value=on

  # Create needed dirs & perms
  mkdir -p public/uploads public/export trash storage storage/logs
  touch storage/logs/laravel.log
  mkdir -p /var/www/html/wwwlog/Pete /var/www/html/wwwlog/example1
  composer dump-autoload --ignore-platform-reqs

  # Mark as installed
  chown -R www-data:www-data /var/www/html/Pete 
  echo "done" > /var/www/html/.installed
  echo "#######################################"
  echo "WordPress Pete installation completed"
  echo "#######################################"

fi

# 4) Post-install setup
echo "#######################################"
echo "Launching WordPress Pete..."
echo "#######################################"

# SSH key (for private repos, if needed)
SSH_DIR="${HOME}/.ssh"
if [ ! -f "${SSH_DIR}/id_rsa.pub" ]; then
  mkdir -p "${SSH_DIR}"
  ssh-keygen -t rsa -N "" -f "${SSH_DIR}/id_rsa"
  chmod 600 "${SSH_DIR}/id_rsa" "${SSH_DIR}/id_rsa.pub"
  chown -R www-data:www-data "${SSH_DIR}"
fi

#domain_template for development
pete_environment=${PETE_ENVIRONMENT}
if [ "$pete_environment" = "development" ]; then
  cd /var/www/html/Pete && php artisan addoption --option_name=domain_template --option_value=petelocal.net
  cd /var/www/html/Pete && php artisan addoption --option_name=environment --option_value=development
else
  cd /var/www/html/Pete && php artisan addoption --option_name=environment --option_value=production
fi

###############################################################################
# phpMyAdmin bootstrap (runs only once per empty pma_data volume)
###############################################################################
PMA_DIR="/usr/src/phpmyadmin"                      # shared volume mount-point
PMA_CFG_TMPL="/opt/pma-config/config.inc.php.custom"
PMA_CFG_DEST="${PMA_DIR}/config.inc.php"
PMA_VERSION="5.2.2"

if [ ! -f "${PMA_DIR}/index.php" ]; then
    echo "→ Installing phpMyAdmin ${PMA_VERSION} into ${PMA_DIR} …"
    curl -fsSL \
      "https://files.phpmyadmin.net/phpMyAdmin/${PMA_VERSION}/phpMyAdmin-${PMA_VERSION}-all-languages.tar.gz" \
      -o /tmp/pma.tar.gz
    mkdir -p "${PMA_DIR}"
    tar -xzf /tmp/pma.tar.gz --strip-components=1 -C "${PMA_DIR}"
    rm /tmp/pma.tar.gz
fi

# ---------------------------------------------------------------------------
# Copy / template the main config only if it does not exist yet
# ---------------------------------------------------------------------------
if [ ! -f "${PMA_CFG_DEST}" ] && [ -f "${PMA_CFG_TMPL}" ]; then
    echo "→ Creating phpMyAdmin config …"

    # Use the secret from .env, or generate one on the fly
    BF_SECRET=${BLOWFISH_SECRET:-$(head -c32 /dev/urandom | base64)}

    # Copy template → destination, substituting the placeholder
    sed "s#__BLOWFISH__#${BF_SECRET}#" "${PMA_CFG_TMPL}" > "${PMA_CFG_DEST}"
    chown www-data:www-data "${PMA_CFG_DEST}"
fi
###############################################################################


# 5) Finally delegate to the official Apache entrypoint
exec php-fpm 
