-- Existing jobs are reserved for durable work; preserve their original constraints.
ALTER TABLE jobs ADD COLUMN generation_run_id uuid REFERENCES generation_runs(id) ON DELETE CASCADE;
ALTER TABLE jobs ADD COLUMN cancel_requested boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX jobs_generation_run_idx ON jobs(generation_run_id) WHERE generation_run_id IS NOT NULL;
CREATE UNIQUE INDEX jobs_generation_book_active_idx ON jobs(book_id)
  WHERE kind = 'generate' AND status IN ('queued', 'running');
