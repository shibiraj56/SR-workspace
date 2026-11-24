import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

const d1Dir = resolve('apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const sqliteFile = readdirSync(d1Dir).find((f) => f.endsWith('.sqlite'));

if (!sqliteFile) {
  console.error('No SQLite file found in miniflare directory');
  process.exit(1);
}

const dbPath = resolve(d1Dir, sqliteFile);
console.log('Connecting to Local D1 database:', dbPath);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

const targetTables = [
  'conversations',
  'conversation_members',
  'messages',
  'message_reactions',
  'attachments',
  'notifications',
];

console.log('\n============================================================');
console.log('PHASE B DATABASE & SCHEMA VERIFICATION');
console.log('============================================================\n');

for (const tableName of targetTables) {
  console.log(`\n------------------------------------------------------------`);
  console.log(`TABLE: ${tableName}`);
  console.log(`------------------------------------------------------------`);

  // 1. Table Info
  const columns = db.prepare(`PRAGMA table_info('${tableName}');`).all();
  console.log('COLUMNS:');
  for (const col of columns) {
    console.log(
      `  - ${col.name.padEnd(24)} | type: ${col.type.padEnd(8)} | notnull: ${col.notnull} | dflt: ${String(col.dflt_value).padEnd(6)} | pk: ${col.pk}`
    );
  }

  // 2. Foreign Keys
  const fks = db.prepare(`PRAGMA foreign_key_list('${tableName}');`).all();
  console.log('\nFOREIGN KEYS:');
  if (fks.length === 0) {
    console.log('  (none)');
  } else {
    for (const fk of fks) {
      console.log(
        `  - [${fk.from}] -> ${fk.table}(${fk.to}) | on_update: ${fk.on_update} | on_delete: ${fk.on_delete}`
      );
    }
  }

  // 3. Indexes
  const indexes = db.prepare(`PRAGMA index_list('${tableName}');`).all();
  console.log('\nINDEXES:');
  if (indexes.length === 0) {
    console.log('  (none)');
  } else {
    for (const idx of indexes) {
      const idxCols = db.prepare(`PRAGMA index_info('${idx.name}');`).all();
      const colNames = idxCols.map((c) => c.name).join(', ');
      console.log(
        `  - ${idx.name.padEnd(35)} | unique: ${idx.unique ? 'YES' : 'NO '} | columns: (${colNames})`
      );
    }
  }
}

// Check total tables in database
const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%';").all();
console.log('\n============================================================');
console.log(`TOTAL USER/SYSTEM TABLES VERIFIED: ${allTables.length}`);
console.log('TABLE LIST:', allTables.map((t) => t.name).sort().join(', '));
console.log('============================================================\n');

db.close();
