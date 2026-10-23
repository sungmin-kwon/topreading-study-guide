import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { validateAuthConfiguration } from "./src/lib/auth-identity";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(configDir, "../.."));

const nextConfig: NextConfig = {
  transpilePackages: ["@topreading/core"]
};

export default function config(phase: string) {
  if (phase === PHASE_PRODUCTION_SERVER) {
    validateAuthConfiguration();
    if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || "")) throw new Error("PostgreSQL DATABASE_URL is required");
  }
  return nextConfig;
}
