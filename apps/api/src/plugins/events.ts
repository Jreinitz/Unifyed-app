import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import { eventLog } from '@unifyed/db/schema';
import { 
  type EventType, 
  type EventMetadata, 
  type EventPayloads,
  generateEventId,
} from '@unifyed/events';

declare module 'fastify' {
  interface FastifyInstance {
    emitEvent: <T extends EventType>(
      eventType: T,
      payload: T extends keyof EventPayloads ? EventPayloads[T] : Record<string, unknown>,
      options?: {
        creatorId?: string;
        metadata?: EventMetadata;
        eventId?: string;
      }
    ) => Promise<string>;
  }
}

async function eventsPluginCallback(fastify: FastifyInstance) {
  /**
   * Emit an event to the event log (idempotent)
   */
  async function emitEvent<T extends EventType>(
    eventType: T,
    payload: T extends keyof EventPayloads ? EventPayloads[T] : Record<string, unknown>,
    options?: {
      creatorId?: string;
      metadata?: EventMetadata;
      eventId?: string;
    }
  ): Promise<string> {
    const eventId = options?.eventId ?? generateEventId();
    
    // Check if event already exists (idempotency)
    const existing = await fastify.db
      .select({ id: eventLog.id })
      .from(eventLog)
      .where(eq(eventLog.eventId, eventId))
      .limit(1);
    
    if (existing.length > 0) {
      fastify.log.debug({ eventId }, 'Event already exists, skipping');
      return eventId;
    }
    
    // Insert new event
    await fastify.db.insert(eventLog).values({
      eventId,
      eventType,
      creatorId: options?.creatorId,
      payload: payload as Record<string, unknown>,
      metadata: options?.metadata,
      occurredAt: new Date(),
    });
    
    // Queue for async processing
    await fastify.queues.eventProcessor.add(
      'process',
      { eventId },
      { 
        jobId: eventId, // Ensure idempotent job creation
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    
    fastify.log.debug({ eventId, eventType }, 'Event emitted');
    return eventId;
  }

  fastify.decorate('emitEvent', emitEvent);
}

export const eventsPlugin = fp(eventsPluginCallback, {
  name: 'events',
  dependencies: ['db', 'redis'],
});
