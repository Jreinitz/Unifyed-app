import { eq, and, count } from 'drizzle-orm';
import type { Database } from '@unifyed/db';
import { streams, moments, replays } from '@unifyed/db/schema';
import { AppError, ErrorCodes, generateSlug } from '@unifyed/utils';

export interface CreateStreamInput {
  title?: string;
  description?: string;
  platform?: 'shopify' | 'tiktok' | 'youtube' | 'instagram';
  platformConnectionId?: string;
  scheduledStartAt?: Date;
}

export interface CreateMomentInput {
  title: string;
  description?: string;
  timestamp: number;
  thumbnailUrl?: string;
}

export class StreamService {
  constructor(private db: Database) {}

  /**
   * List streams for a creator with pagination
   */
  async list(
    creatorId: string,
    options: { page: number; limit: number; status?: string }
  ) {
    const { page, limit, status } = options;
    const offset = (page - 1) * limit;

    const conditions = [eq(streams.creatorId, creatorId)];
    if (status) {
      conditions.push(eq(streams.status, status as typeof streams.status.enumValues[number]));
    }

    const [countResult] = await this.db
      .select({ count: count() })
      .from(streams)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    const streamList = await this.db
      .select()
      .from(streams)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(streams.createdAt);

    return {
      streams: streamList,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  /**
   * Get a single stream
   */
  async get(creatorId: string, streamId: string) {
    const [stream] = await this.db
      .select()
      .from(streams)
      .where(and(eq(streams.id, streamId), eq(streams.creatorId, creatorId)))
      .limit(1);

    if (!stream) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Stream not found');
    }

    return stream;
  }

  /**
   * Create a new stream
   */
  async create(creatorId: string, input: CreateStreamInput) {
    const [stream] = await this.db
      .insert(streams)
      .values({
        creatorId,
        title: input.title,
        description: input.description,
        platform: input.platform,
        platformConnectionId: input.platformConnectionId,
        source: 'manual',
        status: 'scheduled',
        scheduledStartAt: input.scheduledStartAt,
      })
      .returning();

    if (!stream) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create stream');
    }

    return stream;
  }

  /**
   * Start a stream (mark as live)
   */
  async start(creatorId: string, streamId: string) {
    const stream = await this.get(creatorId, streamId);

    if (stream.status === 'live') {
      throw new AppError(ErrorCodes.CONFLICT, 'Stream is already live');
    }

    if (stream.status === 'ended') {
      throw new AppError(ErrorCodes.CONFLICT, 'Stream has already ended');
    }

    const [updated] = await this.db
      .update(streams)
      .set({
        status: 'live',
        actualStartAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(streams.id, streamId))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to start stream');
    }

    return updated;
  }

  /**
   * End a stream and create replay
   */
  async end(creatorId: string, streamId: string) {
    const stream = await this.get(creatorId, streamId);

    if (stream.status === 'ended') {
      throw new AppError(ErrorCodes.CONFLICT, 'Stream has already ended');
    }

    const endedAt = new Date();
    const duration = stream.actualStartAt
      ? Math.floor((endedAt.getTime() - stream.actualStartAt.getTime()) / 1000)
      : 0;

    const [updated] = await this.db
      .update(streams)
      .set({
        status: 'ended',
        endedAt,
        updatedAt: new Date(),
      })
      .where(eq(streams.id, streamId))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to end stream');
    }

    // Create replay automatically
    const [replay] = await this.db
      .insert(replays)
      .values({
        creatorId,
        streamId,
        platform: stream.platform,
        platformConnectionId: stream.platformConnectionId,
        videoSource: 'manual_url',
        title: stream.title,
        description: stream.description,
        slug: generateSlug(stream.title ?? undefined),
        isPublished: false,
      })
      .returning();

    return { stream: updated, replay, duration };
  }

  /**
   * Create a moment in a stream
   */
  async createMoment(creatorId: string, streamId: string, input: CreateMomentInput) {
    // Verify stream exists and belongs to creator
    await this.get(creatorId, streamId);

    // Get current max sort order
    const [maxSort] = await this.db
      .select({ max: count() })
      .from(moments)
      .where(eq(moments.streamId, streamId));

    const [moment] = await this.db
      .insert(moments)
      .values({
        creatorId,
        streamId,
        title: input.title,
        description: input.description,
        timestamp: input.timestamp,
        thumbnailUrl: input.thumbnailUrl,
        sortOrder: Number(maxSort?.max ?? 0),
      })
      .returning();

    if (!moment) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create moment');
    }

    return moment;
  }
}
