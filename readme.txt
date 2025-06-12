RUN PROJECT
docker-compose up --build

REHACER phpMyAdmin
docker-compose down
docker volume rm wp-pete-docker_pma_data


chmod +x db-config/init.sh
chmod +x wordpress/pete_install.sh
docker-compose up --build

REINICIAR APACHE



apache2ctl restart
apache confs
/etc/apache2/sites-available
/etc/apache2/sites-enabled

CHANGES IN DOCKERFILE
docker-compose down -v 
docker-compose build --no-cache wordpress
docker-compose build --no-cache apache
docker-compose build --no-cache php
docker-compose up --build

ENTER TO APP CONTAINER
docker-compose exec wordpress bash 
docker-compose exec apache bash
docker-compose exec php bash

ENTER TO DB CONTAINER
docker-compose exec db bash

PROMPT GENERATOR
python3 prompt.py

REBUILD DOCKER WITHOUT CACHE
docker-compose build --no-cache wordpress

UP DOCKER
docker-compose up -d

DOWN DOCKER -v removing the volumes (Delete all inside containers)
docker-compose down -v 

DOWN DOCKER
docker-compose down

UP DOCKER
docker-compose up

ENTER MYSQL
docker-compose exec db mysql -u root -p

DOCKER UP
docker-compose up --build

docker-compose up --build


branch name
docker_mpm_event2

RELOAD FROM CONTAINER

curl -sf -H "X-Reload-Secret: SuperReload123" \
     http://apache/internal-reload  || true