import crypto from 'crypto';

/**
 * Verify Shopify webhook signature
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  hmacHeader: string,
  webhookSecret: string
): boolean {
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  
  const generatedHmac = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('base64');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader, 'utf8'),
      Buffer.from(generatedHmac, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Parse webhook headers
 */
export interface ShopifyWebhookHeaders {
  hmac: string;
  topic: string;
  shopDomain: string;
  webhookId: string;
  apiVersion: string;
}

export function parseWebhookHeaders(
  headers: Record<string, string | string[] | undefined>
): ShopifyWebhookHeaders | null {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  const hmac = getHeader('x-shopify-hmac-sha256');
  const topic = getHeader('x-shopify-topic');
  const shopDomain = getHeader('x-shopify-shop-domain');
  const webhookId = getHeader('x-shopify-webhook-id');
  const apiVersion = getHeader('x-shopify-api-version');

  if (!hmac || !topic || !shopDomain || !webhookId) {
    return null;
  }

  return {
    hmac,
    topic,
    shopDomain,
    webhookId,
    apiVersion: apiVersion ?? 'unknown',
  };
}
