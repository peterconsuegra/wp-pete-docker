# ─────────────────────────────────────────────────────────────
# Apache (event) + ModSecurity 2 + OWASP CRS
# ─────────────────────────────────────────────────────────────
FROM debian:bullseye-slim
ENV DEBIAN_FRONTEND=noninteractive

# 1) Packages
RUN apt-get update && apt-get install -y --no-install-recommends \
      apache2 apache2-utils \
      libapache2-mod-security2 \
      vim \
      sudo \
      modsecurity-crs \
      curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN a2enmod cgi

# 2) event MPM  +  required modules
RUN a2dismod mpm_prefork && \
    a2enmod  mpm_event proxy proxy_fcgi rewrite headers expires status env security2

# 3) ModSecurity base + CRS (rules **and** phrase files)
RUN set -e; \
    mkdir -p /etc/modsecurity /etc/modsecurity/rules /var/cache/modsecurity && \
    cp /etc/modsecurity/modsecurity.conf-recommended /etc/modsecurity/modsecurity.conf && \
    \
    CRS_SETUP=$(find /usr/share -type f -name "crs-setup.conf.example" | head -n1 || true); \
    if [ -n "$CRS_SETUP" ]; then \
        cp "$CRS_SETUP" /etc/modsecurity/crs-setup.conf; \
    else \
        echo "# minimal setup" > /etc/modsecurity/crs-setup.conf; \
    fi && \
    \
    # link *.conf rules
    find /usr/share -type f -path "*modsecurity-crs*/rules/*.conf" -print0 \
      | xargs -0 -I{} ln -sf {} /etc/modsecurity/rules/ 2>/dev/null || true && \
    # link *.data phrase files (fixes the scanners-user-agents.data error)
    find /usr/share -type f -path "*modsecurity-crs*/rules/*.data" -print0 \
      | xargs -0 -I{} ln -sf {} /etc/modsecurity/rules/ 2>/dev/null || true && \
    \
    rm -f /etc/apache2/mods-enabled/security2.load   # silence duplicate-load warning

ARG APACHE_RELOAD_SECRET
COPY reload_apache.cgi /usr/local/bin/
RUN sed -i "s@__RELOAD_SECRET__@${APACHE_RELOAD_SECRET}@" /usr/local/bin/reload_apache.cgi \
 && chmod 755 /usr/local/bin/reload_apache.cgi

# 5) Create dirs & sudo rules Pete expects ------------------------------------
RUN mkdir -p /etc/sudoers.d /var/www/.ssh /data/wwwlog && \
   printf '%s\n' \
     'www-data ALL=(root) NOPASSWD: /usr/bin/git, /etc/init.d/apache2 reload, /usr/bin/update-alternatives, /usr/sbin/apachectl -k graceful, /var/www/html/Pete/scripts/*' \
     > /etc/sudoers.d/www-data && \
    chmod 440 /etc/sudoers.d/www-data && \
    chown -R www-data:www-data /var/www
#RUN mkdir -p /etc/sudoers.d /var/www/.ssh /data/wwwlog && \
#   printf '%s\n' \
#  'www-data ALL=(root) NOPASSWD: /usr/sbin/apachectl -k graceful' \
#  >> /etc/sudoers.d/www-data

# 4)  vHosts & custom includes
COPY pete.conf               /etc/apache2/sites-available/
COPY phpmyadmin.conf         /etc/apache2/sites-available/
COPY modsecurity-apache.conf /etc/apache2/conf-available/modsecurity.conf
COPY whitelist.conf          /etc/modsecurity/whitelist.conf

# give www-data ownership so the *volume* is created writable
RUN chown -R www-data:www-data /etc/apache2/sites-available /etc/apache2/sites-enabled && \
    a2ensite pete.conf phpmyadmin.conf && \
    a2enconf modsecurity && \
    a2dissite 000-default.conf

RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf
WORKDIR /var/www/html
EXPOSE 80
CMD ["apachectl","-D","FOREGROUND"]


COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

CMD ["start.sh"]