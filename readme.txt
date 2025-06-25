MAC COMMANDS

RUN PROJECT
docker-compose up --build

STOP PROJECT
docker-compose down

ENTER TO CONTAINER VIA TERMINAL
docker-compose exec apache bash
docker-compose exec php bash

CHANGES IN DOCKERFILE
docker-compose build --no-cache apache
docker-compose build --no-cache php

REBUILD PHPMYADMIN
docker-compose down
docker volume rm wp-pete-docker_pma_data

DELETE ALL VOLUMES
docker-compose down -v 

RESTART APACHE
apache2ctl restart
apache confs

APACHE CONFIGURATION FILES ROUTES
/etc/apache2/sites-available
/etc/apache2/sites-enabled

PROMPT GENERATOR
python3 prompt.py

ERASE AN REMOVE CONTAINERS
docker-compose down -v 

ENTER MYSQL
docker-compose exec db mysql -u root -p

LINUX COMMANDS

RUN PROJECT
docker compose up --build

STOP PROJECT
docker compose down

ENTER TO CONTAINER VIA TERMINAL
docker compose exec apache bash
docker compose exec php bash

CHANGES IN DOCKERFILE
docker compose build --no-cache apache
docker compose build --no-cache php

REBUILD PHPMYADMIN
docker compose down
docker volume rm wp-pete-docker_pma_data

DELETE ALL VOLUMES
docker compose down -v 

RESTART APACHE
apache2ctl restart
apache confs

APACHE CONFIGURATION FILES ROUTES
/etc/apache2/sites-available
/etc/apache2/sites-enabled

PROMPT GENERATOR
python3 prompt.py

ERASE AN REMOVE CONTAINERS
docker compose down -v 

ENTER MYSQL
docker compose exec db mysql -u root -p

RELOAD APACHE FROM PHP CONTAINER
curl -sf -H "X-Reload-Secret: SuperReload123" \
     http://apache/internal-reload  || true

TEST URLS OFF BY DEFAULT
http://pete.petelocal.net/server-status?refresh=5
http://pete.petelocal.net/phpmyadmin

PROMPT GENERATOR
PROMPT_GENERATOR_FILES=docker-compose.yml,php/Dockerfile,apache/Dockerfile,db-config/my.cnf,php/pete_install.sh,db-config/init.sh,.env,apache/pete.conf,apache/phpmyadmin.conf,php/.gitconfig,apache/whitelist.conf,apache/modsecurity-apache.conf
PROMPT_GENERATOR_CONTEXT=You are an experienced DevOps devolver with extensive knowlege in Docker. Below are the code files of a Docker LAMP app
cp .env.example.development .env
cp .env.example.production .env

DOWNLOAD WORDPRESS SAMPLE FOR TESTING
docker compose exec apache \
  bash -c "cd /var/www/html && curl -LO https://wordpresspete.com/demov5.tar.gz && chown www-data:www-data demov5.tar.gz"

docker-compose exec apache \
  bash -c "cd /var/www/html && curl -LO https://wordpresspete.com/demov5.tar.gz && chown www-data:www-data demov5.tar.gz"

HARDENING YOUR VM (RECOMMENDED)
vim /etc/ssh/sshd_config
Port 2222
sudo systemctl reload sshd
sudo ufw delete limit 22/tcp
sudo ufw limit 2222/tcp

sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

curl -s -H "X-Reload-Secret: Super3232" \
     "http://apache/internal-certbot?domain=demo7.wordpresspete.org&email=pedroconsuegrat@gmail.com"

WIKI OLD
https://github.com/peterconsuegra/wordpress-pete-docker/wiki



# 1. Recompute limits for THIS host or CI runner
./bin/tune_apache_env.sh

# 2. Rebuild image so numbers are baked in
docker compose build apache

# 3. Start / restart the stack
docker compose up -d



