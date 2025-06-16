RUN PROJECT
docker-compose up --build

STOP PROJECT
docker-compose down

ENTER TO CONTAINER VIA TERMINAL
docker-compose exec wordpress bash 
docker-compose exec apache bash
docker-compose exec php bash

CHANGES IN DOCKERFILE
docker-compose down -v 
docker-compose build --no-cache wordpress
docker-compose build --no-cache apache
docker-compose build --no-cache php

REHACER phpMyAdmin
docker-compose down
docker volume rm wp-pete-docker_pma_data

RESTART APACHE
apache2ctl restart
apache confs
/etc/apache2/sites-available
/etc/apache2/sites-enabled

PROMPT GENERATOR
python3 prompt.py

ERASE AN REMOVE CONTAINERS
docker-compose down -v 

ENTER MYSQL
docker-compose exec db mysql -u root -p

RELOAD FROM CONTAINER
curl -sf -H "X-Reload-Secret: SuperReload123" \
     http://apache/internal-reload  || true

TEST URLS OFF BY DEFAULT
http://pete.petelocal.net/server-status?refresh=5
http://pete.petelocal.net/phpmyadmin