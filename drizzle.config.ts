import type { Config } from "drizzle-kit";

export default {
  schema: "./apps/web/src/lib/db/schema.ts",
  out: "./apps/web/src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL || "postgresql://localhost/topreading"
  }
} satisfies Config;

