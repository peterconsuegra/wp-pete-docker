UN PROMPT OUTPUT
python3 prompt.py


REBUILD DOCKER WITHOUT CACHE
docker-compose build --no-cache wordpress

ENTER TO APP CONSOLE
docker-compose exec wordpress bash  

UP DOCKER
docker-compose up -d

DOWN DOCKER
docker-compose down -v 

ENTER MYSQL
docker-compose exec db mysql -u root -p