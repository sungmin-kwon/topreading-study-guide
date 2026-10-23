import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const repoRoot = path.resolve(import.meta.dirname, "..");

function parseEnvFile(content) {
  const values = {};

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, "");
  });

  return values;
}

async function loadLocalEnv() {
  const envPath = path.join(repoRoot, ".env.local");
  try {
    return parseEnvFile(await fs.readFile(envPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function stripFilePrefix(value) {
  return value.startsWith("file:") ? value.slice("file:".length) : value;
}

function resolveFromRepo(value) {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(repoRoot, value);
}

function timestampForPath(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .replace("Z", "");
}

async function copyDirectoryIfPresent(source, destination) {
  try {
    await fs.access(source);
  } catch {
    return false;
  }

  await fs.cp(source, destination, {
    recursive: true,
    force: true,
    filter: (sourcePath) => path.basename(sourcePath) !== ".gitkeep"
  });
  return true;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const env = {
    ...await loadLocalEnv(),
    ...process.env
  };

  if (/^postgres(ql)?:\/\//.test(env.DATABASE_URL || "")) {
    throw new Error("This command backs up legacy SQLite only. Use pg_dump plus the upload directory for PostgreSQL; see docs/postgres-auth-staging.md.");
  }
  const databasePath = resolveFromRepo(stripFilePrefix(env.DATABASE_URL || "file:./data/dev.db"));
  const uploadDir = resolveFromRepo(env.UPLOAD_DIR || "./data/uploads");
  const exportDir = resolveFromRepo(env.EXPORT_DIR || "./data/exports");
  const backupRoot = resolveFromRepo(env.BACKUP_DIR || "./backups");
  const backupName = `topreading-backup-${timestampForPath()}`;
  const backupDir = path.join(backupRoot, backupName);
  const includeExports = args.has("--include-exports");

  await fs.mkdir(backupDir, { recursive: true });

  try {
    await fs.access(databasePath);
  } catch {
    throw new Error(`SQLite database was not found: ${databasePath}`);
  }

  const backupDatabasePath = path.join(backupDir, "topreading.sqlite");
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await sqlite.backup(backupDatabasePath);
  } finally {
    sqlite.close();
  }

  const uploadsCopied = await copyDirectoryIfPresent(uploadDir, path.join(backupDir, "uploads"));
  const exportsCopied = includeExports
    ? await copyDirectoryIfPresent(exportDir, path.join(backupDir, "exports"))
    : false;

  const manifest = {
    createdAt: new Date().toISOString(),
    backupName,
    database: {
      sourcePath: databasePath,
      backupPath: "topreading.sqlite"
    },
    uploads: {
      sourcePath: uploadDir,
      copied: uploadsCopied,
      backupPath: uploadsCopied ? "uploads" : null
    },
    exports: {
      sourcePath: exportDir,
      copied: exportsCopied,
      backupPath: exportsCopied ? "exports" : null,
      note: includeExports ? null : "Exports were not included. Re-run with --include-exports to copy generated files."
    }
  };

  await fs.writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Backup created: ${backupDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
