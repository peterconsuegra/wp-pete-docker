# ─────────────────────────────────────────────
# Apache (event) + ModSecurity 2 + OWASP CRS
# ─────────────────────────────────────────────
FROM debian:bullseye-slim
ENV DEBIAN_FRONTEND=noninteractive

# 1) Packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        apache2 apache2-utils \
        libapache2-mod-security2 \
        modsecurity-crs \
        sudo vim curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2) Enable modules
RUN a2dismod mpm_prefork && \
    a2enmod  mpm_event proxy proxy_fcgi rewrite headers expires status env security2 cgi

# 3) ModSecurity + CRS
RUN set -e; \
    mkdir -p /etc/modsecurity /etc/modsecurity/rules /var/cache/modsecurity && \
    cp /etc/modsecurity/modsecurity.conf-recommended /etc/modsecurity/modsecurity.conf && \
    CRS_SETUP=$(find /usr/share -type f -name 'crs-setup.conf.example' | head -n1 || true) && \
    : "${CRS_SETUP:=/dev/null}" && \
    cp "$CRS_SETUP" /etc/modsecurity/crs-setup.conf || echo '# minimal' > /etc/modsecurity/crs-setup.conf && \
    find /usr/share -type f -path '*modsecurity-crs*/rules/*' -regex '.*\.\(conf\|data\)' -print0 \
      | xargs -0 -I{} ln -sf {} /etc/modsecurity/rules/ 2>/dev/null || true && \
    rm -f /etc/apache2/mods-enabled/security2.load

# 4) Reload-hook CGI
ARG APACHE_RELOAD_SECRET
COPY reload_apache.cgi /usr/local/bin/
RUN sed -i "s@__RELOAD_SECRET__@${APACHE_RELOAD_SECRET}@" /usr/local/bin/reload_apache.cgi \
 && chmod 755 /usr/local/bin/reload_apache.cgi

# 5) Pete & phpMyAdmin base vhosts
COPY pete.conf /etc/apache2/sites-available/000-pete.conf
COPY phpmyadmin.conf   /etc/apache2/sites-available/
COPY whitelist.conf    /etc/modsecurity/whitelist.conf
COPY modsecurity-apache.conf /etc/apache2/conf-available/modsecurity.conf

# 6) Make vhost dirs shared & writable *before* volume is created
RUN chown -R www-data:www-data /etc/apache2/sites-available /etc/apache2/sites-enabled

# 7) Enable baseline sites & configs (done once at build-time)
RUN a2ensite 000-pete.conf phpmyadmin.conf && \
    a2enconf modsecurity && \
    a2dissite 000-default.conf

# 8) Allow www-data (CGI) to reload Apache
RUN printf '%s\n' \
  'www-data ALL=(root) NOPASSWD: /usr/sbin/apachectl -k graceful' \
  > /etc/sudoers.d/www-data && chmod 440 /etc/sudoers.d/www-data

RUN echo 'ServerName localhost' >> /etc/apache2/apache2.conf
WORKDIR /var/www/html
EXPOSE 80

# wait-helper script
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# --- new: ensure volume will be writable by Pete ---
RUN mkdir -p /var/www/html && chown -R www-data:www-data /var/www/html

CMD ["start.sh"]
