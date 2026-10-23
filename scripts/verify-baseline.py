"""Read-only SQLite/source verification; run on a quiesced backup, never app startup.

Uses only Python's standard library. Reports fingerprints, counts, and record IDs,
not emails, extracted text, questions, or environment values. Report files remain
private operational artifacts. A successful check is not a full app restore test.
"""

import argparse
import base64
import hashlib
import json
from pathlib import Path, PureWindowsPath
import sqlite3
import sys


REQUIRED_TABLES = {
    "users", "books", "source_files", "parsed_documents", "parsed_pages",
    "chapters", "generation_runs", "study_sets", "vocabulary_items",
    "multiple_choice_questions", "short_answer_questions", "chapter_summaries",
}


def quoted(identifier):
    return '"' + identifier.replace('"', '""') + '"'


def digest_file(file_path):
    digest = hashlib.sha256()
    with file_path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def encode_value(value):
    if isinstance(value, bytes):
        return {"blob_base64": base64.b64encode(value).decode("ascii")}
    return value


def verify(database_path, upload_dir):
    database_path = Path(database_path).resolve(strict=True)
    upload_dir = Path(upload_dir).resolve(strict=True)
    if not database_path.is_file() or not upload_dir.is_dir():
        raise ValueError("Expected an existing database file and uploads directory.")

    report = {
        "format_version": 1,
        "scope": "SQLite contents and referenced source files; not an application restore test",
        "tables": {}, "source_files": [], "issues": [], "warnings": [],
    }
    issues = report["issues"]
    connection = sqlite3.connect(database_path.as_uri() + "?mode=ro", uri=True)
    try:
        connection.execute("PRAGMA query_only = ON")
        connection.execute("BEGIN")
        report["integrity_check"] = [row[0] for row in connection.execute("PRAGMA integrity_check")]
        if report["integrity_check"] != ["ok"]:
            issues.append({"code": "sqlite_integrity_failure"})
        for table, row_id, parent, key in connection.execute("PRAGMA foreign_key_check"):
            issues.append({"code": "foreign_key_violation", "table": table,
                           "row_id": row_id, "parent": parent, "key": key})

        schema = connection.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
        report["schema_sha256"] = hashlib.sha256(json.dumps(schema).encode()).hexdigest()
        table_names = {row[1] for row in schema if row[0] == "table"}
        for name in sorted(REQUIRED_TABLES - table_names):
            issues.append({"code": "missing_table", "table": name})

        for name in sorted(table_names):
            columns = connection.execute(f"PRAGMA table_info({quoted(name)})").fetchall()
            primary = sorted((column for column in columns if column[5]), key=lambda col: col[5])
            order = primary or columns
            order_sql = ", ".join(quoted(column[1]) for column in order)
            digest = hashlib.sha256()
            count = 0
            for row in connection.execute(f"SELECT * FROM {quoted(name)} ORDER BY {order_sql}"):
                digest.update(json.dumps([encode_value(v) for v in row], ensure_ascii=True,
                                         separators=(",", ":")).encode() + b"\n")
                count += 1
            report["tables"][name] = {"rows": count, "content_sha256": digest.hexdigest()}

        referenced_paths = set()
        if "source_files" in table_names:
            for source_id, stored_path, expected_size, expected_hash in connection.execute(
                "SELECT id, stored_path, byte_size, sha256 FROM source_files ORDER BY id"
            ):
                entry = {"id": source_id, "verified": False}
                report["source_files"].append(entry)
                if not isinstance(stored_path, str) or not stored_path:
                    issues.append({"code": "invalid_source_path", "id": source_id})
                    continue
                relative = Path(stored_path.replace("\\", "/"))
                candidate = (upload_dir / relative).resolve()
                if (relative.is_absolute() or PureWindowsPath(stored_path).drive
                        or ".." in relative.parts or not candidate.is_relative_to(upload_dir)):
                    issues.append({"code": "unsafe_source_path", "id": source_id})
                    continue
                referenced_paths.add(candidate)
                if not candidate.is_file():
                    issues.append({"code": "missing_source_file", "id": source_id})
                    continue
                actual_size = candidate.stat().st_size
                actual_hash = digest_file(candidate)
                entry.update({"byte_size": actual_size, "sha256": actual_hash})
                if actual_size != expected_size:
                    issues.append({"code": "source_size_mismatch", "id": source_id})
                if actual_hash != str(expected_hash).lower():
                    issues.append({"code": "source_checksum_mismatch", "id": source_id})
                entry["verified"] = actual_size == expected_size and actual_hash == str(expected_hash).lower()

        # This pointer is not protected by a foreign key in the current schema.
        if {"books", "generation_runs"}.issubset(table_names):
            for (book_id,) in connection.execute(
                "SELECT b.id FROM books b LEFT JOIN generation_runs r "
                "ON r.id = b.active_generation_run_id "
                "WHERE b.active_generation_run_id IS NOT NULL "
                "AND (r.id IS NULL OR r.book_id != b.id) ORDER BY b.id"
            ):
                issues.append({"code": "invalid_active_generation_run", "book_id": book_id})
        if "generation_runs" in table_names:
            running = connection.execute(
                "SELECT count(*) FROM generation_runs WHERE status = 'generating'"
            ).fetchone()[0]
            if running:
                issues.append({"code": "unfinished_generation_runs", "count": running})

        extras = sum(1 for item in upload_dir.rglob("*")
                     if item.is_file() and item.name != ".gitkeep" and item.resolve() not in referenced_paths)
        if extras:
            report["warnings"].append({"code": "unreferenced_uploads", "count": extras})
        if report["tables"].get("books", {}).get("rows") == 0:
            report["warnings"].append({"code": "empty_library",
                                       "message": "Cannot validate real-book recovery with this dataset."})
        report["ok"] = not issues
        return report
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--uploads", required=True, type=Path)
    parser.add_argument("--report", type=Path, help="Create a NEW JSON report; never overwrites a file")
    args = parser.parse_args()
    try:
        report = verify(args.database, args.uploads)
        output = json.dumps(report, indent=2) + "\n"
        if args.report:
            with args.report.open("x", encoding="utf-8") as stream:
                stream.write(output)
        else:
            print(output, end="")
        return 0 if report["ok"] else 1
    except (OSError, ValueError, sqlite3.Error) as error:
        print(f"Baseline verification failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
