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
      modsecurity-crs \
      curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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

# 4)  vHosts & custom includes
COPY pete.conf               /etc/apache2/sites-available/
COPY phpmyadmin.conf         /etc/apache2/sites-available/
COPY modsecurity-apache.conf /etc/apache2/conf-available/modsecurity.conf
COPY whitelist.conf          /etc/modsecurity/whitelist.conf
RUN a2ensite pete.conf phpmyadmin.conf && a2enconf modsecurity

RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf
WORKDIR /var/www/html
EXPOSE 80
CMD ["apachectl","-D","FOREGROUND"]


COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

CMD ["start.sh"]