import { Worker } from 'bullmq';
import { createDatabase } from '@unifyed/db';
import { env } from './config.js';

// Processors
import { catalogSyncProcessor } from './processors/catalog-sync.js';
import { streamDetectionProcessor } from './processors/stream-detection.js';
import { reservationExpiryProcessor } from './processors/reservation-expiry.js';
import { eventProcessor } from './processors/event-processor.js';
import { StreamDetectionScheduler, createStreamDetectionScheduler } from './processors/stream-detection-scheduler.js';

// Store scheduler reference for shutdown
let streamScheduler: StreamDetectionScheduler | null = null;

export async function createWorkers(): Promise<Worker[]> {
  const db = createDatabase(env.DATABASE_URL);
  
  // Parse Redis URL for BullMQ connection
  const redisUrl = new URL(env.REDIS_URL);
  const connection = { 
    host: redisUrl.hostname || 'localhost', 
    port: parseInt(redisUrl.port || '6379', 10),
    password: redisUrl.password || undefined,
    username: redisUrl.username || undefined,
  };
  
  const workers: Worker[] = [];
  
  // Catalog sync worker
  workers.push(
    new Worker(
      'catalog-sync',
      async (job) => catalogSyncProcessor(job, db),
      {
        connection,
        concurrency: 2,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      }
    )
  );
  
  // Stream detection worker
  workers.push(
    new Worker(
      'stream-detection',
      async (job) => streamDetectionProcessor(job, db),
      {
        connection,
        concurrency: 5,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      }
    )
  );
  
  // Reservation expiry worker
  workers.push(
    new Worker(
      'reservation-expiry',
      async (job) => reservationExpiryProcessor(job, db),
      {
        connection,
        concurrency: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      }
    )
  );
  
  // Event processor worker
  workers.push(
    new Worker(
      'event-processor',
      async (job) => eventProcessor(job, db),
      {
        connection,
        concurrency: 10,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      }
    )
  );
  
  // Setup error handlers
  workers.forEach((worker) => {
    worker.on('completed', (job) => {
      console.log(`✅ Job ${job.id} completed on ${worker.name}`);
    });
    
    worker.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} failed on ${worker.name}:`, err.message);
    });
    
    worker.on('error', (err) => {
      console.error(`❌ Worker ${worker.name} error:`, err);
    });
  });
  
  // Start the stream detection scheduler
  // Polls for live streams every 30 seconds (configurable)
  streamScheduler = createStreamDetectionScheduler({
    connection,
    pollIntervalMs: 30000, // 30 seconds
  });
  await streamScheduler.start();
  
  return workers;
}

export async function gracefulShutdown(workers: Worker[]): Promise<void> {
  // Stop the scheduler
  if (streamScheduler) {
    await streamScheduler.stop();
  }
  
  // Close all workers
  await Promise.all(workers.map((w) => w.close()));
  console.log('✅ All workers shut down');
}

// Export scheduler for API to trigger immediate checks
export function getStreamScheduler(): StreamDetectionScheduler | null {
  return streamScheduler;
}
