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
import { AppError, ErrorCodes, decrypt } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';
import { env } from '../config/env.js';

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

    // Do synchronous sync (worker not required)
    try {
      // Decrypt credentials
      request.log.info({ connectionId, credentialsLength: connection.credentials?.length }, 'Attempting to decrypt credentials');
      
      let decryptedStr: string;
      try {
        decryptedStr = decrypt(connection.credentials, env.CREDENTIALS_ENCRYPTION_KEY);
      } catch (decryptErr) {
        request.log.error({ err: decryptErr, credentialsPreview: connection.credentials?.substring(0, 50) }, 'Failed to decrypt credentials');
        throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to decrypt store credentials');
      }
      
      const credentials = JSON.parse(decryptedStr) as { accessToken: string; shopDomain: string };
      
      const { accessToken, shopDomain } = credentials;
      request.log.info({ shopDomain }, 'Fetching products from Shopify');
      
      // Fetch products from Shopify
      const shopifyUrl = `https://${shopDomain}.myshopify.com/admin/api/2024-01/products.json?limit=250`;
      const shopifyRes = await fetch(shopifyUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      
      if (!shopifyRes.ok) {
        const error = await shopifyRes.text();
        request.log.error({ status: shopifyRes.status, error, shopDomain }, 'Shopify API error');
        throw new AppError(ErrorCodes.INTEGRATION_ERROR, `Shopify API error: ${shopifyRes.status} - ${error}`);
      }
      
      interface ShopifyVariant {
        id: number;
        title: string;
        sku: string;
        barcode: string;
        price: string;
        compare_at_price: string | null;
        inventory_quantity: number;
        inventory_policy: string;
        option1: string | null;
        option2: string | null;
        option3: string | null;
        inventory_item_id: number;
        weight: number;
        weight_unit: string;
      }
      
      interface ShopifyProduct {
        id: number;
        title: string;
        body_html: string;
        vendor: string;
        product_type: string;
        images: Array<{ src: string }>;
        variants: ShopifyVariant[];
      }
      
      const data = (await shopifyRes.json()) as { products: ShopifyProduct[] };
      
      request.log.info(`Fetched ${data.products.length} products from Shopify`);
      
      // Import products and variants
      for (const shopifyProduct of data.products) {
        const [product] = await fastify.db
          .insert(products)
          .values({
            connectionId,
            externalId: String(shopifyProduct.id),
            title: shopifyProduct.title,
            description: shopifyProduct.body_html,
            vendor: shopifyProduct.vendor,
            productType: shopifyProduct.product_type,
            imageUrl: shopifyProduct.images[0]?.src ?? null,
            images: shopifyProduct.images.map((img) => img.src),
            isActive: true,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [products.connectionId, products.externalId],
            set: {
              title: shopifyProduct.title,
              description: shopifyProduct.body_html,
              vendor: shopifyProduct.vendor,
              productType: shopifyProduct.product_type,
              imageUrl: shopifyProduct.images[0]?.src ?? null,
              images: shopifyProduct.images.map((img) => img.src),
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            },
          })
          .returning();
        
        if (!product) continue;
        
        // Upsert variants
        for (const shopifyVariant of shopifyProduct.variants) {
          await fastify.db
            .insert(variants)
            .values({
              productId: product.id,
              externalId: String(shopifyVariant.id),
              title: shopifyVariant.title,
              sku: shopifyVariant.sku || null,
              barcode: shopifyVariant.barcode || null,
              price: Math.round(parseFloat(shopifyVariant.price) * 100),
              compareAtPrice: shopifyVariant.compare_at_price
                ? Math.round(parseFloat(shopifyVariant.compare_at_price) * 100)
                : null,
              inventoryQuantity: shopifyVariant.inventory_quantity,
              inventoryPolicy: shopifyVariant.inventory_policy,
              option1: shopifyVariant.option1,
              option2: shopifyVariant.option2,
              option3: shopifyVariant.option3,
              inventoryItemId: String(shopifyVariant.inventory_item_id),
              weight: String(shopifyVariant.weight),
              weightUnit: shopifyVariant.weight_unit,
              isActive: true,
            })
            .onConflictDoUpdate({
              target: [variants.productId, variants.externalId],
              set: {
                title: shopifyVariant.title,
                sku: shopifyVariant.sku || null,
                barcode: shopifyVariant.barcode || null,
                price: Math.round(parseFloat(shopifyVariant.price) * 100),
                compareAtPrice: shopifyVariant.compare_at_price
                  ? Math.round(parseFloat(shopifyVariant.compare_at_price) * 100)
                  : null,
                inventoryQuantity: shopifyVariant.inventory_quantity,
                inventoryPolicy: shopifyVariant.inventory_policy,
                option1: shopifyVariant.option1,
                option2: shopifyVariant.option2,
                option3: shopifyVariant.option3,
                updatedAt: new Date(),
              },
            });
        }
      }
      
      // Update connection sync timestamp
      await fastify.db
        .update(platformConnections)
        .set({
          lastSyncAt: new Date(),
          status: 'healthy',
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(platformConnections.id, connectionId));
      
      const response: SyncCatalogResponse = {
        jobId: `sync-${connectionId}-${Date.now()}`,
        message: `Catalog sync completed. Imported ${data.products.length} products.`,
      };
      
      return reply.send(response);
    } catch (err) {
      request.log.error(err, 'Catalog sync error');
      throw err;
    }
  });
}
