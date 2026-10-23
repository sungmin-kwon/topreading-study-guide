import path from "node:path";

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
