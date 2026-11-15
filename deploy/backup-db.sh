#!/bin/bash
set -euo pipefail

# ==============================================================================
# LEKALO ZHIIDE — СКРИПТ РЕЗЕРВНОГО КОПИРОВАНИЯ POSTGRESQL
# ==============================================================================

BACKUP_DIR="/var/backups/lekalo-zhiide"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/lekalo_db_${TIMESTAMP}.sql.gz"
CONTAINER_NAME="lekalo-postgres"
DB_NAME="lekalo_zhiide"
DB_USER="postgres"
DAYS_TO_KEEP=14

# Создание каталога бэкапов, если не существует
mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Начало резервного копирования базы данных ${DB_NAME}..."

# Создание дампа базы данных из контейнера с сжатием gzip
docker exec -t "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists | gzip > "${BACKUP_FILE}"

echo "[$(date)] Резервная копия успешно создана: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Удаление бэкапов старше DAYS_TO_KEEP дней
find "${BACKUP_DIR}" -type f -name "lekalo_db_*.sql.gz" -mtime +${DAYS_TO_KEEP} -delete
echo "[$(date)] Старые копии старше ${DAYS_TO_KEEP} дней удалены."
