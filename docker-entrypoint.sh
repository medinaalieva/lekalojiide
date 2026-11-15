#!/bin/sh
set -e

echo "=== LEKALO ZHIIDE Backend Container Starting ==="

# Apply pending database migrations automatically in production
if [ "$RUN_MIGRATIONS" = "true" ] || [ "$NODE_ENV" = "production" ]; then
  echo "--> Running Prisma database migrations..."
  npx prisma migrate deploy || {
    echo "ERROR: Database migration failed. Check PostgreSQL connection."
    exit 1
  }
  echo "--> Database migrations applied successfully."
fi

# Seed initial dictionaries if requested
if [ "$RUN_SEED" = "true" ]; then
  echo "--> Running database seed..."
  npx prisma db seed || echo "WARN: Database seed encountered an issue (may already be seeded)."
fi

echo "--> Launching HTTP API Application..."
exec "$@"
