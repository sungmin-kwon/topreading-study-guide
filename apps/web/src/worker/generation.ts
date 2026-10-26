import { pool } from "@/lib/db/client";
import { cancellationRequested, queueSchema as s, workerLock } from "@/lib/generation-queue";
import { executeGeneration } from "@/lib/generation-executor";

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
// One worker per schema. A session lock prevents a replacement from recovering
// jobs while the previous worker still owns them. Loss of that connection is fatal.
const owner = await pool.connect();
owner.on('error', () => { console.error('Worker lock connection lost.'); process.exit(1); });
const locked = (await owner.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [workerLock])).rows[0].locked;
if (!locked) { console.error('A generation worker already owns this database.'); process.exit(1); }

async function finishInterrupted() {
  await owner.query('BEGIN');
  try {
    const message = 'Worker interrupted. Completed chapters were preserved. An in-flight model request may have been charged. Create a new version to retry; this run will not be replayed automatically.';
    await owner.query(`UPDATE ${s}.generation_runs r SET status='failed', error_message=$1, finished_at=now(), updated_at=now(), log_json=r.log_json || jsonb_build_array(jsonb_build_object('timestamp',now(),'level','error','message',$1::text)) FROM ${s}.jobs j WHERE j.generation_run_id=r.id AND j.kind='generate' AND j.status='running' AND r.status='generating'`, [message]);
    await owner.query(`UPDATE ${s}.study_sets st SET status='failed' FROM ${s}.jobs j WHERE st.generation_run_id=j.generation_run_id AND j.status='running' AND st.status NOT IN ('ready','reviewed')`);
    await owner.query(`UPDATE ${s}.jobs j SET status=CASE WHEN r.status IN ('completed','cancelled') THEN r.status ELSE 'failed' END,last_error=CASE WHEN r.status='failed' THEN $1 ELSE NULL END,updated_at=now() FROM ${s}.generation_runs r WHERE j.generation_run_id=r.id AND j.status='running'`, [message]);
    await owner.query('COMMIT');
  } catch (error) { await owner.query('ROLLBACK'); throw error; }
}
try {
  await finishInterrupted();
  console.log('Generation worker ready.');
  while (!stopping) {
    const job = (await owner.query(`UPDATE ${s}.jobs SET status='running',attempt_count=attempt_count+1,updated_at=now() WHERE id=(SELECT id FROM ${s}.jobs WHERE kind='generate' AND generation_run_id IS NOT NULL AND status='queued' AND available_at<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`)).rows[0];
    if (!job) { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
    console.log(`Generation job ${job.id} started.`);
    try {
      if (await cancellationRequested(job.generation_run_id)) {
        await owner.query(`UPDATE ${s}.generation_runs SET status='cancelled',finished_at=now(),updated_at=now() WHERE id=$1`, [job.generation_run_id]);
      } else {
        const result = await executeGeneration(job.book_id, job.generation_run_id);
        if (result.error) await owner.query(`UPDATE ${s}.generation_runs SET status='failed',error_message=$2,finished_at=now() WHERE id=$1 AND status='generating'`, [job.generation_run_id, result.error]);
      }
      // Validation errors before execution must not leave a permanently running job.
      await owner.query(`UPDATE ${s}.generation_runs SET status='failed',error_message='Generation could not start. Check the chapter plan and configured limits.',finished_at=now() WHERE id=$1 AND status='generating'`, [job.generation_run_id]);
      await owner.query(`UPDATE ${s}.jobs j SET status=r.status,last_error=r.error_message,updated_at=now() FROM ${s}.generation_runs r WHERE j.id=$1 AND r.id=j.generation_run_id`, [job.id]);
      console.log(`Generation job ${job.id} finished.`);
    } catch {
      console.error(`Generation job ${job.id} interrupted; restarting for recovery.`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await owner.query('SELECT pg_advisory_unlock(hashtext($1))', [workerLock]);
  owner.release();
  await pool.end();
}
