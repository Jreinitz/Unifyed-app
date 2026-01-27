import { nanoid } from 'nanoid';
import { type EventType, type EventMetadata, EVENT_TYPES } from './types.js';
import { type EventPayloads } from './payloads.js';

// Event emitter interface (implemented by the API/worker)
export interface EventEmitter {
  emit<T extends EventType>(
    eventType: T,
    payload: T extends keyof EventPayloads ? EventPayloads[T] : Record<string, unknown>,
    options?: {
      creatorId?: string;
      metadata?: EventMetadata;
      eventId?: string; // For idempotency
    }
  ): Promise<string>; // Returns event ID
}

// Generate a unique event ID
export function generateEventId(): string {
  return nanoid(21);
}

// Generate an idempotent event ID based on deterministic inputs
export function generateIdempotentEventId(
  eventType: EventType,
  ...parts: (string | number | undefined)[]
): string {
  const validParts = parts.filter((p): p is string | number => p !== undefined);
  return `${eventType}:${validParts.join(':')}`;
}

// Helper to create event data structure
export function createEventData<T extends EventType>(
  eventType: T,
  payload: T extends keyof EventPayloads ? EventPayloads[T] : Record<string, unknown>,
  options?: {
    creatorId?: string;
    metadata?: EventMetadata;
    eventId?: string;
  }
) {
  return {
    eventId: options?.eventId ?? generateEventId(),
    eventType,
    creatorId: options?.creatorId,
    payload,
    metadata: options?.metadata,
    occurredAt: new Date(),
  };
}

// Re-export EVENT_TYPES for convenience
export { EVENT_TYPES };
