import { FastifyInstance } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { replays, moments } from '@unifyed/db/schema';
import { 
  listReplaysQuerySchema,
  getReplayParamsSchema,
  createReplayRequestSchema,
  publishReplayParamsSchema,
  getReplayMomentsParamsSchema,
  type ListReplaysResponse,
  type GetReplayResponse,
  type CreateReplayResponse,
  type PublishReplayResponse,
  type GetReplayMomentsResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes, generateSlug } from '@unifyed/utils';
import { EVENT_TYPES } from '@unifyed/events';
import { authPlugin } from '../plugins/auth.js';

export async function replaysRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /replays - List replays
  fastify.get('/', async (request, reply) => {
    const query = listReplaysQuerySchema.parse(request.query);
    const { page, limit, isPublished } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(replays.creatorId, request.creator.id)];
    if (isPublished !== undefined) {
      conditions.push(eq(replays.isPublished, isPublished));
    }

    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(replays)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    const replayList = await fastify.db
      .select()
      .from(replays)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(replays.createdAt);

    const response: ListReplaysResponse = {
      replays: replayList.map(r => ({
        ...r,
        metadata: r.metadata as Record<string, unknown> | null,
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

  // GET /replays/:id - Get single replay with moments
  fastify.get('/:id', async (request, reply) => {
    const { id } = getReplayParamsSchema.parse(request.params);

    const [replay] = await fastify.db
      .select()
      .from(replays)
      .where(and(eq(replays.id, id), eq(replays.creatorId, request.creator.id)))
      .limit(1);

    if (!replay) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Replay not found');
    }

    const replayMoments = await fastify.db
      .select()
      .from(moments)
      .where(eq(moments.replayId, id))
      .orderBy(moments.timestamp);

    const response: GetReplayResponse = {
      replay: {
        ...replay,
        metadata: replay.metadata as Record<string, unknown> | null,
        moments: replayMoments.map(m => ({
          ...m,
          metadata: m.metadata as Record<string, unknown> | null,
        })),
      },
    };

    return reply.send(response);
  });

  // POST /replays - Create replay manually
  fastify.post('/', async (request, reply) => {
    const input = createReplayRequestSchema.parse(request.body);

    const [replay] = await fastify.db
      .insert(replays)
      .values({
        creatorId: request.creator.id,
        streamId: input.streamId,
        videoSource: 'manual_url',
        videoUrl: input.videoUrl,
        title: input.title,
        description: input.description,
        thumbnailUrl: input.thumbnailUrl,
        duration: input.duration,
        slug: generateSlug(input.title),
        isPublished: false,
      })
      .returning();

    if (!replay) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create replay');
    }

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.REPLAY_CREATED, {
      replayId: replay.id,
      streamId: replay.streamId,
      title: replay.title,
      videoSource: 'manual_url',
    }, { creatorId: request.creator.id });

    const response: CreateReplayResponse = {
      replay: {
        ...replay,
        metadata: replay.metadata as Record<string, unknown> | null,
      },
    };

    return reply.status(201).send(response);
  });

  // POST /replays/:id/publish - Publish replay
  fastify.post('/:id/publish', async (request, reply) => {
    const { id } = publishReplayParamsSchema.parse(request.params);

    const [replay] = await fastify.db
      .select()
      .from(replays)
      .where(and(eq(replays.id, id), eq(replays.creatorId, request.creator.id)))
      .limit(1);

    if (!replay) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Replay not found');
    }

    if (!replay.videoUrl) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Replay must have a video URL before publishing');
    }

    const [updated] = await fastify.db
      .update(replays)
      .set({
        isPublished: true,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(replays.id, id))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to publish replay');
    }

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.REPLAY_PUBLISHED, {
      replayId: updated.id,
      slug: updated.slug,
      publishedAt: updated.publishedAt,
    }, { creatorId: request.creator.id });

    const response: PublishReplayResponse = {
      replay: {
        ...updated,
        metadata: updated.metadata as Record<string, unknown> | null,
      },
    };

    return reply.send(response);
  });

  // GET /replays/:id/moments - Get replay moments
  fastify.get('/:id/moments', async (request, reply) => {
    const { id } = getReplayMomentsParamsSchema.parse(request.params);

    const [replay] = await fastify.db
      .select({ id: replays.id })
      .from(replays)
      .where(and(eq(replays.id, id), eq(replays.creatorId, request.creator.id)))
      .limit(1);

    if (!replay) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Replay not found');
    }

    const replayMoments = await fastify.db
      .select()
      .from(moments)
      .where(eq(moments.replayId, id))
      .orderBy(moments.timestamp);

    const response: GetReplayMomentsResponse = {
      moments: replayMoments.map(m => ({
        ...m,
        metadata: m.metadata as Record<string, unknown> | null,
      })),
    };

    return reply.send(response);
  });
}
