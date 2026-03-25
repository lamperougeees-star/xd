# 🚀 Деплой на VPS — Инструкция

## Домен: `xo1337.duckdns.org`

## Требования к серверу
- Ubuntu 20.04 / 22.04 LTS (или Debian)
- Минимум 512MB RAM, 10GB диска
- Root или sudo доступ

---

## 1. Подключение к серверу

```bash
ssh root@IP_ВАШЕГО_СЕРВЕРА
```

---

## 2. Установка Node.js

```bash
# Установка Node.js 20 LTS через NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка
node --version   # должно быть v20.x.x
npm --version
```

---

## 3. Установка Nginx

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 4. Загрузка проекта на сервер

**Вариант A — через Git (рекомендуется):**
```bash
sudo mkdir -p /var/www/ne-grusti
sudo chown www-data:www-data /var/www/ne-grusti

# Клонируем репозиторий
cd /var/www
sudo git clone https://github.com/ВАШЕ_ИМЯ/РЕПОЗИТОРИЙ.git ne-grusti
sudo chown -R www-data:www-data /var/www/ne-grusti
```

**Вариант B — через scp (с вашего компьютера):**
```bash
# Выполнять на вашем компьютере (не на сервере)
scp -r /Users/ray/working root@IP_СЕРВЕРА:/var/www/ne-grusti
```

---

## 5. Установка зависимостей

```bash
cd /var/www/ne-grusti
npm install --production
```

---

## 6. Настройка переменных окружения

```bash
# Создаём .env файл (с вашими реальными данными!)
sudo nano /var/www/ne-grusti/.env
```

Содержимое `.env`:
```
EMAIL_USER=ваш-email@gmail.com
EMAIL_PASS=xxxx-xxxx-xxxx-xxxx
PORT=3001
NODE_ENV=production
```

```bash
# Устанавливаем права — только для владельца
sudo chmod 600 /var/www/ne-grusti/.env
sudo chown www-data:www-data /var/www/ne-grusti/.env
```

---

## 7. Создание папки data

```bash
sudo mkdir -p /var/www/ne-grusti/data
sudo chown www-data:www-data /var/www/ne-grusti/data
sudo chmod 750 /var/www/ne-grusti/data
```

---

## 8. Настройка systemd

```bash
# Копируем service файл
sudo cp /var/www/ne-grusti/ne-grusti.service /etc/systemd/system/

# Отредактируйте пути если нужно
sudo nano /etc/systemd/system/ne-grusti.service

# Активируем и запускаем
sudo systemctl daemon-reload
sudo systemctl enable ne-grusti
sudo systemctl start ne-grusti

# Проверяем статус
sudo systemctl status ne-grusti
```

---

## 9. Настройка Nginx

```bash
# Копируем конфиг
sudo cp /var/www/ne-grusti/nginx.conf /etc/nginx/sites-available/ne-grusti

# Создаём симлинк
sudo ln -s /etc/nginx/sites-available/ne-grusti /etc/nginx/sites-enabled/

# Удаляем дефолтный сайт
sudo rm -f /etc/nginx/sites-enabled/default

# Проверяем конфиг
sudo nginx -t

# Если всё ок — перезагружаем
sudo systemctl reload nginx
```

---

## 10. Настройка DuckDNS

Убедитесь, что домен `xo1337.duckdns.org` указывает на IP вашего сервера.

```bash
# Проверка (должен показать IP вашего VPS)
dig +short xo1337.duckdns.org

# Ручное обновление IP (замените YOUR_TOKEN на ваш DuckDNS токен)
curl "https://www.duckdns.org/update?domains=xo1337&token=YOUR_DUCKDNS_TOKEN&ip="
```

Для автообновления добавьте в cron:
```bash
crontab -e
# Добавьте строку:
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=xo1337&token=YOUR_DUCKDNS_TOKEN&ip=" > /dev/null 2>&1
```

---

## 11. Настройка SSL (HTTPS) через Let's Encrypt

⚠️ **DuckDNS не поддерживает стандартный HTTP challenge certbot!**
Используйте DNS challenge с плагином DuckDNS:

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение сертификата для DuckDNS
sudo certbot --nginx -d xo1337.duckdns.org

# Если стандартный метод не сработает, используйте manual DNS challenge:
# sudo certbot certonly --manual --preferred-challenges dns -d xo1337.duckdns.org

# Проверяем автоматическое обновление
sudo systemctl status certbot.timer
```

После получения SSL раскомментируйте HTTPS блок в `nginx.conf` и закомментируйте HTTP блок (или добавьте редирект).

---

## 12. Настройка файрвола

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 🚀 Автоматическая установка (быстрый способ)

Вместо ручной установки можно использовать скрипт:

```bash
# Загрузите проект на сервер, затем:
cd /var/www/ne-grusti
sudo bash setup-server.sh
```

Скрипт автоматически выполнит шаги 2-9 и 12.

---

## Обновление сайта

```bash
cd /var/www/ne-grusti

# Через Git:
sudo git pull

# Устанавливаем новые зависимости (если есть)
sudo npm install --production

# Перезапускаем приложение
sudo systemctl restart ne-grusti
```

---

## Полезные команды

```bash
# Просмотр логов приложения
journalctl -u ne-grusti -f

# Просмотр логов Nginx
sudo tail -f /var/log/nginx/ne-grusti.access.log
sudo tail -f /var/log/nginx/ne-grusti.error.log

# Статус всех сервисов
sudo systemctl status nginx ne-grusti

# Перезапуск после изменений
sudo systemctl restart ne-grusti
sudo systemctl reload nginx
```

---

## Структура проекта на сервере

```
/var/www/ne-grusti/
├── index.html          # Фронтенд
├── work.cs             # Сервер Node.js
├── work.js             # Клиентский JS
├── .env                # Секреты (НЕ в Git!)
├── css/
│   └── work.css
├── data/               # База данных (НЕ в Git!)
│   ├── users.json
│   └── pending.json
└── node_modules/
```

---

## ⚠️ Важно

- **Никогда** не коммитьте `.env` в Git
- **Никогда** не коммитьте папку `data/` в Git
- Регулярно делайте резервную копию `data/users.json`
- Следите за логами через `journalctl -u ne-grusti`
- Убедитесь, что DuckDNS токен обновляет IP автоматически через cron
