import { FastifyInstance } from 'fastify';
import { eq, and, count, desc } from 'drizzle-orm';
import { sessionTemplates, liveSessions } from '@unifyed/db/schema';
import { z } from 'zod';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';

// Request/Response schemas
const listTemplatesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const templateIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const createTemplateBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  defaultOfferIds: z.array(z.string().uuid()).optional(),
  defaultProductIds: z.array(z.string().uuid()).optional(),
  settings: z.object({
    autoStartChat: z.boolean().default(true),
    autoAnnounce: z.boolean().default(false),
    defaultTitle: z.string().optional(),
  }).optional(),
  isDefault: z.boolean().optional(),
});

const updateTemplateBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  platforms: z.array(z.string()).nullable().optional(),
  defaultOfferIds: z.array(z.string().uuid()).nullable().optional(),
  defaultProductIds: z.array(z.string().uuid()).nullable().optional(),
  settings: z.object({
    autoStartChat: z.boolean(),
    autoAnnounce: z.boolean(),
    defaultTitle: z.string().optional(),
  }).nullable().optional(),
  isDefault: z.boolean().optional(),
});

// Response type
interface SessionTemplateResponse {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  platforms: string[] | null;
  defaultOfferIds: string[] | null;
  defaultProductIds: string[] | null;
  settings: {
    autoStartChat: boolean;
    autoAnnounce: boolean;
    defaultTitle?: string;
  } | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function sessionTemplatesRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /session-templates - List templates
  fastify.get('/', async (request, reply) => {
    const query = listTemplatesQuerySchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(sessionTemplates)
      .where(eq(sessionTemplates.creatorId, request.creator.id));

    const total = countResult?.count ?? 0;

    const templates = await fastify.db
      .select()
      .from(sessionTemplates)
      .where(eq(sessionTemplates.creatorId, request.creator.id))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(sessionTemplates.createdAt));

    const response: SessionTemplateResponse[] = templates.map(t => ({
      id: t.id,
      creatorId: t.creatorId,
      name: t.name,
      description: t.description,
      platforms: t.platforms as string[] | null,
      defaultOfferIds: t.defaultOfferIds as string[] | null,
      defaultProductIds: t.defaultProductIds as string[] | null,
      settings: t.settings as SessionTemplateResponse['settings'],
      isDefault: t.isDefault,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return reply.send({
      templates: response,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    });
  });

  // GET /session-templates/:id - Get single template
  fastify.get('/:id', async (request, reply) => {
    const { id } = templateIdParamsSchema.parse(request.params);

    const [template] = await fastify.db
      .select()
      .from(sessionTemplates)
      .where(and(
        eq(sessionTemplates.id, id),
        eq(sessionTemplates.creatorId, request.creator.id)
      ))
      .limit(1);

    if (!template) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Session template not found');
    }

    const response: SessionTemplateResponse = {
      id: template.id,
      creatorId: template.creatorId,
      name: template.name,
      description: template.description,
      platforms: template.platforms as string[] | null,
      defaultOfferIds: template.defaultOfferIds as string[] | null,
      defaultProductIds: template.defaultProductIds as string[] | null,
      settings: template.settings as SessionTemplateResponse['settings'],
      isDefault: template.isDefault,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };

    return reply.send({ template: response });
  });

  // POST /session-templates - Create template
  fastify.post('/', async (request, reply) => {
    const body = createTemplateBodySchema.parse(request.body);

    // If setting as default, clear other defaults first
    if (body.isDefault) {
      await fastify.db
        .update(sessionTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(sessionTemplates.creatorId, request.creator.id),
          eq(sessionTemplates.isDefault, true)
        ));
    }

    const [template] = await fastify.db
      .insert(sessionTemplates)
      .values({
        creatorId: request.creator.id,
        name: body.name,
        description: body.description,
        platforms: body.platforms,
        defaultOfferIds: body.defaultOfferIds,
        defaultProductIds: body.defaultProductIds,
        settings: body.settings,
        isDefault: body.isDefault ?? false,
      })
      .returning();

    const response: SessionTemplateResponse = {
      id: template.id,
      creatorId: template.creatorId,
      name: template.name,
      description: template.description,
      platforms: template.platforms as string[] | null,
      defaultOfferIds: template.defaultOfferIds as string[] | null,
      defaultProductIds: template.defaultProductIds as string[] | null,
      settings: template.settings as SessionTemplateResponse['settings'],
      isDefault: template.isDefault,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };

    return reply.status(201).send({ template: response });
  });

  // PATCH /session-templates/:id - Update template
  fastify.patch('/:id', async (request, reply) => {
    const { id } = templateIdParamsSchema.parse(request.params);
    const body = updateTemplateBodySchema.parse(request.body);

    // Verify ownership
    const [existing] = await fastify.db
      .select({ id: sessionTemplates.id })
      .from(sessionTemplates)
      .where(and(
        eq(sessionTemplates.id, id),
        eq(sessionTemplates.creatorId, request.creator.id)
      ))
      .limit(1);

    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Session template not found');
    }

    // If setting as default, clear other defaults first
    if (body.isDefault) {
      await fastify.db
        .update(sessionTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(sessionTemplates.creatorId, request.creator.id),
          eq(sessionTemplates.isDefault, true)
        ));
    }

    // Build update object, only including fields that are provided
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData['name'] = body.name;
    if (body.description !== undefined) updateData['description'] = body.description;
    if (body.platforms !== undefined) updateData['platforms'] = body.platforms;
    if (body.defaultOfferIds !== undefined) updateData['defaultOfferIds'] = body.defaultOfferIds;
    if (body.defaultProductIds !== undefined) updateData['defaultProductIds'] = body.defaultProductIds;
    if (body.settings !== undefined) updateData['settings'] = body.settings;
    if (body.isDefault !== undefined) updateData['isDefault'] = body.isDefault;

    const [template] = await fastify.db
      .update(sessionTemplates)
      .set(updateData)
      .where(eq(sessionTemplates.id, id))
      .returning();

    const response: SessionTemplateResponse = {
      id: template.id,
      creatorId: template.creatorId,
      name: template.name,
      description: template.description,
      platforms: template.platforms as string[] | null,
      defaultOfferIds: template.defaultOfferIds as string[] | null,
      defaultProductIds: template.defaultProductIds as string[] | null,
      settings: template.settings as SessionTemplateResponse['settings'],
      isDefault: template.isDefault,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };

    return reply.send({ template: response });
  });

  // DELETE /session-templates/:id - Delete template
  fastify.delete('/:id', async (request, reply) => {
    const { id } = templateIdParamsSchema.parse(request.params);

    // Verify ownership and delete
    const result = await fastify.db
      .delete(sessionTemplates)
      .where(and(
        eq(sessionTemplates.id, id),
        eq(sessionTemplates.creatorId, request.creator.id)
      ))
      .returning({ id: sessionTemplates.id });

    if (result.length === 0) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Session template not found');
    }

    return reply.send({ success: true });
  });

  // POST /session-templates/:id/apply - Apply template to create a prepared session
  fastify.post('/:id/apply', async (request, reply) => {
    const { id } = templateIdParamsSchema.parse(request.params);

    // Get template
    const [template] = await fastify.db
      .select()
      .from(sessionTemplates)
      .where(and(
        eq(sessionTemplates.id, id),
        eq(sessionTemplates.creatorId, request.creator.id)
      ))
      .limit(1);

    if (!template) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Session template not found');
    }

    const settings = template.settings as SessionTemplateResponse['settings'];

    // Create a prepared session
    const [session] = await fastify.db
      .insert(liveSessions)
      .values({
        creatorId: request.creator.id,
        title: settings?.defaultTitle ?? template.name,
        status: 'preparing',
        metadata: {
          templateId: template.id,
          templateName: template.name,
          platforms: template.platforms,
          defaultOfferIds: template.defaultOfferIds,
          defaultProductIds: template.defaultProductIds,
          settings: template.settings,
        },
      })
      .returning();

    return reply.status(201).send({
      session: {
        id: session.id,
        creatorId: session.creatorId,
        title: session.title,
        status: session.status,
        metadata: session.metadata,
        createdAt: session.createdAt,
      },
      template: {
        id: template.id,
        name: template.name,
        platforms: template.platforms,
        defaultOfferIds: template.defaultOfferIds,
        defaultProductIds: template.defaultProductIds,
        settings: template.settings,
      },
    });
  });
}
