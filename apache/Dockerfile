# ─────────────────────────────────────────────
# Apache (event) + ModSecurity 2 + OWASP CRS
# ─────────────────────────────────────────────
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      apache2 apache2-utils \
      libapache2-mod-security2 \
      certbot python3-certbot-apache \
      sudo curl ca-certificates vim-tiny && \
    rm -rf /var/lib/apt/lists/*

RUN a2dismod mpm_prefork && \
    a2enmod mpm_event proxy proxy_fcgi rewrite headers expires ssl \
            http2 deflate \
    && a2enmod cgid 

RUN ln -s /usr/bin/vim.tiny /usr/bin/vim
COPY status.conf /etc/apache2/mods-enabled/status.conf

COPY performance.tmpl /tmp/performance.tmpl

# ── declare build-args; give safe fall-backs so docker build . works ─
ARG APACHE_START_SERVERS=2
ARG APACHE_SERVER_LIMIT=4
ARG APACHE_THREADS=64
ARG APACHE_MAX_WORKERS=512
ARG APACHE_SPARE_MIN=64
ARG APACHE_SPARE_MAX=192

# ── render template → final conf; enable it ─────────────────────────
RUN mkdir -p /etc/apache2/conf-available && \
    sed  -e "s/{{START_SERVERS}}/${APACHE_START_SERVERS}/" \
         -e "s/{{SERVER_LIMIT}}/${APACHE_SERVER_LIMIT}/" \
         -e "s/{{THREADS_PER_CHILD}}/${APACHE_THREADS}/" \
         -e "s/{{MAX_REQUEST_WORKERS}}/${APACHE_MAX_WORKERS}/" \
         -e "s/{{SPARE_MIN}}/${APACHE_SPARE_MIN}/" \
         -e "s/{{SPARE_MAX}}/${APACHE_SPARE_MAX}/" \
         /tmp/performance.tmpl \
         > /etc/apache2/conf-available/performance.conf && \
    rm /tmp/performance.tmpl && \
    a2enconf performance  

# ── Install ModSecurity 2 and Debian’s CRS package ───────────────────────────
ARG CRS_VERSION=4.15.0
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libapache2-mod-security2 \
      curl \
      ca-certificates && \
    \
    # Prepare ModSecurity dirs
    mkdir -p /etc/modsecurity /etc/modsecurity/rules /var/cache/modsecurity && \
    \
    # Copy base config
    cp /etc/modsecurity/modsecurity.conf-recommended /etc/modsecurity/modsecurity.conf && \
    \
    # Download and extract OWASP CRS v${CRS_VERSION}
    curl -fsSL "https://github.com/coreruleset/coreruleset/archive/refs/tags/v${CRS_VERSION}.tar.gz" \
      -o /tmp/crs.tar.gz && \
    tar zxvf /tmp/crs.tar.gz -C /usr/share && \
    mv /usr/share/coreruleset-${CRS_VERSION} /usr/share/modsecurity-crs && \
    rm /tmp/crs.tar.gz && \
    \
    # Copy CRS example setup into place
    cp /usr/share/modsecurity-crs/crs-setup.conf.example /etc/modsecurity/crs-setup.conf && \
    \
    # Symlink all rule and data files
    ln -sf /usr/share/modsecurity-crs/rules/*.conf /etc/modsecurity/rules/ && \
    ln -sf /usr/share/modsecurity-crs/rules/*.data /etc/modsecurity/rules/

# ── Copy our Apache include that loads mod_security2 + CRS ───────────────────
COPY modsecurity-apache.conf /etc/apache2/conf-available/modsecurity.conf
COPY whitelist.conf /etc/modsecurity/whitelist.conf

# ── Enable security2, drop any default, enable ours, turn engine ON, test syntax ─
RUN a2enmod security2 \
 && rm -f /etc/apache2/mods-enabled/security2.conf \
 && a2enconf modsecurity \
 && sed -i 's/SecRuleEngine DetectionOnly/SecRuleEngine On/' /etc/modsecurity/modsecurity.conf \
 \
 # enable JSON output for the audit log
 && echo 'SecAuditLogFormat JSON' >> /etc/modsecurity/modsecurity.conf \
 \
 && apache2ctl configtest

# ── make sure Apache can write its own logs ──────────────────────────────
RUN set -e \
 && mkdir -p /var/log/apache2 \
 && touch      /var/log/apache2/modsec_audit.log \
 && chown -R www-data:www-data /var/log/apache2 \
 && chmod 750 /var/log/apache2

# 4) Reload-hook CGI
ARG APACHE_RELOAD_SECRET
COPY reload_apache.cgi /usr/local/bin/
RUN sed -i "s@__RELOAD_SECRET__@${APACHE_RELOAD_SECRET}@" /usr/local/bin/reload_apache.cgi \
 && chmod 755 /usr/local/bin/reload_apache.cgi

COPY issue_cert.cgi /usr/local/bin/
RUN sed -i "s@__RELOAD_SECRET__@${APACHE_RELOAD_SECRET}@" /usr/local/bin/issue_cert.cgi \
    && chmod 755 /usr/local/bin/issue_cert.cgi

# 5) Pete & phpMyAdmin base vhosts
COPY pete.conf /etc/apache2/sites-available/000-pete.conf
COPY phpmyadmin.conf   /etc/apache2/sites-available/
COPY whitelist.conf    /etc/modsecurity/whitelist.conf
COPY modsecurity-apache.conf /etc/apache2/conf-available/modsecurity.conf

# 6) Make vhost dirs shared & writable *before* volume is created
RUN chown -R www-data:www-data /etc/apache2/sites-available /etc/apache2/sites-enabled

# 7) Enable baseline sites & configs (done once at build-time)
RUN a2ensite 000-pete.conf && \
    a2enconf modsecurity && \
    a2dissite 000-default.conf

# 8) Allow www-data (CGI) to reload Apache
RUN printf '%s\n' \
  'www-data ALL=(root) NOPASSWD: /usr/sbin/apachectl -k graceful' \
  'www-data ALL=(root) NOPASSWD: /usr/bin/certbot' \
  'www-data ALL=(root) NOPASSWD: /usr/bin/certbot renew' \
  'www-data ALL=(root) NOPASSWD:/var/www/html/Pete/scripts/refine_ssl.sh' \
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
