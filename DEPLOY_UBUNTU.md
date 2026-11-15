# Руководство по развёртыванию LEKALO ZHIIDE на Ubuntu 24.04 LTS

Настоящее руководство описывает пошаговый регламент установки, запуска, обслуживания и обновления production-инфраструктуры интернет-магазина цифровых выкроек **LEKALO ZHIIDE** с использованием Docker Compose и Caddy (SSL).

---

## 1. Системные требования к серверу

- **ОС**: Ubuntu 24.04 LTS (x86_64);
- **Процессор**: минимум 2 vCPU;
- **Оперативная память**: минимум 4 GB RAM (или 2 GB RAM + 2 GB Swap);
- **Диск**: от 30 GB NVMe/SSD;
- **Сетевые порты**:
  - `22/tcp` — SSH доступ;
  - `80/tcp` — HTTP (для Let's Encrypt проверки ACME);
  - `443/tcp` и `443/udp` — HTTPS (HTTP/2 и HTTP/3 QUIC).

---

## 2. Первоначальная настройка Ubuntu 24.04

Подключитесь к серверу по SSH:
```bash
ssh root@YOUR_SERVER_IP
```

### 2.1. Обновление пакетов и базовые утилиты
```bash
apt update && apt upgrade -y
apt install -y curl git ufw htop ca-certificates gnupg lsb-release
```

### 2.2. Настройка файрвола (UFW)
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP3 QUIC'
ufw --force enable
ufw status verbose
```

### 2.3. Установка Docker Engine и Docker Compose Plugin
```bash
# Добавление официального репозитория Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Проверка корректности установки
docker --version
docker compose version
```

---

## 3. Клонирование проекта и настройка переменных окружения

### 3.1. Клонирование репозитория
```bash
mkdir -p /opt/lekalo-zhiide
cd /opt/lekalo-zhiide
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ> .
```

### 3.2. Создание файла `.env`
Создайте рабочий конфигурационный файл из шаблона:
```bash
cp .env.example .env
```

### 3.3. Генерация криптографических секретов
Сгенерируйте уникальные пароли и ключи и внесите их в `.env`:
```bash
# Генерация пароля для PostgreSQL
openssl rand -base64 32

# Генерация JWT_SECRET (строго не менее 32 символов)
openssl rand -base64 48

# Генерация STORAGE_SIGNING_SECRET
openssl rand -base64 48

# Генерация PAYMENT_WEBHOOK_SECRET
openssl rand -base64 48
```

Откройте `.env` в редакторе:
```bash
nano .env
```

Убедитесь, что настроены следующие ключевые параметры:
```ini
NODE_ENV=production
DOMAIN=lekalo-zhiide.kg
CADDY_ACME_EMAIL=admin@lekalo-zhiide.kg

POSTGRES_USER=postgres
POSTGRES_PASSWORD=<СГЕНЕРИРОВАННЫЙ_ПАРОЛЬ_БД>
POSTGRES_DB=lekalo_zhiide

JWT_SECRET=<СГЕНЕРИРОВАННЫЙ_JWT_SECRET>
ALLOWED_ORIGINS="https://lekalo-zhiide.kg,https://www.lekalo-zhiide.kg"

STORAGE_SIGNING_SECRET=<СГЕНЕРИРОВАННЫЙ_STORAGE_SECRET>
PAYMENT_WEBHOOK_SECRET=<СГЕНЕРИРОВАННЫЙ_PAYMENT_SECRET>

NEXT_PUBLIC_API_URL="https://lekalo-zhiide.kg"
INTERNAL_API_URL="http://backend:4000"
```

---

## 4. Запуск проекта

### 4.1. Сборка и запуск контейнеров в фоновом режиме
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4.2. Контроль статуса и проб здоровья (Healthchecks)
```bash
docker compose -f docker-compose.prod.yml ps
```
Все 4 сервиса должны перейти в состояние `Up (healthy)`:
- `lekalo-postgres`
- `lekalo-backend`
- `lekalo-frontend`
- `lekalo-caddy`

### 4.3. Первичное наполнение справочников (Seeding)
При первом запуске на чистой базе выполните наполнение базовых справочников (размеры, ростовки, форматы печати):
```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma db seed
```

---

## 5. Проверка работоспособности

Выполните HTTP-проверки с сервера:
```bash
# 1. Проверка Backend Liveness
curl -I http://127.0.0.1:4000/health

# 2. Проверка Backend Readiness (соединение с PostgreSQL)
curl -I http://127.0.0.1:4000/health/ready

# 3. Проверка публичного домена через Caddy (после настройки DNS)
curl -IL https://lekalo-zhiide.kg/health/ready
```

---

## 6. Регламент регулярного обновления проекта

Для обновления проекта до актуальной версии без простоя:

```bash
cd /opt/lekalo-zhiide

# 1. Получение последних изменений из git
git pull origin main

# 2. Сборка обновлённых образов
docker compose -f docker-compose.prod.yml build

# 3. Перезапуск бэкенда (автоматически применит миграции базы данных)
docker compose -f docker-compose.prod.yml up -d --no-deps backend

# 4. Перезапуск фронтенда
docker compose -f docker-compose.prod.yml up -d --no-deps frontend

# 5. Очистка устаревших Docker-образов
docker image prune -f
```

---

## 7. Резервное копирование базы данных

### 7.1. Настройка скрипта бэкапа
```bash
chmod +x /opt/lekalo-zhiide/deploy/backup-db.sh
mkdir -p /var/backups/lekalo-zhiide
```

### 7.2. Настройка автоматического ежедневного бэкапа (cron)
Откройте crontab:
```bash
crontab -e
```
Добавьте строку для ежедневного запуска в 03:00 ночи:
```cron
0 3 * * * /opt/lekalo-zhiide/deploy/backup-db.sh >> /var/log/lekalo-backup.log 2>&1
```

---

## 8. Мониторинг и просмотр логов

```bash
# Логи всех сервисов в реальном времени
docker compose -f docker-compose.prod.yml logs -f

# Логи бэкенда
docker compose -f docker-compose.prod.yml logs -f backend

# Логи веб-сервера Caddy
docker compose -f docker-compose.prod.yml logs -f caddy
```
