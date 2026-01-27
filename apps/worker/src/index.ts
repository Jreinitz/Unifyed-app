import 'dotenv/config';
import { createWorkers, gracefulShutdown } from './workers.js';

async function start() {
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
