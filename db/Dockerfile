FROM mariadb:10.6
# copy your init files into the image (instead of bind-mounting)
COPY db-config/ /docker-entrypoint-initdb.d/
RUN apt-get update && apt-get install -y --no-install-recommends dos2unix \
 && find /docker-entrypoint-initdb.d -type f -name "*.sh" -exec dos2unix {} \; \
 && chmod +x /docker-entrypoint-initdb.d/*.sh \
 && rm -rf /var/lib/apt/lists/*