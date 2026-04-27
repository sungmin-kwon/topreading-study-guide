import path from "node:path";

function stripFilePrefix(value: string) {
  return value.startsWith("file:") ? value.slice("file:".length) : value;
}

export function getDatabasePath() {
  const configuredUrl = process.env.DATABASE_URL || "file:./data/dev.db";
  const configuredPath = stripFilePrefix(configuredUrl);

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  const repoRoot = path.resolve(process.cwd(), "../..");
  return path.resolve(repoRoot, configuredPath);
}

export function getUploadDir() {
  const configuredPath = process.env.UPLOAD_DIR || "./data/uploads";

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  const repoRoot = path.resolve(process.cwd(), "../..");
  return path.resolve(repoRoot, configuredPath);
}

export function getExportDir() {
  const configuredPath = process.env.EXPORT_DIR || "./data/exports";

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  const repoRoot = path.resolve(process.cwd(), "../..");
  return path.resolve(repoRoot, configuredPath);
}
