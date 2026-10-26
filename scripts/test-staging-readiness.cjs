const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname,'check-staging-runtime.mjs'),'utf8').replace("import { Pool } from 'pg';",'');
const run = new (Object.getPrototypeOf(async function(){}).constructor)('Pool','process','console',source);
async function check(migrated, requireWorker) {
  let ended=false;
  class Pool {
    async query(sql) {
      if(sql.includes('generation_run_id')&&!migrated) throw Object.assign(new Error('undefined column'),{code:'42703'});
      if(sql.includes('pg_roles'))return {rows:[{rolsuper:false,rolcreatedb:false,rolcreaterole:false}]};
      if(sql.includes('has_schema_privilege'))return {rows:[{allowed:false}]};
      return {rows:[{count:8}]};
    }
    async end(){ended=true;}
  }
  const process={env:{DATABASE_SCHEMA:'topreading_staging',DATABASE_URL:'postgresql://fixture'},argv:requireWorker?['--require-worker']:[],exitCode:0};
  await run(Pool,process,{log(){},error(){}});
  assert.equal(ended,true);
  return process.exitCode;
}
test('old web build can restart after pull and before worker migration',async()=>assert.equal(await check(false,false),0));
test('worker installation refuses missing worker columns',async()=>assert.equal(await check(false,true),1));
test('worker readiness passes after migration',async()=>assert.equal(await check(true,true),0));
