DEVELOPMENT TO RUN THE PROJECT:

chmod +x db-config/init.sh
chmod +x wordpress/pete_install.sh
docker-compose up --build

REINICIAR APACHE
apache2ctl restart

CHANGES IN DOCKERFILE
docker-compose down -v 
docker-compose build --no-cache wordpress
docker-compose up --build

ENTER TO APP CONTAINER
docker-compose exec wordpress bash 

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

