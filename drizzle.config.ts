import type { Config } from "drizzle-kit";

export default {
  schema: "./apps/web/src/lib/db/schema.ts",
  out: "./apps/web/src/lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/dev.db"
  }
} satisfies Config;

