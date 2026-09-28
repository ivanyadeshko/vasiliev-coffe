#!/usr/bin/env bash
# Деплой на прод: rsync кода + docker compose + nginx-vhost.
# Данные (data/) заливаются только отсутствующие файлы — цены,
# выставленные владельцем в админке, при редеплое не затираются.
set -euo pipefail
HOST=root@199.189.248.174
DIR=/opt/vasiliev-coffee

cd "$(dirname "$0")/.."
ssh "$HOST" "mkdir -p $DIR"
rsync -az --delete --exclude .DS_Store public lib bin tests deploy README.md "$HOST:$DIR/"
rsync -az --ignore-existing --exclude backups --exclude '*.tmp.*' --exclude login-attempts.json --exclude logs data "$HOST:$DIR/"

ssh "$HOST" "
  set -e
  cd $DIR
  cp deploy/docker-compose.prod.yml docker-compose.yml
  chown -R 33:33 data
  chmod -R a+rX public
  docker compose up -d
  install -m 644 deploy/nginx-vasiliev-coffee.conf /etc/nginx/sites-available/vasiliev-coffee
  ln -sf /etc/nginx/sites-available/vasiliev-coffee /etc/nginx/sites-enabled/vasiliev-coffee
  nginx -t
  systemctl reload nginx
"
echo 'готово: http://vasiliev-coffee.yadeshko.ru'
