import fs from "node:fs/promises";
import path from "node:path";

export type AdminSettingDefinition = {
  key: string;
  label: string;
  description: string;
  kind: "text" | "number" | "secret";
  value: string;
  placeholder?: string;
  isSet?: boolean;
};

const settingDefinitions: Array<Omit<AdminSettingDefinition, "value" | "isSet">> = [
  {
    key: "APP_ADMIN_EMAILS",
    label: "Admin emails",
    description: "Comma-separated emails that always have admin access.",
    kind: "text",
    placeholder: "admin@example.com"
  },
  {
    key: "AUTH_ALLOWED_EMAILS",
    label: "Allowed login emails",
    description: "Comma-separated Cloudflare Access emails allowed into the app.",
    kind: "text",
    placeholder: "teacher@example.com,parent@example.com"
  },
  {
    key: "OPENAI_MODEL",
    label: "OpenAI model",
    description: "Default model used for study guide generation.",
    kind: "text",
    placeholder: "gpt-5-mini"
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API key",
    description: "Leave blank to keep the current secret unchanged.",
    kind: "secret",
    placeholder: "sk-..."
  },
  {
    key: "MAX_GENERATION_CHAPTERS",
    label: "Max chapters per run",
    description: "Safety limit for a single generation run.",
    kind: "number",
    placeholder: "80"
  },
  {
    key: "MAX_GENERATION_ITEMS",
    label: "Max generated items per run",
    description: "Safety limit across vocabulary, MCQ, and short answer items.",
    kind: "number",
    placeholder: "2500"
  },
  {
    key: "PYTHON_EXECUTABLE",
    label: "Python executable",
    description: "Python path used for extraction and exports.",
    kind: "text",
    placeholder: "/home/user/topreading-study-guide/.topreading/bin/python"
  },
  {
    key: "UPLOAD_DIR",
    label: "Upload directory",
    description: "Durable folder for uploaded ebooks.",
    kind: "text",
    placeholder: "./data/uploads"
  },
  {
    key: "EXPORT_DIR",
    label: "Export directory",
    description: "Folder for generated PDF and Word files.",
    kind: "text",
    placeholder: "./data/exports"
  },
  {
    key: "BACKUP_DIR",
    label: "Backup directory",
    description: "Folder for SQLite backup snapshots.",
    kind: "text",
    placeholder: "./backups"
  }
];

function getRepoRoot() {
  return path.resolve(process.cwd(), "../..");
}

function getEnvPath() {
  return path.join(getRepoRoot(), ".env.local");
}

function parseEnv(content: string) {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    values[key] = trimmed.slice(separatorIndex + 1).trim();
  }

  return values;
}

async function readEnvFile() {
  return fs.readFile(getEnvPath(), "utf8").catch(() => "");
}

function serializeValue(value: string) {
  return value.includes("\n") ? value.replace(/\r?\n/g, " ") : value;
}

export async function listAdminSettings(): Promise<AdminSettingDefinition[]> {
  const content = await readEnvFile();
  const fileValues = parseEnv(content);

  return settingDefinitions.map((definition) => {
    const actual = process.env[definition.key] || fileValues[definition.key] || "";
    if (definition.kind === "secret") {
      return {
        ...definition,
        value: "",
        isSet: Boolean(actual)
      };
    }

    return {
      ...definition,
      value: actual,
      isSet: Boolean(actual)
    };
  });
}

export async function updateAdminSettings(input: Record<string, unknown>) {
  const allowedKeys = new Set(settingDefinitions.map((definition) => definition.key));
  const content = await readEnvFile();
  const lines = content ? content.split(/\r?\n/) : [];
  const seenKeys = new Set<string>();
  const nextLines = lines.map((line) => {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      return line;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!allowedKeys.has(key) || input[key] === undefined) {
      return line;
    }

    const value = String(input[key] || "").trim();
    if (!value && settingDefinitions.find((definition) => definition.key === key)?.kind === "secret") {
      return line;
    }

    seenKeys.add(key);
    process.env[key] = value;
    return `${key}=${serializeValue(value)}`;
  });

  for (const definition of settingDefinitions) {
    if (!allowedKeys.has(definition.key) || input[definition.key] === undefined || seenKeys.has(definition.key)) {
      continue;
    }

    const value = String(input[definition.key] || "").trim();
    if (!value && definition.kind === "secret") {
      continue;
    }

    process.env[definition.key] = value;
    nextLines.push(`${definition.key}=${serializeValue(value)}`);
  }

  await fs.mkdir(path.dirname(getEnvPath()), { recursive: true });
  await fs.writeFile(getEnvPath(), nextLines.join("\n").replace(/\n*$/, "\n"), "utf8");
  return listAdminSettings();
}
