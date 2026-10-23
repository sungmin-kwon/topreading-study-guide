"""Recovery checks use synthetic data only; no production access or API calls."""

import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("verify-baseline.py")
spec = importlib.util.spec_from_file_location("verify_baseline", SCRIPT)
baseline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline)


class BaselineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.database = self.root / "test.sqlite"
        self.uploads = self.root / "uploads"
        self.uploads.mkdir()
        self.source = self.uploads / "source.txt"
        self.source.write_text("Chapter One\nA small synthetic book.\n", encoding="utf-8")
        with sqlite3.connect(self.database) as db:
            db.executescript('''
                CREATE TABLE books (id TEXT PRIMARY KEY, active_generation_run_id TEXT);
                CREATE TABLE generation_runs (id TEXT PRIMARY KEY, book_id TEXT REFERENCES books(id), status TEXT);
                CREATE TABLE source_files (id TEXT PRIMARY KEY, stored_path TEXT, byte_size INTEGER, sha256 TEXT);
                INSERT INTO books VALUES ('book-1', 'run-1');
                INSERT INTO generation_runs VALUES ('run-1', 'book-1', 'completed');
            ''')
            for name in baseline.REQUIRED_TABLES - {"books", "generation_runs", "source_files"}:
                db.execute(f'CREATE TABLE "{name}" (id TEXT PRIMARY KEY, payload TEXT)')
            db.execute("INSERT INTO source_files VALUES (?, ?, ?, ?)",
                       ("source-1", "source.txt", self.source.stat().st_size, baseline.digest_file(self.source)))

    def run_check(self):
        return baseline.verify(self.database, self.uploads)

    def codes(self):
        return {issue["code"] for issue in self.run_check()["issues"]}

    def test_backup_restore_matches_without_changing_original(self):
        before = baseline.digest_file(self.database)
        original = self.run_check()
        self.assertTrue(original["ok"])
        self.assertEqual(before, baseline.digest_file(self.database))
        restored = self.root / "restored.sqlite"
        with sqlite3.connect(self.database) as source, sqlite3.connect(restored) as target:
            source.backup(target)
        self.assertEqual(original, baseline.verify(restored, self.uploads))

    def test_changed_content_detected_even_with_same_row_count(self):
        before = self.run_check()["tables"]
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE generation_runs SET status = 'cancelled'")
        after = self.run_check()["tables"]
        self.assertEqual(before["generation_runs"]["rows"], after["generation_runs"]["rows"])
        self.assertNotEqual(before["generation_runs"]["content_sha256"], after["generation_runs"]["content_sha256"])

    def test_changed_source_detected_even_at_same_length(self):
        self.source.write_bytes(b"X" * self.source.stat().st_size)
        self.assertIn("source_checksum_mismatch", self.codes())

    def test_missing_source(self):
        self.source.unlink()
        self.assertIn("missing_source_file", self.codes())

    def test_path_escape(self):
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE source_files SET stored_path = '../outside.txt'")
        self.assertIn("unsafe_source_path", self.codes())

    def test_symlink_escape(self):
        self.source.unlink()
        outside = self.root / "outside.txt"
        outside.write_text("private")
        self.source.symlink_to(outside)
        self.assertIn("unsafe_source_path", self.codes())

    def test_invalid_active_run_and_foreign_key(self):
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE generation_runs SET book_id = 'missing'")
        self.assertIn("foreign_key_violation", self.codes())
        self.assertIn("invalid_active_generation_run", self.codes())

    def test_unfinished_job_blocks_clean_baseline(self):
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE generation_runs SET status = 'generating'")
        self.assertIn("unfinished_generation_runs", self.codes())

    def test_missing_database_not_created(self):
        missing = self.root / "missing.sqlite"
        with self.assertRaises(FileNotFoundError):
            baseline.verify(missing, self.uploads)
        self.assertFalse(missing.exists())

    def test_cli_does_not_overwrite_report(self):
        report = self.root / "report.json"
        report.write_text("preserve me")
        result = subprocess.run([sys.executable, str(SCRIPT), "--database", str(self.database),
                                 "--uploads", str(self.uploads), "--report", str(report)], capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(report.read_text(), "preserve me")


if __name__ == "__main__":
    unittest.main()
