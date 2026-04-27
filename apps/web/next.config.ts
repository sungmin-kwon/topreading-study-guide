import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(configDir, "../.."));

const nextConfig: NextConfig = {
  transpilePackages: ["@topreading/core"]
};

export default nextConfig;
