FROM php:8.1-apache

# 1) Install PHP extensions, the MySQL client, and prepare PEAR temp
RUN apt-get update \
 && apt-get install -y \
      default-mysql-client \
      vim \
      libfreetype6-dev \
      libjpeg62-turbo-dev \
      libpng-dev \
      libzip-dev \
      zip \
      unzip \
      git \
      libonig-dev \
      libxml2-dev \
 \
 # configure & install PHP extensions
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j"$(nproc)" \
      mysqli \
      pdo \
      pdo_mysql \
      gd \
      zip \
      opcache \
 \
 # ensure PEAR temp exists so pecl can unpack
 && mkdir -p /tmp/pear/temp \
 && chmod -R 0777 /tmp/pear \
 \
 # install and enable Redis via PECL
 && pecl install redis \
 && docker-php-ext-enable redis \
 \
 # clean up
 && rm -rf /var/lib/apt/lists/*

# 2) Enable Apache modules
RUN a2enmod rewrite headers expires

# 3) Copy in your custom php.ini
COPY php.ini /usr/local/etc/php/

# 4) Download & unpack WordPress core
RUN curl -o /tmp/wordpress.tar.gz https://wordpress.org/latest.tar.gz \
 && tar -xzf /tmp/wordpress.tar.gz --strip-components=1 -C /var/www/html \
 && rm /tmp/wordpress.tar.gz \
 && chown -R www-data:www-data /var/www/html

# 5) Set working dir & ensure ownership
WORKDIR /var/www/html
RUN chown -R www-data:www-data /var/www/html

# 6) (Optional) Install WP-CLI
RUN curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
 && chmod +x /usr/local/bin/wp

 # 6) Copy in our custom entrypoint and make it executable
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 7) Switch over to our entrypoint and start Apache
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["apache2-foreground"]

EXPOSE 80