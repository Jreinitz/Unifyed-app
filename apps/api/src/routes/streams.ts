import { FastifyInstance } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { streams, moments, replays } from '@unifyed/db/schema';
import { 
  listStreamsQuerySchema,
  getStreamParamsSchema,
  createStreamRequestSchema,
  startStreamParamsSchema,
  endStreamParamsSchema,
  createMomentParamsSchema,
  createMomentRequestSchema,
  type ListStreamsResponse,
  type GetStreamResponse,
  type CreateStreamResponse,
  type StartStreamResponse,
  type EndStreamResponse,
  type CreateMomentResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes, generateSlug } from '@unifyed/utils';
import { EVENT_TYPES } from '@unifyed/events';
import { authPlugin } from '../plugins/auth.js';

export async function streamsRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /streams - List streams
  fastify.get('/', async (request, reply) => {
    const query = listStreamsQuerySchema.parse(request.query);
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(streams.creatorId, request.creator.id)];
    if (status) {
      conditions.push(eq(streams.status, status));
    }

    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(streams)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    const streamList = await fastify.db
      .select()
      .from(streams)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(streams.createdAt);

    const response: ListStreamsResponse = {
      streams: streamList.map(s => ({
        ...s,
        metadata: s.metadata as Record<string, unknown> | null,
      })),
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };

    return reply.send(response);
  });

  // GET /streams/:id - Get single stream
  fastify.get('/:id', async (request, reply) => {
    const { id } = getStreamParamsSchema.parse(request.params);

    const [stream] = await fastify.db
      .select()
      .from(streams)
      .where(and(eq(streams.id, id), eq(streams.creatorId, request.creator.id)))
      .limit(1);

    if (!stream) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Stream not found');
    }

    const response: GetStreamResponse = {
      stream: {
        ...stream,
        metadata: stream.metadata as Record<string, unknown> | null,
      },
    };

    return reply.send(response);
  });

  // POST /streams - Create stream manually
  fastify.post('/', async (request, reply) => {
    const input = createStreamRequestSchema.parse(request.body);

    const [stream] = await fastify.db
      .insert(streams)
      .values({
        creatorId: request.creator.id,
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

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.STREAM_CREATED, {
      streamId: stream.id,
      title: stream.title,
      platform: stream.platform,
      source: 'manual',
    }, { creatorId: request.creator.id });

    const response: CreateStreamResponse = {
      stream: {
        ...stream,
        metadata: stream.metadata as Record<string, unknown> | null,
      },
    };

    return reply.status(201).send(response);
  });

  // POST /streams/:id/start - Mark stream as live
  fastify.post('/:id/start', async (request, reply) => {
    const { id } = startStreamParamsSchema.parse(request.params);

    const [stream] = await fastify.db
      .select()
      .from(streams)
      .where(and(eq(streams.id, id), eq(streams.creatorId, request.creator.id)))
      .limit(1);

    if (!stream) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Stream not found');
    }

    if (stream.status === 'live') {
      throw new AppError(ErrorCodes.CONFLICT, 'Stream is already live');
    }

    if (stream.status === 'ended') {
      throw new AppError(ErrorCodes.CONFLICT, 'Stream has already ended');
    }

    const [updated] = await fastify.db
      .update(streams)
      .set({
        status: 'live',
        actualStartAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(streams.id, id))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to start stream');
    }

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.STREAM_STARTED, {
      streamId: updated.id,
      startedAt: updated.actualStartAt!,
    }, { creatorId: request.creator.id });

    const response: StartStreamResponse = {
      stream: {
        ...updated,
        metadata: updated.metadata as Record<string, unknown> | null,
      },
    };

    return reply.send(response);
  });

  // POST /streams/:id/end - End stream and create replay
  fastify.post('/:id/end', async (request, reply) => {
    const { id } = endStreamParamsSchema.parse(request.params);

    const [stream] = await fastify.db
      .select()
      .from(streams)
      .where(and(eq(streams.id, id), eq(streams.creatorId, request.creator.id)))
      .limit(1);

    if (!stream) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Stream not found');
    }

    if (stream.status === 'ended') {
      throw new AppError(ErrorCodes.CONFLICT, 'Stream has already ended');
    }

    const endedAt = new Date();
    const duration = stream.actualStartAt 
      ? Math.floor((endedAt.getTime() - stream.actualStartAt.getTime()) / 1000)
      : 0;

    const [updated] = await fastify.db
      .update(streams)
      .set({
        status: 'ended',
        endedAt,
        updatedAt: new Date(),
      })
      .where(eq(streams.id, id))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to end stream');
    }

    // Create replay automatically
    const [replay] = await fastify.db
      .insert(replays)
      .values({
        creatorId: request.creator.id,
        streamId: stream.id,
        platform: stream.platform,
        platformConnectionId: stream.platformConnectionId,
        videoSource: 'manual_url', // Will be updated when video URL is provided
        title: stream.title,
        description: stream.description,
        slug: generateSlug(stream.title ?? undefined),
        isPublished: false,
      })
      .returning();

    // Emit events
    await fastify.emitEvent(EVENT_TYPES.STREAM_ENDED, {
      streamId: updated.id,
      endedAt,
      duration,
      peakViewers: updated.peakViewers,
    }, { creatorId: request.creator.id });

    if (replay) {
      await fastify.emitEvent(EVENT_TYPES.REPLAY_CREATED, {
        replayId: replay.id,
        streamId: stream.id,
        title: replay.title,
        videoSource: 'manual_url',
      }, { creatorId: request.creator.id });
    }

    const response: EndStreamResponse = {
      stream: {
        ...updated,
        metadata: updated.metadata as Record<string, unknown> | null,
      },
      replay: replay ? {
        ...replay,
        metadata: replay.metadata as Record<string, unknown> | null,
      } : undefined,
    };

    return reply.send(response);
  });

  // POST /streams/:id/moments - Create moment
  fastify.post('/:id/moments', async (request, reply) => {
    const { id } = createMomentParamsSchema.parse(request.params);
    const input = createMomentRequestSchema.parse(request.body);

    const [stream] = await fastify.db
      .select()
      .from(streams)
      .where(and(eq(streams.id, id), eq(streams.creatorId, request.creator.id)))
      .limit(1);

    if (!stream) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Stream not found');
    }

    // Get current max sort order
    const [maxSort] = await fastify.db
      .select({ max: count() })
      .from(moments)
      .where(eq(moments.streamId, id));

    const [moment] = await fastify.db
      .insert(moments)
      .values({
        creatorId: request.creator.id,
        streamId: id,
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

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.MOMENT_CREATED, {
      momentId: moment.id,
      streamId: id,
      title: moment.title,
      timestamp: moment.timestamp,
    }, { creatorId: request.creator.id });

    const response: CreateMomentResponse = {
      moment: {
        ...moment,
        metadata: moment.metadata as Record<string, unknown> | null,
      },
    };

    return reply.status(201).send(response);
  });
}
