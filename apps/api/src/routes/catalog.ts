import { FastifyInstance } from 'fastify';
import { eq, and, like, sql, count } from 'drizzle-orm';
import { products, variants, platformConnections } from '@unifyed/db/schema';
import { 
  listProductsQuerySchema,
  getProductParamsSchema,
  syncCatalogRequestSchema,
  type ListProductsResponse,
  type GetProductResponse,
  type SyncCatalogResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';

export async function catalogRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /catalog/products - List products
  fastify.get('/products', async (request, reply) => {
    const query = listProductsQuerySchema.parse(request.query);
    const { page, limit, search, connectionId, isActive } = query;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [
      // Only products from creator's connections
      sql`${products.connectionId} IN (
        SELECT id FROM ${platformConnections} 
        WHERE creator_id = ${request.creator.id}
      )`,
    ];

    if (connectionId) {
      conditions.push(eq(products.connectionId, connectionId));
    }

    if (isActive !== undefined) {
      conditions.push(eq(products.isActive, isActive));
    }

    if (search) {
      conditions.push(like(products.title, `%${search}%`));
    }

    // Get total count
    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(products)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    // Get products with variant info
    const productList = await fastify.db
      .select({
        id: products.id,
        title: products.title,
        imageUrl: products.imageUrl,
        vendor: products.vendor,
        isActive: products.isActive,
      })
      .from(products)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(products.title);

    // Get variant counts and price ranges
    const productIds = productList.map(p => p.id);
    
    const variantStats = productIds.length > 0 
      ? await fastify.db
          .select({
            productId: variants.productId,
            variantCount: count(),
            minPrice: sql<number>`MIN(${variants.price})`,
            maxPrice: sql<number>`MAX(${variants.price})`,
            currency: variants.currency,
          })
          .from(variants)
          .where(sql`${variants.productId} IN ${productIds}`)
          .groupBy(variants.productId, variants.currency)
      : [];

    const statsMap = new Map(variantStats.map(s => [s.productId, s]));

    const response: ListProductsResponse = {
      products: productList.map(p => {
        const stats = statsMap.get(p.id);
        return {
          id: p.id,
          title: p.title,
          imageUrl: p.imageUrl,
          vendor: p.vendor,
          isActive: p.isActive,
          variantCount: Number(stats?.variantCount ?? 0),
          priceRange: {
            min: Number(stats?.minPrice ?? 0),
            max: Number(stats?.maxPrice ?? 0),
            currency: stats?.currency ?? 'USD',
          },
        };
      }),
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };

    return reply.send(response);
  });

  // GET /catalog/products/:id - Get single product with variants
  fastify.get('/products/:id', async (request, reply) => {
    const { id } = getProductParamsSchema.parse(request.params);

    const [product] = await fastify.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, id),
          sql`${products.connectionId} IN (
            SELECT id FROM ${platformConnections}
            WHERE creator_id = ${request.creator.id}
          )`
        )
      )
      .limit(1);

    if (!product) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
    }

    const productVariants = await fastify.db
      .select()
      .from(variants)
      .where(eq(variants.productId, id))
      .orderBy(variants.title);

    const response: GetProductResponse = {
      product: {
        ...product,
        images: product.images as string[],
        variants: productVariants.map(v => ({
          ...v,
          weight: v.weight ? Number(v.weight) : null,
          inventoryPolicy: v.inventoryPolicy ?? 'deny',
        })),
      },
    };

    return reply.send(response);
  });

  // POST /catalog/sync - Trigger catalog sync for a connection
  fastify.post('/sync', async (request, reply) => {
    const { connectionId } = syncCatalogRequestSchema.parse(request.body);

    // Verify connection belongs to creator
    const [connection] = await fastify.db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.id, connectionId),
          eq(platformConnections.creatorId, request.creator.id)
        )
      )
      .limit(1);

    if (!connection) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Connection not found');
    }

    if (connection.platform !== 'shopify') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Only Shopify connections support catalog sync');
    }

    // Queue sync job
    const job = await fastify.queues.catalogSync.add(
      'sync',
      { connectionId },
      { 
        jobId: `manual-sync-${connectionId}-${Date.now()}`,
        removeOnComplete: true,
      }
    );

    const response: SyncCatalogResponse = {
      jobId: job.id ?? 'unknown',
      message: 'Catalog sync started',
    };

    return reply.status(202).send(response);
  });
}
