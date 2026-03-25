#!/bin/bash
# ============================================================
# Скрипт автоустановки сайта "Yuki Shop" на VPS
# Запускать на сервере: bash setup-server.sh
# ============================================================

set -e  # Останавливаться при любой ошибке

DOMAIN="xo1337.duckdns.org"
APP_DIR="/var/www/ne-grusti"
SERVICE_NAME="ne-grusti"

echo "======================================"
echo "  Установка сайта Ne-Grusti на VPS"
echo "  Домен: $DOMAIN"
echo "======================================"
echo ""

# --- 1. Обновление системы ---
echo "[1/8] Обновление пакетов..."
apt update -y && apt upgrade -y

# --- 2. Установка Node.js 20 LTS ---
echo "[2/8] Установка Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"

# --- 3. Установка Nginx ---
echo "[3/8] Установка Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx
echo "  Nginx установлен"

# --- 4. Создание директории и настройка прав ---
echo "[4/8] Настройка директории проекта..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/data
chown -R www-data:www-data $APP_DIR
chmod -R 755 $APP_DIR
chmod 750 $APP_DIR/data

# --- 5. Установка зависимостей Node.js ---
echo "[5/8] Установка зависимостей npm..."
cd $APP_DIR
npm install --production
chown -R www-data:www-data $APP_DIR/node_modules

# --- 6. Настройка systemd сервиса ---
echo "[6/8] Настройка systemd..."
cp $APP_DIR/ne-grusti.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable $SERVICE_NAME

# Запускаем только если есть .env
if [ -f "$APP_DIR/.env" ]; then
    systemctl start $SERVICE_NAME
    echo "  Сервис запущен!"
else
    echo "  ⚠️  .env файл не найден — сервис НЕ запущен"
    echo "  Создайте $APP_DIR/.env и запустите: sudo systemctl start $SERVICE_NAME"
fi

# --- 7. Настройка Nginx ---
echo "[7/8] Настройка Nginx..."
cp $APP_DIR/nginx.conf /etc/nginx/sites-available/$SERVICE_NAME

# Удаляем дефолтный сайт если есть
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
fi

# Создаём симлинк
if [ ! -L /etc/nginx/sites-enabled/$SERVICE_NAME ]; then
    ln -s /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/
fi

# Проверяем конфиг
nginx -t && systemctl reload nginx
echo "  Nginx настроен для домена $DOMAIN"

# --- 8. Настройка файрвола ---
echo "[8/8] Настройка файрвола..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status

echo ""
echo "======================================"
echo "  УСТАНОВКА ЗАВЕРШЕНА!"
echo "======================================"
echo ""
echo "Следующие шаги:"
echo ""
echo "1. Создайте .env файл:"
echo "   nano $APP_DIR/.env"
echo "   (скопируйте содержимое из .env.example)"
echo ""
echo "2. Запустите приложение:"
echo "   sudo systemctl start $SERVICE_NAME"
echo "   sudo systemctl status $SERVICE_NAME"
echo ""
echo "3. Получите SSL сертификат:"
echo "   apt install -y certbot python3-certbot-nginx"
echo "   certbot --nginx -d $DOMAIN"
echo ""
echo "4. Проверьте сайт: http://$DOMAIN"
echo ""
