import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
let live = false;
let limit = 24;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--live') live = true;
  else if (args[index] === '--limit' && /^\d+$/.test(args[index + 1] ?? ''))
    limit = Number(args[++index]);
  else {
    console.error(
      'Usage: pnpm eval:jev [--live] [--limit 1..24]. API Keys belong in JEV_API_KEY, never CLI arguments.',
    );
    process.exit(1);
  }
}
if (!Number.isInteger(limit) || limit < 1 || limit > 24) {
  console.error('The request limit must be between 1 and 24.');
  process.exit(1);
}
if (live && existsSync('.env.local')) process.loadEnvFile('.env.local');
if (live && !process.env.JEV_API_KEY?.trim()) {
  console.error(
    'Live evaluation needs JEV_API_KEY in the environment or ignored .env.local. No API calls were made.',
  );
  process.exit(1);
}

// Load the actual extension modules; no HTTP preview server or alternative prompts.
const server = await createServer({
  configFile: false,
  envFile: false,
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
});
try {
  const { evaluate } = await server.ssrLoadModule('/evaluation/run.ts');
  const summary = await evaluate({
    live,
    limit,
    apiKey: live ? process.env.JEV_API_KEY : undefined,
  });
  if (
    summary.live &&
    (summary.live.unattempted > 0 || summary.live.validResponses.correct < summary.live.attempted)
  )
    process.exitCode = 2;
} catch {
  // Never echo arbitrary exceptions: they could contain request configuration.
  console.error(
    'Evaluation stopped. Check the benchmark and local setup; any completed calls are checkpointed under output/jev-eval. No automatic retry was made.',
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
