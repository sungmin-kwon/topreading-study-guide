import { pool } from "@/lib/db/client";
import { authTable } from "@/lib/auth-sessions";
export type AdminSettingDefinition = { key: string; label: string; description: string; kind: "text" | "number" | "secret"; value: string; placeholder?: string; isSet?: boolean };
const definitions = {
  OPENAI_MODEL: { label: "Generation model", fallback: "gpt-5-mini", max: 0 },
  MAX_GENERATION_CHAPTERS: { label: "Maximum chapters per run", fallback: "80", max: 500 },
  MAX_GENERATION_ITEMS: { label: "Maximum items per run", fallback: "2500", max: 10000 }
};
export async function getRuntimeSetting(key: keyof typeof definitions) {
  const result = await pool.query(`SELECT value FROM ${authTable("app_settings")} WHERE key=$1`, [key]);
  return result.rows[0]?.value || process.env[key] || definitions[key].fallback;
}
export async function listAdminSettings(): Promise<AdminSettingDefinition[]> {
  return Promise.all((Object.keys(definitions) as Array<keyof typeof definitions>).map(async key => ({ key, label: definitions[key].label, description: "Applies to new generation requests.", kind: key === "OPENAI_MODEL" ? "text" : "number", value: await getRuntimeSetting(key) })));
}
export async function updateAdminSettings(input: Record<string, unknown>) {
  const values = Object.entries(input).map(([key, value]) => {
    if (!Object.hasOwn(definitions, key)) throw new Error("Deployment configuration cannot be edited here");
    const text = String(value).trim();
    const definition = definitions[key as keyof typeof definitions];
    if (key === "OPENAI_MODEL" ? !/^[a-zA-Z0-9._:-]{1,100}$/.test(text) : !/^\d+$/.test(text) || Number(text) < 1 || Number(text) > definition.max) throw new Error(`Invalid value for ${key}`);
    return [key, text];
  });
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    for (const [key, value] of values) await connection.query(`INSERT INTO ${authTable("app_settings")}(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`, [key, value]);
    await connection.query("COMMIT");
  } catch (error) { await connection.query("ROLLBACK"); throw error; } finally { connection.release(); }
  return listAdminSettings();
}
