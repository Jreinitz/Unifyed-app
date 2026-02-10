// Force IPv4 DNS resolution - Railway doesn't support IPv6 outbound
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

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

// Load environment variables from workspace root BEFORE importing modules that validate env
dotenv.config({ path: resolve(workspaceRoot, '.env.local') });
dotenv.config({ path: resolve(workspaceRoot, '.env') });

async function start() {
  // Initialize Sentry before anything else
  const { initSentry } = await import('./lib/sentry.js');
  initSentry();

  // Dynamic imports after env is loaded
  const { buildApp } = await import('./app.js');
  const { env } = await import('./config/env.js');
  
  const app = await buildApp();

  // Railway provides PORT, use it if available, otherwise use API_PORT
  const port = env.PORT || env.API_PORT;
  // Use 127.0.0.1 for local dev to avoid network interface enumeration issues
  const host = env.NODE_ENV === 'development' ? '127.0.0.1' : env.API_HOST;
  
  try {
    // listenTextResolver: null suppresses address logging that causes uv_interface_addresses error
    await app.listen({ port, host, listenTextResolver: () => `http://${host}:${port}` });
    console.log(`🚀 Unifyed API running on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
