import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Database } from '@unifyed/db';
import { eventLog } from '@unifyed/db/schema';
import { EVENT_TYPES } from '@unifyed/events';

interface EventProcessorJob {
  eventId: string;
}

export async function eventProcessor(
  job: Job<EventProcessorJob>,
  db: Database
): Promise<void> {
  const { eventId } = job.data;
  
  // Get event from log
  const [event] = await db
    .select()
    .from(eventLog)
    .where(eq(eventLog.eventId, eventId))
    .limit(1);
  
  if (!event) {
    console.warn(`Event ${eventId} not found`);
    return;
  }
  
  // Check if already processed (idempotency)
  if (event.processingStatus === 'completed') {
    console.log(`Event ${eventId} already processed`);
    return;
  }
  
  // Mark as processing
  await db
    .update(eventLog)
    .set({
      processingStatus: 'processing',
      processingAttempts: event.processingAttempts + 1,
    })
    .where(eq(eventLog.id, event.id));
  
  try {
    // Process event based on type
    await processEvent(event.eventType, event.payload as Record<string, unknown>, db);
    
    // Mark as completed
    await db
      .update(eventLog)
      .set({
        processingStatus: 'completed',
        processedAt: new Date(),
      })
      .where(eq(eventLog.id, event.id));
    
    console.log(`✅ Processed event ${eventId} (${event.eventType})`);
  } catch (error) {
    // Mark as failed
    await db
      .update(eventLog)
      .set({
        processingStatus: 'failed',
        processingError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(eventLog.id, event.id));
    
    throw error;
  }
}

async function processEvent(
  eventType: string,
  payload: Record<string, unknown>,
  _db: Database
): Promise<void> {
  // Event-specific processing logic
  // This is where you'd trigger side effects, send notifications, etc.
  
  switch (eventType) {
    case EVENT_TYPES.PURCHASE_COMPLETED:
      // Could trigger:
      // - Send purchase notification to creator
      // - Update analytics
      // - Trigger post-purchase automation
      console.log('Processing purchase completed event', payload);
      break;
      
    case EVENT_TYPES.OFFER_EXPIRED:
      // Could trigger:
      // - Revoke all short links for this offer
      // - Send notification to creator
      console.log('Processing offer expired event', payload);
      break;
      
    case EVENT_TYPES.STREAM_ENDED:
      // Could trigger:
      // - Start video import process
      // - Generate replay page
      console.log('Processing stream ended event', payload);
      break;
      
    case EVENT_TYPES.RESERVATION_EXPIRED:
      // Already handled in reservation-expiry processor
      // This is for analytics/notification purposes
      console.log('Processing reservation expired event', payload);
      break;
      
    default:
      // Most events just need to be logged for analytics
      console.log(`No specific handler for ${eventType}`);
  }
}
