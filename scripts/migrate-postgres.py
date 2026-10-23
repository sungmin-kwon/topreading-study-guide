"""Rehearse a verified SQLite snapshot into a NEW PostgreSQL schema.

Default is a read-only dry run. --apply needs MIGRATION_DATABASE_URL. A repeated
import of the exact snapshot verifies existing data; it never overwrites it.
Original files remain local until the separate object-storage migration.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
from uuid import UUID, uuid5, NAMESPACE_URL

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parent.parent
DDL = ROOT / "database/migrations/0001_postgres.sql"
TABLES = ["users", "books", "source_files", "parsed_documents", "parsed_pages",
          "chapters", "generation_runs", "study_sets", "vocabulary_items",
          "multiple_choice_questions", "short_answer_questions", "chapter_summaries"]
ITEM_TABLES = set(TABLES[8:])
VERSION = "0001_postgres"
DEFAULT_LIBRARY = uuid5(NAMESPACE_URL, "topreading:initial-shared-library")


class MigrationError(Exception):
    pass


def canonical(value):
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, dict):
        return {key: canonical(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [canonical(item) for item in value]
    return value


def fingerprint(rows):
    digest = hashlib.sha256()
    count = 0
    for row in rows:
        digest.update(json.dumps(canonical(row), sort_keys=True, ensure_ascii=True,
                                 separators=(",", ":"), allow_nan=False).encode() + b"\n")
        count += 1
    return {"rows": count, "sha256": digest.hexdigest()}


def transform(column, value):
    if value is None:
        return None
    if column == "id" or column.endswith("_id"):
        return UUID(value)
    if column.endswith("_at"):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise MigrationError("A legacy timestamp lacks a timezone; resolve before migration.")
        return parsed
    if column.endswith("_json"):
        return json.loads(value)
    return value


def source_data(source):
    result = {}
    for table in TABLES:
        columns = [r[1] for r in source.execute(f'PRAGMA table_info("{table}")')]
        rows = source.execute(f'SELECT * FROM "{table}" ORDER BY id').fetchall()
        result[table] = (columns, [tuple(transform(c, v) for c, v in zip(columns, row)) for row in rows])
    return result


def revision_id(chapter_id):
    return uuid5(chapter_id, "legacy-snapshot-revision-1")


def reconcile(target, data, library_id, library_name):
    result = {}
    for table, (columns, source_rows) in data.items():
        query = sql.SQL("SELECT {} FROM {} ORDER BY id").format(
            sql.SQL(", ").join(map(sql.Identifier, columns)), sql.Identifier(table))
        actual = fingerprint(target.execute(query).fetchall())
        expected = fingerprint(source_rows)
        if actual != expected:
            raise MigrationError(f"Content reconciliation failed for {table}.")
        result[table] = actual
    if target.execute("SELECT id, name FROM libraries").fetchall() != [(library_id, library_name)]:
        raise MigrationError("Library reconciliation failed.")
    users = [dict(zip(data['users'][0], row)) for row in data['users'][1]]
    expected_members = sorted([(library_id, u['id'], u['role']) for u in users], key=lambda row: str(row[1]))
    if target.execute("SELECT library_id,user_id,role FROM library_memberships ORDER BY user_id").fetchall() != expected_members:
        raise MigrationError("Membership reconciliation failed.")
    if target.execute("SELECT count(*) FROM books WHERE library_id <> %s", (library_id,)).fetchone()[0]:
        raise MigrationError("Book ownership reconciliation failed.")
    chapters = [dict(zip(data['chapters'][0], row)) for row in data['chapters'][1]]
    expected_revisions = sorted([
        (revision_id(c['id']), c['id'], 1, c['title'], c['text_content'], c['word_count'],
         hashlib.sha256(c['text_content'].encode()).hexdigest(), 'legacy_snapshot') for c in chapters
    ], key=lambda row: str(row[0]))
    revisions = target.execute("SELECT id,chapter_id,revision_number,title,text_content,word_count,content_sha256,origin FROM chapter_revisions ORDER BY id").fetchall()
    if revisions != expected_revisions:
        raise MigrationError("Chapter revision reconciliation failed.")
    for c in chapters:
        if target.execute("SELECT current_revision_id FROM chapters WHERE id=%s", (c['id'],)).fetchone()[0] != revision_id(c['id']):
            raise MigrationError("Current chapter revision reconciliation failed.")
    for table in ITEM_TABLES:
        if target.execute(sql.SQL("SELECT count(*) FROM {} WHERE chapter_revision_id IS NOT NULL").format(sql.Identifier(table))).fetchone()[0]:
            raise MigrationError("Legacy generation provenance must remain unknown.")
    if target.execute("SELECT count(*) FROM source_files WHERE storage_backend <> 'local' OR object_key IS NOT NULL").fetchone()[0]:
        raise MigrationError("Source storage mapping differs from the local migration.")
    if target.execute("SELECT count(*) FROM jobs").fetchone()[0]:
        raise MigrationError("A baseline target must not contain queued jobs.")
    return result


def migrate(database, uploads, schema, library_id, library_name, apply=False):
    if not re.fullmatch(r"topreading_[a-z0-9_]{1,48}", schema):
        raise MigrationError("Use a schema name beginning topreading_ followed by lowercase letters, digits, or underscores.")
    if not library_name.strip():
        raise MigrationError("A library name is required.")
    spec = importlib.util.spec_from_file_location("baseline", ROOT / "scripts/verify-baseline.py")
    baseline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(baseline)
    verification = baseline.verify(database, uploads)
    if not verification["ok"] or verification["warnings"]:
        raise MigrationError("Baseline has issues or warnings. Resolve them before importing; the source was not changed.")
    if set(verification['tables']) != set(TABLES):
        raise MigrationError("Unexpected legacy tables need an explicit mapping before migration.")
    source = sqlite3.connect(Path(database).resolve().as_uri() + "?mode=ro", uri=True)
    try:
        source.execute("PRAGMA query_only=ON")
        source.execute("BEGIN")
        data = source_data(source)
    finally:
        source.close()
    fingerprints = {table: fingerprint(rows) for table, (_, rows) in data.items()}
    source_fingerprint = hashlib.sha256(json.dumps({
        'tables': fingerprints, 'sources': verification['source_files'],
        'schema': verification['schema_sha256'],
    }, sort_keys=True).encode()).hexdigest()
    ddl = DDL.read_text()
    ddl_hash = hashlib.sha256(ddl.encode()).hexdigest()
    report = {"mode": "dry_run", "target_schema": schema,
              "source_fingerprint": source_fingerprint, "tables": fingerprints,
              "chapter_revisions": len(data['chapters'][1]), "memberships": len(data['users'][1]),
              "file_storage": "local; no object upload performed", "generation_provenance": "unknown for legacy items"}
    if not apply:
        return report
    dsn = os.environ.get("MIGRATION_DATABASE_URL")
    if not dsn:
        raise MigrationError("Set MIGRATION_DATABASE_URL for the isolated target; DATABASE_URL is deliberately not used.")
    with psycopg.connect(dsn, connect_timeout=10) as target:
        target.execute("SET LOCAL lock_timeout='10s'")
        target.execute("SELECT pg_advisory_xact_lock(917422001)")
        exists = target.execute("SELECT 1 FROM pg_namespace WHERE nspname=%s", (schema,)).fetchone()
        if not exists:
            target.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        target.execute(sql.SQL("SET LOCAL search_path TO {}, pg_catalog").format(sql.Identifier(schema)))
        target.execute("SET LOCAL timezone='UTC'")
        if exists:
            if not target.execute("SELECT 1 FROM information_schema.tables WHERE table_schema=%s AND table_name='migration_history'", (schema,)).fetchone():
                raise MigrationError("Target schema already exists without migration history; use a new schema.")
            recorded = target.execute("SELECT migration_sha256,source_fingerprint,library_id FROM migration_history WHERE version=%s", (VERSION,)).fetchone()
            if recorded != (ddl_hash, source_fingerprint, library_id):
                raise MigrationError("Target belongs to a different migration or snapshot; use a new schema.")
            report['tables'] = reconcile(target, data, library_id, library_name)
            report['mode'] = 'verified_existing'
            return report
        target.execute(ddl)
        target.execute("INSERT INTO libraries(id,name) VALUES (%s,%s)", (library_id, library_name))
        set_books = {dict(zip(data['study_sets'][0], row))['id']: dict(zip(data['study_sets'][0], row))['book_id'] for row in data['study_sets'][1]}
        for table, (original_columns, rows) in data.items():
            columns = original_columns + (['library_id'] if table == 'books' else ['book_id'] if table in ITEM_TABLES else [])
            query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, columns)),
                sql.SQL(',').join(sql.Placeholder() for _ in columns))
            values = []
            for row in rows:
                record = dict(zip(original_columns, row))
                converted = [Jsonb(v) if col.endswith('_json') and v is not None else v for col, v in zip(original_columns, row)]
                if table == 'books': converted.append(library_id)
                if table in ITEM_TABLES: converted.append(set_books[record['study_set_id']])
                values.append(converted)
            with target.cursor() as cursor:
                cursor.executemany(query, values)
        target.execute("INSERT INTO library_memberships(library_id,user_id,role) SELECT %s,id,role FROM users", (library_id,))
        for row in data['chapters'][1]:
            c = dict(zip(data['chapters'][0], row))
            revision = revision_id(c['id'])
            target.execute("INSERT INTO chapter_revisions(id,chapter_id,revision_number,title,text_content,word_count,content_sha256,origin) VALUES (%s,%s,1,%s,%s,%s,%s,'legacy_snapshot')",
                           (revision,c['id'],c['title'],c['text_content'],c['word_count'],hashlib.sha256(c['text_content'].encode()).hexdigest()))
            target.execute("UPDATE chapters SET current_revision_id=%s WHERE id=%s", (revision,c['id']))
        target.execute("SET CONSTRAINTS ALL IMMEDIATE")
        report['tables'] = reconcile(target, data, library_id, library_name)
        target.execute("INSERT INTO migration_history(version,migration_sha256,source_fingerprint,library_id,reconciliation) VALUES (%s,%s,%s,%s,%s)",
                       (VERSION,ddl_hash,source_fingerprint,library_id,Jsonb(report['tables'])))
        report['mode'] = 'applied'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--uploads', required=True, type=Path)
    parser.add_argument('--schema', default='topreading_rehearsal')
    parser.add_argument('--library-id', type=UUID, default=DEFAULT_LIBRARY)
    parser.add_argument('--library-name', default='Shared library')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        report = migrate(args.database,args.uploads,args.schema,args.library_id,args.library_name,args.apply)
    except MigrationError as error:
        print(str(error),file=sys.stderr)
        return 1
    except (psycopg.Error, sqlite3.Error, OSError, ValueError, KeyError) as error:
        # Driver details may include credentials or private row values.
        print(f'Migration failed ({type(error).__name__}); target transaction was not committed. Source was not modified.',file=sys.stderr)
        return 1
    print(json.dumps(report,indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
