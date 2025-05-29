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

# 2) Enable Apache modules (added vhost_alias)
RUN a2enmod rewrite headers expires vhost_alias

# 3) Ensure vhost directories exist (for your bind mounts)
RUN mkdir -p /etc/apache2/sites-available /etc/apache2/sites-enabled

# copy & enable pete.conf
COPY pete.conf /etc/apache2/sites-available/pete.conf
RUN chmod 644 /etc/apache2/sites-available/pete.conf \
 && a2dissite 000-default.conf \
 && a2ensite pete.conf

ARG PMA_VERSION=5.2.1

# 4) Pull in phpMyAdmin and set it up under /usr/src/phpmyadmin
RUN set -eux; \
    curl -fsSL "https://files.phpmyadmin.net/phpMyAdmin/${PMA_VERSION}/phpMyAdmin-${PMA_VERSION}-all-languages.tar.gz" \
      -o /tmp/pma.tar.gz; \
    tar xzf /tmp/pma.tar.gz -C /usr/src/; \
    mv /usr/src/phpMyAdmin-${PMA_VERSION}-all-languages /usr/src/phpmyadmin; \
    rm /tmp/pma.tar.gz; \
    cp /usr/src/phpmyadmin/config.sample.inc.php /usr/src/phpmyadmin/config.inc.php; \
    sed -i "s|\$cfg\['blowfish_secret'\] = ''|\$cfg['blowfish_secret'] = '$(openssl rand -base64 32)'|g" /usr/src/phpmyadmin/config.inc.php; \
    sed -i "s/\$cfg\['Servers'\]\[1\]\['host'\] = 'localhost'/\$cfg['Servers'][1]['host'] = 'db'/g" /usr/src/phpmyadmin/config.inc.php; \
    chown -R www-data:www-data /usr/src/phpmyadmin

# Copy your separate global alias file and enable it
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
  'www-data ALL=(ALL) NOPASSWD: /etc/init.d/apache2 reload, /usr/bin/update-alternatives, /var/www/html/Pete/scripts/securitystatus.sh, /var/www/html/Pete/scripts/get_mod_sec_report.sh, /var/www/html/Pete/scripts/print_security_report.sh, /var/www/html/Pete/scripts/change_php.sh, /var/www/html/Pete/scripts/phpmyadmin.sh, /var/www/html/Pete/scripts/delete.sh, /var/www/html/Pete/scripts/upload_capacity.sh, /usr/bin/git, /var/www/html/Pete/scripts/generate_ssl.sh, /var/www/html/Pete/scripts/create_config_file.sh' \
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
