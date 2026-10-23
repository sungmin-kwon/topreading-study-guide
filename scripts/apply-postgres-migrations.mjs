import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const schema = process.env.DATABASE_SCHEMA || 'topreading';
if (!/^[a-z][a-z0-9_]*$/.test(schema) || schema === 'public') {
  throw Error('Use a dedicated DATABASE_SCHEMA');
}
if (!/^postgres(ql)?:\/\//.test(process.env.MIGRATION_DATABASE_URL || '')) {
  throw Error('MIGRATION_DATABASE_URL is required');
}
const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const connection = await pool.connect();
try {
  await connection.query('BEGIN');
  await connection.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`topreading-migrations:${schema}`]);
  await connection.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
  const bootstrap = await connection.query('SELECT version FROM migration_history LIMIT 1');
  if (!bootstrap.rowCount) throw Error('Verified bootstrap import required');
  await connection.query('CREATE TABLE IF NOT EXISTS application_migrations(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = new URL('../database/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter(name => /^\d{4}_.*\.sql$/.test(name) && !name.startsWith('0001_')).sort();
  let applied = 0;
  for (const file of files) {
    const sql = await readFile(new URL(file, dir), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const previous = (await connection.query('SELECT sha256 FROM application_migrations WHERE version=$1', [file])).rows[0];
    if (previous) {
      if (previous.sha256 !== hash) throw Error(`Migration checksum changed: ${file}`);
      continue;
    }
    await connection.query(sql);
    await connection.query('INSERT INTO application_migrations(version,sha256) VALUES($1,$2)', [file, hash]);
    applied++;
    console.log(`Applied ${file}`);
  }
  await connection.query('COMMIT');
  if (!applied) console.log('Application migrations are up to date.');
} catch (error) {
  await connection.query('ROLLBACK');
  // PostgreSQL diagnostics can include data. Report codes, and only our own
  // known configuration errors verbatim; never echo a connection string.
  const detail = /^(Migration checksum changed:|Verified bootstrap import required)/.test(error.message)
    ? error.message : error.code || error.name;
  console.error('Migration rolled back:', detail);
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
