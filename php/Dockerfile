# ──────────────────────────────────────────────────────────────────────
# WordPress Pete – parameterised PHP-FPM image
#   • Build with any officially-maintained tag (8.2-fpm, 8.3-fpm, 8.4-fpm …)
#   • Default is 8.3-fpm if no --build-arg is supplied
# ──────────────────────────────────────────────────────────────────────
ARG PHP_VERSION=8.3


FROM php:${PHP_VERSION}-fpm

ARG PETE_ENVIRONMENT=production
ENV PETE_ENVIRONMENT=${PETE_ENVIRONMENT}

# ────────────── Security floor (fails fast on a stale base) ──────────
# PHP2Shell (CVE-2026-109618 / CVE-2026-109619), unauthenticated RCE, is
# fixed in 8.2.35 / 8.3.36 / 8.4.27 / 8.5.12; 8.1 and older get no fix.
# A cached php:<minor>-fpm can still be older, so refuse to build on it:
# rebuild with `docker compose build --pull php`.
RUN php -r '$fixed = ["8.2" => "8.2.35", "8.3" => "8.3.36", "8.4" => "8.4.27", "8.5" => "8.5.12"]; \
      $branch = PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION; \
      if (version_compare($branch, "8.2", "<") || (isset($fixed[$branch]) && version_compare(PHP_VERSION, $fixed[$branch], "<"))) { \
        fwrite(STDERR, "PHP " . PHP_VERSION . " is vulnerable to PHP2Shell (CVE-2026-109618/109619). Use PHP 8.2+ and rebuild with --pull.\n"); \
        exit(1); \
      } \
      echo "PHP " . PHP_VERSION . " has the PHP2Shell fix\n";'

# ────────────── 0. Shared ENV ─────────────────────────────────────────
ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_DISABLE_XDEBUG_WARN=1


# Pinned: the unversioned download serves the newest release, and
# cachetool 12.0.0 (2026-10-18) refuses to run on PHP < 8.4.
ENV CACHETOOL_VERSION=10.0.0
RUN set -eux; \
    curl -fsSL -o /usr/local/bin/cachetool \
      "https://github.com/gordalina/cachetool/releases/download/${CACHETOOL_VERSION}/cachetool.phar"; \
    chmod +x /usr/local/bin/cachetool; \
    # default to FPM TCP listener (change to socket if you use one)
    printf "adapter: fastcgi\nfastcgi: \"127.0.0.1:9000\"\n" > /usr/local/etc/cachetool.yml; \
    # tiny wrapper for one-liner refresh
    printf '%s\n' \
      '#!/usr/bin/env sh' \
      'set -e' \
      'CFG="${CACHETOOL_CONFIG:-/usr/local/etc/cachetool.yml}"' \
      'exec /usr/local/bin/cachetool --config="$CFG" opcache:reset' \
      > /usr/local/bin/opcache-refresh && chmod +x /usr/local/bin/opcache-refresh; \
    # smoke test
    cachetool --version
    
RUN mkdir -p /var/log/php-fpm \
 && touch /var/log/php-fpm/slowlog.log \
 && chown -R www-data:www-data /var/log/php-fpm \
 && chmod 0644 /var/log/php-fpm/slowlog.log

# ────────────── 1. System & PHP extensions (WebP ready) ──────────────
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        # base utilities
        default-mysql-client vim sudo git unzip zip curl ca-certificates cron\
        # PHP image libs
        libfreetype6-dev libjpeg62-turbo-dev libpng-dev libwebp-dev \
        libzip-dev libonig-dev libxml2-dev \
        # Imagick deps
        libmagickwand-dev \
        # Python helpers
        python3 python3-pip python3-jinja2 python3-pandas python3-requests \
        # misc tools
        openssh-client docker.io certbot python3-certbot-apache && \
    \
    # Python packages
    PIP_BREAK_SYSTEM_PACKAGES=1 \
        pip3 install --no-cache-dir gdown python-dotenv && \
    \
    # ------- compile GD with WebP ------- \
    docker-php-ext-configure gd \
        --with-freetype \
        --with-jpeg \
        --with-webp && \
    docker-php-ext-install -j"$(nproc)" \
        mysqli pdo pdo_mysql gd zip opcache intl mbstring && \
    \
    # ------- PECL extensions: Imagick (+WebP) & Redis ------- \
    pecl install imagick redis && \
    docker-php-ext-enable imagick redis && \
    \
    # clean image
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN /bin/sh -lc 'touch /var/log/cron.log && chmod 0644 /var/log/cron.log'

# ────────────── 2. Node.js & npm ──────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@11

# ────────────── 3. Composer & WP-CLI ─────────────────────────────────
# Composer is pinned: 2.9+ blocks packages with open security advisories by
# default, which breaks Pete's install (laravel/framework ^10.0 is flagged).
RUN curl -sS https://getcomposer.org/installer | php -- --version=2.8.12 && \
    mv composer.phar /usr/local/bin/composer && chmod +x /usr/local/bin/composer && \
    curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    chmod +x /usr/local/bin/wp

# ────────────── 4. Set php.ini & www.conf ─────────
ARG SERVER=16ram-4cpu

# Always copy the performance profile (must exist in build context under apache/${SERVER}/)
COPY ${SERVER}/php.ini /usr/local/etc/php/php.ini
COPY ${SERVER}/www.conf /usr/local/etc/php-fpm.d/www.conf

# ────────────── 5. Pete configs & helper scripts ─────────
COPY git/.gitconfig              /root/.gitconfig
COPY pete_install.sh /usr/local/bin/pete_install.sh
RUN chmod +x /usr/local/bin/pete_install.sh \
 && chown www-data:www-data /usr/local/bin/pete_install.sh \
 && apt-get update && apt-get install -y --no-install-recommends dos2unix && rm -rf /var/lib/apt/lists/* \
 && dos2unix /usr/local/bin/pete_install.sh || true

# sudo rules, pma template, etc. (same as before)
RUN mkdir -p /etc/sudoers.d /var/www/.ssh /data/wwwlog && \
    printf '%s\n' \
     'www-data ALL=(ALL) NOPASSWD: /usr/bin/git, /etc/init.d/apache2 reload, /usr/bin/update-alternatives, /var/www/html/Pete/scripts/*, /usr/bin/docker exec wp-pete-docker-apache-1 apachectl -k graceful' > /etc/sudoers.d/www-data && \
    chmod 440 /etc/sudoers.d/www-data && \
    chown -R www-data:www-data /var/www

COPY phpmyadmin/config.inc.php.custom /opt/pma-config/
RUN sed -i "s/^\(\$cfg\['blowfish_secret'\][[:space:]]*=[[:space:]]*\).*;/\1'__BLOWFISH__';/" \
        /opt/pma-config/config.inc.php.custom

# Disable client-side SSL requirement for MariaDB client tools
RUN mkdir -p /etc/mysql/conf.d && \
    printf "[client]\nssl=0\nskip_ssl\n\n[mysql]\nssl=0\nskip_ssl\n\n[mysqladmin]\nssl=0\nskip_ssl\n" \
    > /etc/mysql/conf.d/disable-ssl.cnf

#PROGRAMMING SHORTCUTS
RUN echo "alias gs='git status'" >> /etc/bash.bashrc
RUN echo "alias prompt='python3 prompt2.py -e prompt.env'" >> /etc/bash.bashrc
RUN echo "alias cphp='docker compose exec php bash'" >> /etc/bash.bashrc
RUN echo "alias capache='docker compose exec apache bash'" >> /etc/bash.bashrc
RUN echo "alias dbuild='docker compose up --build'" >> /etc/bash.bashrc
RUN echo "alias dphp='docker compose build php && docker compose up -d php'" >> /etc/bash.bashrc
RUN echo "alias dapache='docker compose build php && docker compose up -d php'" >> /etc/bash.bashrc

# ────────────── 6. Copy cronjob logic if exists ──────────────────────────────────
COPY cron/pete-panel.cron /etc/cron.d/pete-panel
RUN chmod 0644 /etc/cron.d/pete-panel

COPY install-cron.sh /usr/local/bin/install-cron.sh
RUN chmod +x /usr/local/bin/install-cron.sh

# ────────────── 7. Runtime defaults ──────────────────────────────────
WORKDIR /var/www/html
EXPOSE 9000

# Delegates to Pete’s installer, which eventually execs php-fpm
ENTRYPOINT ["/usr/local/bin/pete_install.sh"]