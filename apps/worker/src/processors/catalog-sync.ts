import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Database } from '@unifyed/db';
import { platformConnections, products, variants } from '@unifyed/db/schema';
import { decrypt } from '@unifyed/utils';
import { env } from '../config.js';

interface CatalogSyncJob {
  connectionId: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  images: Array<{ src: string }>;
  variants: Array<{
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
    image_id: number | null;
    inventory_item_id: number;
    weight: number;
    weight_unit: string;
  }>;
}

export async function catalogSyncProcessor(
  job: Job<CatalogSyncJob>,
  db: Database
): Promise<void> {
  const { connectionId } = job.data;
  
  console.log(`📦 Starting catalog sync for connection ${connectionId}`);
  
  // Get connection
  const [connection] = await db
    .select()
    .from(platformConnections)
    .where(eq(platformConnections.id, connectionId))
    .limit(1);
  
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`);
  }
  
  if (connection.platform !== 'shopify') {
    throw new Error(`Catalog sync only supports Shopify, got ${connection.platform}`);
  }
  
  // Decrypt credentials
  const credentials = JSON.parse(
    decrypt(connection.credentials, env.CREDENTIALS_ENCRYPTION_KEY)
  ) as { accessToken: string; shopDomain: string };
  
  const { accessToken, shopDomain } = credentials;
  
  // Fetch products from Shopify
  // In production, this would paginate through all products
  const response = await fetch(
    `https://${shopDomain}.myshopify.com/admin/api/2024-01/products.json?limit=250`,
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }
  
  const data = (await response.json()) as { products: ShopifyProduct[] };
  
  console.log(`📦 Fetched ${data.products.length} products from Shopify`);
  
  // Upsert products and variants
  for (const shopifyProduct of data.products) {
    // Upsert product
    const [product] = await db
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
      await db
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
          target: [variants.externalId],
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
  await db
    .update(platformConnections)
    .set({
      lastSyncAt: new Date(),
      status: 'healthy',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(platformConnections.id, connectionId));
  
  console.log(`✅ Catalog sync completed for connection ${connectionId}`);
}
