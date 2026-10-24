// systemd ExecStartPre: verify the restricted staging DB connection without
// printing credentials, configuration, user addresses or library contents.
import { Pool } from 'pg';
const schema = process.env.DATABASE_SCHEMA;
if (schema !== 'topreading_staging' || !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || '')) {
  console.error('Staging PostgreSQL configuration is required.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
try {
  const role = (await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole) throw Error('Use the restricted staging application role');
  const privilege = (await pool.query("SELECT has_schema_privilege(current_user,'topreading_staging','CREATE') AS allowed")).rows[0];
  if (privilege.allowed) throw Error('Application role must not own or create schema objects');
  const result = await pool.query('SELECT count(*)::integer AS count FROM topreading_staging.books');
  await pool.query('SELECT 1 FROM topreading_staging.auth_sessions LIMIT 1');
  await pool.query('SELECT 1 FROM topreading_staging.app_settings LIMIT 1');
  console.log(`Staging database ready (${result.rows[0].count} books).`);
} catch (error) {
  console.error('Staging database readiness failed:', error.code || error.name);
  process.exitCode = 1;
} finally {
  await pool.end();
}
