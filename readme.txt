UN PROMPT OUTPUT
python3 prompt.py


REBUILD DOCKER WITHOUT CACHE
docker-compose build --no-cache wordpress

ENTER TO APP CONSOLE
docker-compose exec wordpress bash  

UP DOCKER
docker-compose up -d

DOWN DOCKER -v removing the volumes
docker-compose down -v 

DOWN DOCKER
docker-compose down

UP DOCKER
docker-compose up

ENTER MYSQL
docker-compose exec db mysql -u root -p

DOCKER UP
docker-compose -f mac_m1.yml up --build

docker-compose up --build

BULD DOCKER COMPOSE DEVELOPMENT
docker-compose -f docker-compose.dev.yml up --build -d
