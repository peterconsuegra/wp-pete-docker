#!/bin/bash
set -e

# 1) Wait for MySQL to be ready
echo "Waiting for MySQL..."
until mysqladmin ping -h db -u"$DB_UPETE_DB_USERSER" -p"$PETE_DB_PASS" --silent; do
  sleep 3
done

# 3) Full Pete install (only once)
if [ ! -f /var/www/html/.installed ]; then
  echo "#######################################"
  echo "Starting WordPress Pete installation..."
  echo "#######################################"

  rm -rf /var/www/html/Pete
  cd /var/www/html

  git clone -b docker_pro_utm https://ozone777@bitbucket.org/ozone777/wordpresspete3.git Pete
  cd Pete

  #git fetch --tags
  #latestTag=$(git describe --tags $(git rev-list --tags --max-count=1))
  #git checkout "$latestTag"
  latestTag=10.4

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
PETE_DASHBOARD_URL=https://dashboard.wordpresspete.com
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
  php artisan addoption --option_name=parent_version --option_value=6
  php artisan addoption --option_name=version --option_value="$latestTag"
  php artisan addoption --option_name=app_root --option_value=/var/www/html
  php artisan addoption --option_name=server_conf --option_value=/etc/apache2/sites-available
  php artisan addoption --option_name=server --option_value=apache
  php artisan addoption --option_name=server_version --option_value=24
  php artisan addoption --option_name=os_version --option_value=bionic
  php artisan addoption --option_name=os_distribution --option_value=ubuntu
  php artisan addoption --option_name=logs_route --option_value=/var/www/html/wwwlog
  php artisan addoption --option_name=os_stack --option_value=apache_mpm_prefork
  php artisan addoption --option_name=domain_template --option_value=petelocal.net

  # Create needed dirs & perms
  mkdir -p public/uploads public/export trash storage storage/logs
  touch storage/logs/laravel.log
  mkdir -p /var/www/html/wwwlog/Pete /var/www/html/wwwlog/example1
  composer dump-autoload --ignore-platform-reqs

  # Mark as installed
  echo "done" > /var/www/html/.installed
  echo "#######################################"
  echo "WordPress Pete installation completed"
  echo "#######################################"

  # Install mod_sec_report dependencies
  cd /var/www/html/Pete/mod_sec_report \
    && pip3 install --no-cache-dir -r requirements.txt \
    && chmod 755 mod_sec_report
fi

# 4) Post-install setup
echo "#######################################"
echo "Launching WordPress Pete..."
echo "#######################################"

# Domain template
#cd /var/www/html/Pete && php artisan addoption --option_name=domain_template --option_value="${DOMAIN_TEMPLATE:-}"

# SSH key (for private repos, if needed)
SSH_DIR="${HOME}/.ssh"
if [ ! -f "${SSH_DIR}/id_rsa.pub" ]; then
  mkdir -p "${SSH_DIR}"
  ssh-keygen -t rsa -N "" -f "${SSH_DIR}/id_rsa"
  chmod 600 "${SSH_DIR}/id_rsa" "${SSH_DIR}/id_rsa.pub"
  chown -R www-data:www-data "${SSH_DIR}"
fi

# ModSecurity flag
if [ "$MOD_SECURITY" = "On" ]; then
  cd /var/www/html/Pete && php artisan addoption --option_name=security_status --option_value=on
else
  cd /var/www/html/Pete && php artisan addoption --option_name=security_status --option_value=off
fi

# Server-status flag
if [ "$SERVER_STATUS" = "On" ]; then
  cd /var/www/html/Pete && php artisan addoption --option_name=server_status --option_value=on
else
  cd /var/www/html/Pete && php artisan addoption --option_name=server_status --option_value=off
fi

# Ensure correct permissions
chown -R www-data:www-data /var/www/html

# 5) Finally delegate to the official Apache entrypoint
exec docker-php-entrypoint "$@"
