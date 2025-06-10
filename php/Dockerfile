FROM php:8.1-fpm

ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_DISABLE_XDEBUG_WARN=1

# 1) System & PHP extensions ---------------------------------------------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        default-mysql-client vim sudo git unzip zip \
        libfreetype6-dev libjpeg62-turbo-dev libpng-dev libzip-dev \
        libonig-dev libxml2-dev \
        python3 python3-pip python3-jinja2 \
        python3-pandas python3-requests \
        openssh-client \
        certbot python3-certbot-apache \
        curl ca-certificates && \
    \
    docker-php-ext-configure gd --with-freetype --with-jpeg && \
    docker-php-ext-install -j"$(nproc)" \
        mysqli pdo pdo_mysql gd zip opcache && \
    pecl install redis && \
    docker-php-ext-enable redis && \
    \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# 3) Composer & WP-CLI ---------------------------------------------------------
RUN curl -sS https://getcomposer.org/installer | php && \
    mv composer.phar /usr/local/bin/composer && chmod +x /usr/local/bin/composer && \
    curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    chmod +x /usr/local/bin/wp

# 4) Copy configs & Pete installer --------------------------------------------
COPY php.ini                 /usr/local/etc/php/
COPY .gitconfig              /root/.gitconfig
COPY pete_install.sh         /usr/local/bin/pete_install.sh
RUN chmod +x /usr/local/bin/pete_install.sh && \
    chown www-data:www-data  /usr/local/bin/pete_install.sh

# 5) Create dirs & sudo rules Pete expects ------------------------------------
RUN mkdir -p /etc/sudoers.d /var/www/.ssh /data/wwwlog && \
    printf '%s\n' \
     'www-data ALL=(ALL) NOPASSWD: /usr/bin/git, /etc/init.d/apache2 reload, /usr/bin/update-alternatives, /var/www/html/Pete/scripts/*' \
     > /etc/sudoers.d/www-data && \
    chmod 440 /etc/sudoers.d/www-data && \
    chown -R www-data:www-data /var/www

# 6) phpMyAdmin (served via Apache container) ----------------------------------
ARG PMA_VERSION=5.2.2
RUN set -eux; \
    curl -fsSL "https://files.phpmyadmin.net/phpMyAdmin/${PMA_VERSION}/phpMyAdmin-${PMA_VERSION}-all-languages.tar.gz" -o /tmp/pma.tar.gz; \
    tar xzf /tmp/pma.tar.gz -C /usr/src/; \
    mv /usr/src/phpMyAdmin-${PMA_VERSION}-all-languages /usr/src/phpmyadmin; \
    rm /tmp/pma.tar.gz && \
    mkdir -p /usr/src/phpmyadmin/tmp && \
    chown -R www-data:www-data /usr/src/phpmyadmin
COPY config.inc.php.custom /usr/src/phpmyadmin/config.inc.php

# 7) Working dir, ownership, expose FPM ---------------------------------------
WORKDIR /var/www/html
RUN chown -R www-data:www-data /var/www/html
EXPOSE 9000 

USER www-data
ENTRYPOINT ["/usr/local/bin/pete_install.sh"]
CMD ["php-fpm"]
