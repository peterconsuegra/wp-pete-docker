FROM mariadb:10.6

# your existing init stuff
COPY init.sh /docker-entrypoint-initdb.d/init.sh
RUN apt-get update && apt-get install -y --no-install-recommends dos2unix \
 && find /docker-entrypoint-initdb.d -type f -name "*.sh" -exec dos2unix {} \; \
 && chmod +x /docker-entrypoint-initdb.d/*.sh \
 && rm -rf /var/lib/apt/lists/*

#REFINE ACPACHE PERFORMANCE
ARG SERVER=16ram-4cpu

# Always copy the performance profile (must exist in build context under apache/${SERVER}/)
COPY ${SERVER}/99-pete.cnf /etc/mysql/conf.d/99-pete.cnf
RUN chmod 0644 /etc/mysql/conf.d/99-pete.cnf