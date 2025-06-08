FROM php:8.1-apache

# 1) Install PHP extensions, MySQL client, and tools
RUN apt-get update \
 && apt-get install -y \
      default-mysql-client \
      vim \
      sudo \
      python3 \
      python3-pip \
      libfreetype6-dev \
      libjpeg62-turbo-dev \
      libpng-dev \
      libzip-dev \
      zip \
      unzip \
      git \
      libonig-dev \
      libxml2-dev \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j"$(nproc)" \
      mysqli \
      pdo \
      pdo_mysql \
      gd \
      zip \
      opcache \
 && mkdir -p /tmp/pear/temp \
 && chmod -R 0777 /tmp/pear \
 && pecl install redis \
 && docker-php-ext-enable redis \
 && rm -rf /var/lib/apt/lists/*

COPY .gitconfig /root/.gitconfig
RUN chown root:root /root/.gitconfig

# 2) Enable Apache modules (added vhost_alias)
RUN a2enmod rewrite headers expires vhost_alias env status

# server-status hack: replace the default status.conf with your custom block
RUN a2enmod status

# overwrite the default
COPY status.conf /etc/apache2/mods-enabled/status.conf

# 3) Ensure vhost directories exist (for your bind mounts)
RUN mkdir -p /etc/apache2/sites-available /etc/apache2/sites-enabled

# ── Install ModSecurity 2 and Debian’s CRS package ───────────────────────────
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libapache2-mod-security2 \
      modsecurity-crs \
      curl \
      ca-certificates && \
    \
    # 1) Prepare directories
    mkdir -p /etc/modsecurity /etc/modsecurity/rules /var/cache/modsecurity && \
    \
    # 2) Copy core ModSecurity config so we can later flip it ON
    cp /etc/modsecurity/modsecurity.conf-recommended /etc/modsecurity/modsecurity.conf && \
    \
    # 3) Ensure CRS setup file exists (Debian sometimes omits the example)
    if [ ! -f /usr/share/modsecurity-crs/crs-setup.conf.example ]; then \
      curl -fsSL \
        https://raw.githubusercontent.com/coreruleset/coreruleset/v3.3.4/crs-setup.conf.example \
        -o /etc/modsecurity/crs-setup.conf; \
    else \
      cp /usr/share/modsecurity-crs/crs-setup.conf.example /etc/modsecurity/crs-setup.conf; \
    fi && \
    \
    # 4) Symlink ALL of the CRS .conf files into /etc/modsecurity/rules
    ln -sf /usr/share/modsecurity-crs/rules/*.conf /etc/modsecurity/rules/ && \
    \
    # 5) Symlink ALL of the CRS .data files into /etc/modsecurity/rules
    ln -sf /usr/share/modsecurity-crs/rules/*.data /etc/modsecurity/rules/ || true

# ── Copy our Apache include that loads mod_security2 + CRS ───────────────────
COPY modsecurity-apache.conf /etc/apache2/conf-available/modsecurity.conf
COPY whitelist.conf /etc/modsecurity/whitelist.conf

# ── Enable security2, drop any default, enable ours, turn engine ON, test syntax ─
RUN a2enmod security2 \
 && rm -f /etc/apache2/mods-enabled/security2.conf \
 && a2enconf modsecurity \
 && sed -i 's/SecRuleEngine DetectionOnly/SecRuleEngine On/' /etc/modsecurity/modsecurity.conf \
 && echo "Include /etc/modsecurity/whitelist.conf" >> /etc/modsecurity/modsecurity.conf \
 && apache2ctl configtest

# copy & enable pete.conf
COPY pete.conf /etc/apache2/sites-available/pete.conf
RUN chmod 644 /etc/apache2/sites-available/pete.conf \
 && a2dissite 000-default.conf \
 && a2ensite pete.conf

RUN a2enmod env

ARG PMA_VERSION=5.2.2

RUN set -eux; \
    curl -fsSL "https://files.phpmyadmin.net/phpMyAdmin/${PMA_VERSION}/phpMyAdmin-${PMA_VERSION}-all-languages.tar.gz" \
      -o /tmp/pma.tar.gz; \
    tar xzf /tmp/pma.tar.gz -C /usr/src/; \
    mv /usr/src/phpMyAdmin-${PMA_VERSION}-all-languages /usr/src/phpmyadmin; \
    rm /tmp/pma.tar.gz

# overwrite with your working config
COPY config.inc.php.custom /usr/src/phpmyadmin/config.inc.php
RUN chown www-data:www-data /usr/src/phpmyadmin/config.inc.php

RUN mkdir -p /usr/src/phpmyadmin/tmp \
 && chown www-data:www-data /usr/src/phpmyadmin/tmp \
 && chmod 700 /usr/src/phpmyadmin/tmp

# then enable the alias site as before
COPY phpmyadmin.conf /etc/apache2/sites-available/phpmyadmin.conf
RUN chmod 644 /etc/apache2/sites-available/phpmyadmin.conf \
 && a2ensite phpmyadmin.conf

# <<< NEW: rename the symlink so pete is alphabetically first >>>
RUN mv /etc/apache2/sites-enabled/pete.conf \
      /etc/apache2/sites-enabled/000-pete.conf

# 3) Copy custom php.ini
COPY php.ini /usr/local/etc/php/

# 5) Set working dir & ensure ownership
WORKDIR /var/www/html
RUN chown -R www-data:www-data /var/www/html

# 6) (Optional) Install WP-CLI
RUN curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
 && chmod +x /usr/local/bin/wp

# Silence Apache FQDN warning
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# 👇 Install Composer globally
RUN curl -sS https://getcomposer.org/installer | php \
  && mv composer.phar /usr/local/bin/composer \
  && chmod +x /usr/local/bin/composer

# Copy and set entrypoint script
COPY pete_install.sh /usr/local/bin/pete_install.sh
RUN chmod +x /usr/local/bin/pete_install.sh \
 && chown www-data:www-data /usr/local/bin/pete_install.sh

# 7) Ensure sudoers.d exists before adding rules
RUN mkdir -p /etc/sudoers.d

# 8) Create a single‐line sudoers entry for www-data
RUN printf '%s\n' \
  'www-data ALL=(ALL) NOPASSWD: /etc/init.d/apache2 reload, /usr/bin/update-alternatives, /var/www/html/Pete/scripts/securitystatus.sh, /var/www/html/Pete/scripts/get_mod_sec_report.sh, /var/www/html/Pete/scripts/print_security_report.sh, /var/www/html/Pete/scripts/change_php.sh, /var/www/html/Pete/scripts/phpmyadmin.sh, /var/www/html/Pete/scripts/delete.sh, /var/www/html/Pete/scripts/upload_capacity.sh, /usr/bin/git, /var/www/html/Pete/scripts/generate_ssl.sh, /var/www/html/Pete/scripts/create_config_file.sh, /var/www/html/Pete/scripts/phpmyadmin.sh' \
  > /etc/sudoers.d/www-data \
 && chmod 440 /etc/sudoers.d/www-data

# Prepare .ssh directory for cloning private repos
RUN mkdir -p /var/www/.ssh \
 && chown -R www-data:www-data /var/www

# ── create a persistent log dir and four shorthand symlinks under /root ──
RUN mkdir -p /data/wwwlog \
 && mkdir -p /root/sites /root/configs /root/configse /root/logs \
 && ln -sf /var/www/html                   /root/sites \
 && ln -sf /etc/apache2/sites-available    /root/configs \
 && ln -sf /etc/apache2/sites-enabled      /root/configse \
 && ln -sf /data/wwwlog                    /root/logs

EXPOSE 80

VOLUME ["/etc/apache2/sites-available","/etc/apache2/sites-enabled"]

ENTRYPOINT ["/usr/local/bin/pete_install.sh"]
CMD ["apache2-foreground"]
