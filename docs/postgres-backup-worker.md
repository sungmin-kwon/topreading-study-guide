# PostgreSQL backups and generation worker

Implemented on `modernization/postgres-auth`, 2026-10-26. Local tests passed;
Ubuntu deployment and a real browser generation remain operator acceptance steps.
The production SQLite service and its Cloudflare routing are unchanged.

## What changes

- `POST .../generation-runs/:id/execute` authorizes the user/book, persists a job,
  and returns HTTP 202. Repeated submission of the same run cannot duplicate it.
- One separate Node worker consumes PostgreSQL jobs. A database session lock
  permits one worker per schema; a unique index permits one active job per book.
- The existing progress panel/processing log reads persisted run state. Closing
  the browser or restarting only the web service does not stop generation.
- Each completed chapter's items, source revision reference, raw output, usage
  and progress are saved in a transaction. Existing versions are not overwritten.
- Cancellation is a persisted request. Queued work is skipped; an active chapter
  finishes before cancellation takes effect. Membership and disabled-account
  status are rechecked before work and between chapters.
- The worker starts automatically under systemd, separately from the web app.
  It drains its current run on SIGTERM; systemd allows up to 15 minutes before
  terminating it. Wait for generation to finish before maintenance.
- On a worker crash, queued jobs remain queued. An interrupted running job becomes
  failed on worker restart; completed chapters remain available. **The worker
  does not automatically resume or replay an interrupted paid request.** A lost
  response can still incur a charge. Create a new version deliberately to retry.
  The main model request has a ten-minute timeout and no automatic POST retries;
  MCQ quality calls retain their bounded budgets and one-minute timeouts.
- The old direct chapter-generation endpoint now returns HTTP 410 after its
  authorization checks. Use Generate a guide, including for a single chapter.
  Extraction and export still run through the web app; they are future work.
- Clients can rename runs but cannot forge worker status, progress or logs.

## First deployment on Ubuntu

Finish/cancel any active generation first. No new environment variables or Google
credentials are needed. Commands apply only to the separate staging checkout.

First fetch the new helper and take a pre-migration backup:

```bash
cd /home/sungmin-kwon/topreading-staging
git pull --ff-only
python3 scripts/postgres-backup.py
```

The helper briefly stops staging services and restores their previous running
state. It refuses a known active job. Copy the reported absolute backup folder
into this command:

```bash
python3 scripts/postgres-backup.py --verify /absolute/path/to/reported/backup-folder
```

Expect `RESTORE CHECK PASSED`. Then install the release:

```bash
(
  set -e
  cd /home/sungmin-kwon/topreading-staging
  test "$(git branch --show-current)" = modernization/postgres-auth
  # This condition also works before the worker has been installed.
  if systemctl is-active --quiet topreading-staging-worker.service; then
    sudo systemctl stop topreading-staging-worker.service
  fi
  sudo systemctl stop topreading-staging.service
  npm ci
  python3 scripts/migrate-ubuntu-staging.py
  NODE_OPTIONS=--max-old-space-size=3072 nice -n 10 npm run build
  python3 scripts/start-generation-worker.py
  sudo systemctl start topreading-staging.service
  systemctl is-active topreading-staging.service topreading-staging-worker.service
  python3 scripts/check-staging-google-access.py
  python3 scripts/check-staging-google-access.py --public
)
```

If migration/build fails, diagnose it while staging remains stopped; production
is not stopped. Do not rebuild or replace dependencies underneath a running
worker. `npm run build` now builds both Next.js and `dist/generation-worker.mjs`.
The worker uses the same private `.env.local`, restricted database role, API key,
and Admin generation settings. Keep the worker stopped during schema migrations.

## Acceptance checks

```bash
systemctl show topreading-staging-worker.service \
  --property=ActiveState --property=UnitFileState
journalctl -u topreading-staging-worker.service --since '10 minutes ago' --no-pager
```

Expect active/enabled and `Generation worker ready.` The journal contains job IDs
and lifecycle messages; chapter progress stays in the application's database.

Using an invited account, generate a small guide (normal model charges apply):

1. Confirm the request returns promptly and progress appears.
2. Close/reopen the browser; progress should resume from the database.
3. While the worker runs, restart **only** `topreading-staging.service`. The worker
   should keep running and finish the guide. Do not restart Docker, the database,
   tunnel or worker for this test.
4. Verify generated items, editing and an export. Separately test cancellation.
5. After the queue is idle, take/verify a fresh backup and copy it off the PC.

## Backup contents and guarantees

`python3 scripts/postgres-backup.py` creates a private `backups/postgres-*` folder:

- `database.dump`: PostgreSQL custom-format logical dump, without ownership/ACLs.
- `uploads/` and `exports/`: matching files captured while staging writers stop.
- `private-recovery/env.local` and `private-recovery/state.json`: **credentials**.
- `manifest.json`: timestamp, checked-out source commit (not an independent
  running-build attestation), every table count, source verification count and
  SHA-256 hashes of all other files, including private recovery files.

An interrupted backup without a manifest is incomplete. Source paths, sizes and
checksums are checked against database references. Symlinks are refused. The
helper validates the checkout, database address and container instance label.
Only staging services that were active on entry are restarted, including after
an error. A backup briefly makes staging unavailable. The production web service,
Cloudflare tunnel and nginx proxy manager remain running.

`--verify` verifies hashes, restores into a uniquely named disposable PostgreSQL
17 container with **no published ports and no network**, reconciles all table
counts and source files, and recreates/checks restricted application-role grants.
The temporary container and its anonymous volume are removed afterward, including
on ordinary failure. A host crash/SIGKILL may require removal of the specific
`topreading-restore-check-*` container left by that attempt. Never remove the
staging database volume. Restored jobs are not executed and no OAuth/API requests
are made. The verifier is not a live restore command and does not redirect the app.

This proves database/file restoration, not a complete VPS or browser rehearsal.
Before disaster recovery or cutover: provision an isolated database, restore the
dump, recreate owner/runtime credentials and grants, restore files to intended
paths, configure the correct origin/OAuth callback, invalidate old sessions as
appropriate, reconcile data, and test the app before switching traffic. Do not
start a worker blindly on a restored queue: review outstanding jobs first to
avoid replaying work already completed since the backup.

Backups are currently **manual**. There is no scheduled timer, automatic pruning,
encryption-at-rest feature or off-server upload in this helper. Copy verified
backups to protected off-server storage; do not attach the backup or private files
to chat, commit them to Git, or share a public download link. Use encrypted storage
for the off-server copy. Keep the existing SQLite baseline separately. Establish
backup frequency/retention and monitor successful restores before VPS cutover.

## Troubleshooting

- Stuck at queued: check worker active/enabled and its journal; the web service
  intentionally does not execute a fallback paid request.
- Worker reports another owner: another process owns the same schema's advisory
  lock. Stop the unintended worker, not the database. Do not run `npm run worker`
  alongside the systemd worker for the same schema.
- Failed after interruption: review partial results. Retry deliberately in a new
  version; unknown usage from a lost provider response may not be in saved totals.
- Missing `generation_run_id`/`cancel_requested`: apply migrations before starting
  the new web/worker release.
- Backup says a job is running: wait for completion/cancellation. Do not force a
  backup by editing job status or killing a paid model request.
- Restore check fails: keep the backup for diagnosis, but do not call it verified.
  The live database was not replaced. Correct the cause and make a new backup.

## Local validation evidence

- Production build and TypeScript checks passed.
- Worker tests use a real disposable PostgreSQL schema and a build-time fake
  model provider. They cover duplicate delivery, per-book exclusion, singleton
  ownership, persisted results, cancellation, crash recovery, no automatic replay,
  revoked access, HTTP authorization and generation surviving web shutdown.
- A backup of the local restored staging corpus was restored into a disposable
  container: 21 tables reconciled, eight source files checked, role grants checked.
  systemd stop/start behavior was simulated locally; Ubuntu service acceptance is
  still required. Offline tests cover corruption, symlinks, unsafe paths and the
  production-checkout guard. No paid model requests were used in local testing.
