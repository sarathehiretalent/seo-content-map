#!/bin/sh

# If no database exists in the persistent volume, copy the seed
if [ ! -f /app/prisma/dev.db ]; then
  echo "[entrypoint] No database found — copying seed database..."
  cp /app/prisma-seed/dev.db /app/prisma/dev.db
  echo "[entrypoint] Database seeded successfully."
else
  echo "[entrypoint] Existing database found — skipping seed."
fi

exec node server.js
