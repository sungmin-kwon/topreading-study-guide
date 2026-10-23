"""Synthetic integration checks. Requires a disposable MIGRATION_TEST_DATABASE_URL."""
import hashlib
import importlib.util
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import psycopg
from psycopg import sql

spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('migrate-postgres.py'))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


@unittest.skipUnless(os.environ.get('MIGRATION_TEST_DATABASE_URL'), 'Set MIGRATION_TEST_DATABASE_URL to a disposable PostgreSQL database')
class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.database = self.root / 'source.sqlite'
        self.uploads = self.root / 'uploads'
        self.uploads.mkdir()
        content = b'A synthetic chapter.'
        (self.uploads / 'source.txt').write_bytes(content)
        self.ids = {key: str(uuid4()) for key in migration.TABLES}
        self.schema = 'topreading_test_' + uuid4().hex
        self.dsn = os.environ['MIGRATION_TEST_DATABASE_URL']
        self.env = patch.dict(os.environ, MIGRATION_DATABASE_URL=self.dsn)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.drop_target)
        stamp = '2026-10-23T11:37:08.123Z'
        values = {
            'users': dict(email='reader@example.invalid', role='admin'),
            'books': dict(title='Synthetic book', active_generation_run_id=self.ids['generation_runs']),
            'source_files': dict(book_id=self.ids['books'], original_filename='source.txt', stored_path='source.txt', mime_type='text/plain', byte_size=len(content), sha256=hashlib.sha256(content).hexdigest()),
            'parsed_documents': dict(source_file_id=self.ids['source_files'], parser_name='fixture', parser_version='1', text_content=content.decode(), page_count=1, word_count=3, metadata_json='{"language":"한국어"}'),
            'parsed_pages': dict(parsed_document_id=self.ids['parsed_documents'], page_number=1, text_content=content.decode(), word_count=3),
            'chapters': dict(book_id=self.ids['books'], parsed_document_id=self.ids['parsed_documents'], chapter_number=1, title='Opening', text_content=content.decode(), word_count=3, sort_order=0),
            'generation_runs': dict(book_id=self.ids['books'], status='completed', started_at=stamp, finished_at=stamp),
            'study_sets': dict(book_id=self.ids['books'], generation_run_id=self.ids['generation_runs'], title='Guide', raw_output_json='{"items": [1, 2]}'),
            'vocabulary_items': dict(term='synthetic', definition='Made for a test.'),
            'multiple_choice_questions': dict(question_text='What kind of chapter?', choices_json='["Synthetic", "Real"]', correct_choice_index=0),
            'short_answer_questions': dict(question_text='Describe it.', suggested_answer='Synthetic.'),
            'chapter_summaries': dict(summary_text='A test chapter.'),
        }
        with sqlite3.connect(self.database) as db:
            db.executescript((migration.ROOT / 'database/fixtures/legacy-schema.sql').read_text())
            for table in migration.TABLES:
                row = dict(id=self.ids[table], **values[table])
                if table in migration.ITEM_TABLES:
                    row.update(study_set_id=self.ids['study_sets'], chapter_id=self.ids['chapters'], sort_order=0)
                columns = {r[1] for r in db.execute(f'PRAGMA table_info({table})')}
                for name in ('created_at', 'updated_at'):
                    if name in columns: row[name] = stamp
                db.execute(f'INSERT INTO {table} ({",".join(row)}) VALUES ({",".join("?" for _ in row)})', tuple(row.values()))

    def drop_target(self):
        with psycopg.connect(self.dsn) as db:
            db.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(self.schema)))

    def run_migration(self, apply=True):
        return migration.migrate(self.database, self.uploads, self.schema, migration.DEFAULT_LIBRARY, 'Test library', apply)

    def target_exists(self):
        with psycopg.connect(self.dsn) as db:
            return bool(db.execute('SELECT 1 FROM pg_namespace WHERE nspname=%s', (self.schema,)).fetchone())

    def test_dry_run_and_repeat_preserve_source_and_target(self):
        before = hashlib.sha256(self.database.read_bytes()).hexdigest()
        self.assertEqual(self.run_migration(False)['mode'], 'dry_run')
        self.assertFalse(self.target_exists())
        first = self.run_migration()
        self.assertEqual(first['mode'], 'applied')
        self.assertEqual(first['chapter_revisions'], 1)
        second = self.run_migration()
        self.assertEqual(second['mode'], 'verified_existing')
        self.assertEqual(first['tables'], second['tables'])
        self.assertEqual(before, hashlib.sha256(self.database.read_bytes()).hexdigest())

    def test_invalid_answer_rolls_back_entire_schema(self):
        with sqlite3.connect(self.database) as db:
            db.execute('UPDATE multiple_choice_questions SET correct_choice_index=9')
        with self.assertRaises(psycopg.errors.CheckViolation): self.run_migration()
        self.assertFalse(self.target_exists())

    def test_changed_source_refused(self):
        self.run_migration()
        with sqlite3.connect(self.database) as db: db.execute("UPDATE books SET title='Changed source'")
        with self.assertRaisesRegex(migration.MigrationError, 'different migration or snapshot'): self.run_migration()

    def test_edited_target_refused_without_overwrite(self):
        self.run_migration()
        with psycopg.connect(self.dsn) as db:
            db.execute(sql.SQL("UPDATE {}.books SET title='Edited target'").format(sql.Identifier(self.schema)))
        with self.assertRaisesRegex(migration.MigrationError, 'reconciliation failed for books'): self.run_migration()
        with psycopg.connect(self.dsn) as db:
            self.assertEqual(db.execute(sql.SQL('SELECT title FROM {}.books').format(sql.Identifier(self.schema))).fetchone()[0], 'Edited target')

    def test_unrelated_schema_refused(self):
        with psycopg.connect(self.dsn) as db: db.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(self.schema)))
        with self.assertRaisesRegex(migration.MigrationError, 'without migration history'): self.run_migration()

    def test_revision_cannot_be_updated(self):
        self.run_migration()
        with self.assertRaises(psycopg.errors.RaiseException):
            with psycopg.connect(self.dsn) as db:
                db.execute(sql.SQL("UPDATE {}.chapter_revisions SET text_content='changed'").format(sql.Identifier(self.schema)))

    def test_cross_book_item_rolls_back(self):
        with sqlite3.connect(self.database) as db:
            other = str(uuid4())
            db.execute('INSERT INTO books(id,title,created_at,updated_at) SELECT ?,title,created_at,updated_at FROM books', (other,))
            db.execute('UPDATE chapters SET book_id=?', (other,))
        with self.assertRaises(psycopg.errors.ForeignKeyViolation): self.run_migration()
        self.assertFalse(self.target_exists())


if __name__ == '__main__':
    unittest.main()
