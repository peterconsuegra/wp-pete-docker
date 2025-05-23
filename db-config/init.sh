#!/usr/bin/env bash
set -e

echo ">>> Initializing WordPress & Pete databases…"

mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL

  CREATE DATABASE IF NOT EXISTS \`${PETE_DB_NAME}\`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS '${PETE_DB_USER}'@'%'
    IDENTIFIED BY '${PETE_DB_PASS}';
  GRANT ALL PRIVILEGES ON \`${PETE_DB_NAME}\`.* TO '${PETE_DB_USER}'@'%';

  GRANT CREATE, DROP, ALTER, INDEX ON *.* TO '${PETE_DB_USER}'@'%';

  FLUSH PRIVILEGES;
EOSQL
