import { build } from 'esbuild';
await build({entryPoints:['apps/web/src/worker/generation.ts'],outfile:'dist/generation-worker.mjs',bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',tsconfig:'apps/web/tsconfig.json',alias:{'@topreading/core':'./packages/core/src/index.ts'}});
