#!/bin/sh

# If no database exists in the persistent volume
if [ ! -f /app/prisma/dev.db ] || [ ! -s /app/prisma/dev.db ]; then
  if [ -f /app/prisma-seed/dev.db ]; then
    echo "[entrypoint] Copying seed database..."
    cp /app/prisma-seed/dev.db /app/prisma/dev.db
  else
    echo "[entrypoint] Creating empty database with schema..."
    node -e "
      const Database = require('better-sqlite3');
      const fs = require('fs');
      const db = new Database('/app/prisma/dev.db');
      const sql = fs.readFileSync('/app/prisma/schema.sql', 'utf8');
      const stmts = sql.split(';').filter(s => s.trim());
      for (const s of stmts) { try { db.exec(s); } catch(e) {} }
      db.close();
    "
  fi
  echo "[entrypoint] Database ready."
else
  echo "[entrypoint] Existing database found. Ensuring all tables exist..."
  node -e "
    const Database = require('better-sqlite3');
    const fs = require('fs');
    const db = new Database('/app/prisma/dev.db');
    const sql = fs.readFileSync('/app/prisma/schema.sql', 'utf8');
    const stmts = sql.split(';').filter(s => s.trim());
    let created = 0;
    for (const s of stmts) {
      try {
        const ifNotExists = s.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS').replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS').replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS');
        db.exec(ifNotExists);
        created++;
      } catch(e) {}
    }
    db.close();
    console.log('[entrypoint] Checked ' + created + ' table/index statements.');
  "
fi

exec node server.js
