# ──────────────────────────────────────────────────────────────────────
# WordPress Pete – parameterised PHP-FPM image
#   • Build with any officially-maintained tag (8.1-fpm, 8.2-fpm, 8.3-fpm …)
#   • Default is 8.3-fpm if no --build-arg is supplied
# ──────────────────────────────────────────────────────────────────────
ARG PHP_VERSION=8.3


FROM php:${PHP_VERSION}-fpm

ARG PETE_ENVIRONMENT=production
ENV PETE_ENVIRONMENT=${PETE_ENVIRONMENT}

# ────────────── 0. Shared ENV ─────────────────────────────────────────
ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_DISABLE_XDEBUG_WARN=1

# ────────────── 1. System & PHP extensions (WebP ready) ──────────────
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        # base utilities
        default-mysql-client vim sudo git unzip zip curl ca-certificates \
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
        mysqli pdo pdo_mysql gd zip opcache && \
    \
    # ------- PECL extensions: Imagick (+WebP) & Redis ------- \
    pecl install imagick redis && \
    docker-php-ext-enable imagick redis && \
    \
    # clean image
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ────────────── 2. Node.js & npm ──────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest

# ────────────── 3. Composer & WP-CLI ─────────────────────────────────
RUN curl -sS https://getcomposer.org/installer | php && \
    mv composer.phar /usr/local/bin/composer && chmod +x /usr/local/bin/composer && \
    curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    chmod +x /usr/local/bin/wp

# ────────────── 4. Set php.ini ─────────
COPY php_dev.ini  /tmp/php_dev.ini
COPY php_prod.ini /tmp/php_prod.ini

RUN if [ "$PETE_ENVIRONMENT" = "development" ]; then \
        cp /tmp/php_dev.ini  /usr/local/etc/php/php.ini ; \
        echo "Using development INI"; \
    else \
        cp /tmp/php_prod.ini /usr/local/etc/php/php.ini ; \
        echo "Using production INI"; \
    fi && \
    rm -f /tmp/php_dev.ini /tmp/php_prod.ini

# ────────────── 5. Pete configs & helper scripts ─────────
COPY .gitconfig              /root/.gitconfig
COPY pete_install.sh         /usr/local/bin/pete_install.sh
RUN chmod +x /usr/local/bin/pete_install.sh && \
    chown www-data:www-data  /usr/local/bin/pete_install.sh

# sudo rules, pma template, etc. (same as before)
RUN mkdir -p /etc/sudoers.d /var/www/.ssh /data/wwwlog && \
    printf '%s\n' \
     'www-data ALL=(ALL) NOPASSWD: /usr/bin/git, /etc/init.d/apache2 reload, /usr/bin/update-alternatives, /var/www/html/Pete/scripts/*, /usr/bin/docker exec wp-pete-docker-apache-1 apachectl -k graceful' > /etc/sudoers.d/www-data && \
    chmod 440 /etc/sudoers.d/www-data && \
    chown -R www-data:www-data /var/www

COPY config.inc.php.custom /opt/pma-config/
RUN sed -i "s/^\(\$cfg\['blowfish_secret'\][[:space:]]*=[[:space:]]*\).*;/\1'__BLOWFISH__';/" \
        /opt/pma-config/config.inc.php.custom

# Disable MySQL SSL requirement for all CLI tools in this container
ENV MYSQL_CLIENT_FLAGS="--ssl-mode=DISABLED"

# Optional: make mysql and mysqladmin automatically use it
RUN echo "[client]\nssl-mode=DISABLED\n" > /etc/mysql/conf.d/disable-ssl.cnf

# ────────────── 6. Runtime defaults ──────────────────────────────────
WORKDIR /var/www/html
EXPOSE 9000

# Delegates to Pete’s installer, which eventually execs php-fpm
ENTRYPOINT ["/usr/local/bin/pete_install.sh"]