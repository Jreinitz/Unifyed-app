import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Get the directory of this file (apps/api/src)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Workspace root is 3 levels up from src/index.ts: src -> api -> apps -> root
let workspaceRoot = resolve(__dirname, '..', '..', '..');

// Verify we found the right directory by checking for turbo.json or .env
if (!existsSync(resolve(workspaceRoot, 'turbo.json')) && !existsSync(resolve(workspaceRoot, '.env'))) {
  // Fallback: try process.cwd() which is usually workspace root when run via pnpm
  workspaceRoot = process.cwd();
}

console.log(`Loading env from: ${workspaceRoot}`);

// Load environment variables from workspace root
dotenv.config({ path: resolve(workspaceRoot, '.env.local') });
dotenv.config({ path: resolve(workspaceRoot, '.env') });

import { buildApp } from './app.js';
import { env } from './config/env.js';

async function start() {
  const app = await buildApp();

  // Railway provides PORT, use it if available, otherwise use API_PORT
  const port = env.PORT || env.API_PORT;
  
  try {
    await app.listen({ port, host: env.API_HOST });
    console.log(`🚀 Unifyed API running on http://${env.API_HOST}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
