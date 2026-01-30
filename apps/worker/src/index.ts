import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Workspace root is 3 levels up from src/index.ts: src -> worker -> apps -> root
let workspaceRoot = resolve(__dirname, '..', '..', '..');

// Verify we found the right directory by checking for turbo.json or .env
if (!existsSync(resolve(workspaceRoot, 'turbo.json')) && !existsSync(resolve(workspaceRoot, '.env'))) {
  workspaceRoot = process.cwd();
}

console.log(`Loading env from: ${workspaceRoot}`);

// Load environment variables from workspace root BEFORE importing modules that validate env
dotenv.config({ path: resolve(workspaceRoot, '.env.local') });
dotenv.config({ path: resolve(workspaceRoot, '.env') });

async function start() {
  // Dynamic import after env is loaded
  const { createWorkers, gracefulShutdown } = await import('./workers.js');
  
  console.log('🔄 Starting Unifyed Workers...');
  
  const workers = await createWorkers();
  
  console.log(`✅ ${workers.length} workers started`);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('⏳ Received SIGTERM, shutting down gracefully...');
    await gracefulShutdown(workers);
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('⏳ Received SIGINT, shutting down gracefully...');
    await gracefulShutdown(workers);
    process.exit(0);
  });
}

start().catch((err) => {
  console.error('❌ Failed to start workers:', err);
  process.exit(1);
});
