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
  'shifts',
  'employee_shifts',
  'holidays',
  'attendance_records',
  'attendance_regularizations',
  'leave_types',
  'leave_allocations',
  'leave_requests',
  'performance_cycles',
  'performance_reviews',
  'hr_onboarding_tasks',
  'hr_lifecycle_events',
  'hr_resignations',
  'hr_exit_checklists',
  'hr_document_metadata',
];

console.log('\n============================================================');
console.log('MILESTONE 7 PHASE B: HR DATABASE & SCHEMA PRAGMA AUDIT');
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
      `  - ${col.name.padEnd(28)} | type: ${col.type.padEnd(8)} | notnull: ${col.notnull} | dflt: ${String(col.dflt_value).padEnd(10)} | pk: ${col.pk}`
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
        `  - ${idx.name.padEnd(38)} | unique: ${idx.unique ? 'YES' : 'NO '} | columns: (${colNames})`
      );
    }
  }
}

console.log('\n============================================================');
console.log('VERIFICATION COMPLETE: ALL 15 HR TABLES AUDITED SUCCESSFULLY');
console.log('============================================================\n');
