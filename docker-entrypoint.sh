#!/bin/sh

echo "[entrypoint] Ensuring database exists and has all tables..."

node -e "
const Database = require('better-sqlite3');
const fs = require('fs');
const dbPath = '/app/prisma/dev.db';
const db = new Database(dbPath);
const sql = fs.readFileSync('/app/prisma/schema.sql', 'utf8');
const stmts = sql.split(';').filter(s => s.trim());
let created = 0;
for (const s of stmts) {
  try {
    const safe = s.replace(/CREATE TABLE\b/gi, 'CREATE TABLE IF NOT EXISTS')
                  .replace(/CREATE UNIQUE INDEX\b/gi, 'CREATE UNIQUE INDEX IF NOT EXISTS')
                  .replace(/CREATE INDEX\b/gi, 'CREATE INDEX IF NOT EXISTS');
    db.exec(safe);
    created++;
  } catch(e) {}
}
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\").all();
console.log('[entrypoint] ' + tables.length + ' tables ready: ' + tables.map(t => t.name).join(', '));
db.close();
"

exec node server.js
