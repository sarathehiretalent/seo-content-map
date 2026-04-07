#!/bin/sh

# If no database exists in the persistent volume
if [ ! -f /app/prisma/dev.db ]; then
  if [ -f /app/prisma-seed/dev.db ]; then
    echo "[entrypoint] Copying seed database..."
    cp /app/prisma-seed/dev.db /app/prisma/dev.db
  else
    echo "[entrypoint] No database found — initializing empty database..."
    # Create DB with schema
    if command -v sqlite3 > /dev/null 2>&1; then
      sqlite3 /app/prisma/dev.db < /app/prisma/schema.sql
    else
      # Use node to create the DB
      node -e "
        const Database = require('better-sqlite3');
        const fs = require('fs');
        const db = new Database('/app/prisma/dev.db');
        const sql = fs.readFileSync('/app/prisma/schema.sql', 'utf8');
        const statements = sql.split(';').filter(s => s.trim());
        for (const stmt of statements) { try { db.exec(stmt); } catch(e) { console.log('Skip:', e.message.slice(0,80)); } }
        db.close();
        console.log('[entrypoint] Database tables created.');
      "
    fi
  fi
  echo "[entrypoint] Database ready."
else
  echo "[entrypoint] Existing database found."
fi

exec node server.js
