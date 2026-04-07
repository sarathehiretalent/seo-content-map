#!/bin/sh

# If no database exists in the persistent volume, create empty one
if [ ! -f /app/prisma/dev.db ]; then
  if [ -f /app/prisma-seed/dev.db ]; then
    echo "[entrypoint] Copying seed database..."
    cp /app/prisma-seed/dev.db /app/prisma/dev.db
  else
    echo "[entrypoint] No database found — creating empty database..."
    touch /app/prisma/dev.db
  fi
  echo "[entrypoint] Database ready."
else
  echo "[entrypoint] Existing database found."
fi

exec node server.js
