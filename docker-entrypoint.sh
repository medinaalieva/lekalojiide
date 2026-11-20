#!/bin/sh
set -e

# Обеспечиваем работу S3-хранилища для NestJS внутри контейнера
export STORAGE_DRIVER="${STORAGE_DRIVER:-s3}"

echo "=== LEKALO ZHIIDE Backend Container Starting ==="

# Apply pending database migrations only when explicitly requested (RUN_MIGRATIONS=true)
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "--> Running Prisma database migrations (explicit RUN_MIGRATIONS=true)..."
  npx prisma migrate deploy || {
    echo "ERROR: Database migration failed. Check PostgreSQL connection."
    exit 1
  }
  echo "--> Database migrations applied successfully."
fi

# Seed initial dictionaries only when explicitly requested (RUN_SEED=true)
if [ "$RUN_SEED" = "true" ]; then
  echo "--> Running database seed (explicit RUN_SEED=true)..."
  npx prisma db seed || echo "WARN: Database seed encountered an issue (may already be seeded)."
fi

echo "--> Launching HTTP API Application..."
exec "$@"
