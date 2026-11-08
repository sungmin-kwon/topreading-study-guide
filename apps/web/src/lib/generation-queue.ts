import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db/client";
const schema = process.env.DATABASE_SCHEMA || "topreading";
if (!/^[a-z][a-z0-9_]*$/.test(schema) || schema === "public") throw Error("Use a dedicated DATABASE_SCHEMA");
export const queueSchema = `"${schema}"`;
export const workerLock = `topreading-generation-worker:${schema}`;
export class QueueError extends Error { constructor(message: string) { super(message); this.name = "QueueError"; } }

export async function enqueueGeneration(bookId: string, runId: string, userId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const run = (await client.query(`SELECT r.*, b.library_id, b.active_layout_id FROM ${queueSchema}.generation_runs r JOIN ${queueSchema}.books b ON b.id=r.book_id WHERE r.id=$1 AND b.id=$2 FOR UPDATE OF r,b`, [runId, bookId])).rows[0];
    if (!run) throw new QueueError("Generation run not found.");
    const existing = (await client.query(`SELECT id FROM ${queueSchema}.jobs WHERE generation_run_id=$1`, [runId])).rows[0];
    if (existing) { await client.query("COMMIT"); return; } // duplicate HTTP delivery never duplicates work
    if (run.layout_id !== run.active_layout_id) throw new QueueError("The chapter layout changed. Create a new guide version from the current chapters.");
    if (run.status !== "draft") throw new QueueError("Create a new guide version to generate again.");
    if ((await client.query(`SELECT 1 FROM ${queueSchema}.study_sets WHERE generation_run_id=$1 LIMIT 1`, [runId])).rowCount) throw new QueueError("Saved results cannot be overwritten. Create a new version.");
    const chapters = run.config_json?.chapters;
    if (!Array.isArray(chapters) || !chapters.length) throw new QueueError("Select chapters before generating.");
    await client.query(`INSERT INTO ${queueSchema}.jobs(id,library_id,book_id,requested_by,kind,idempotency_key,payload,max_attempts,generation_run_id) VALUES($1,$2,$3,$4,'generate',$5,$6,1,$7)`, [randomUUID(), run.library_id, bookId, userId, `generate:${runId}`, JSON.stringify({runId}), runId]);
    await client.query(`UPDATE ${queueSchema}.generation_runs SET status='generating', progress_json=$2, log_json=$3, updated_at=now() WHERE id=$1`, [runId, JSON.stringify({completedChapters:0,totalChapters:chapters.length,phase:"queued"}), JSON.stringify([{timestamp:new Date().toISOString(),level:"info",message:"Queued for the background worker. You can close this page."}])]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function cancellationRequested(runId: string) {
  const row = (await pool.query(`SELECT j.cancel_requested, u.status AS user_status,
    EXISTS(SELECT 1 FROM ${queueSchema}.library_memberships m WHERE m.library_id=j.library_id AND m.user_id=j.requested_by) AS member
    FROM ${queueSchema}.jobs j LEFT JOIN ${queueSchema}.users u ON u.id=j.requested_by WHERE generation_run_id=$1`, [runId])).rows[0];
  return !row || row.cancel_requested || row.user_status !== 'active' || !row.member;
}

export async function cancelGeneration(runId: string) {
  await pool.query(`UPDATE ${queueSchema}.jobs SET cancel_requested=true, updated_at=now() WHERE generation_run_id=$1 AND status IN ('queued','running')`, [runId]);
}
