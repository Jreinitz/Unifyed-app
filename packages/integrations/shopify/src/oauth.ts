import crypto from 'crypto';

export interface ShopifyOAuthConfig {
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
}

/**
 * Generate Shopify OAuth authorization URL
 */
export function generateAuthUrl(
  shopDomain: string,
  config: ShopifyOAuthConfig,
  state: string
): string {
  const cleanDomain = shopDomain.replace('.myshopify.com', '');
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: config.scopes,
    redirect_uri: config.redirectUri,
    state,
  });

  return `https://${cleanDomain}.myshopify.com/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  shopDomain: string,
  code: string,
  config: ShopifyOAuthConfig
): Promise<{ accessToken: string; scope: string }> {
  const cleanDomain = shopDomain.replace('.myshopify.com', '');
  
  const response = await fetch(
    `https://${cleanDomain}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    scope: data.scope,
  };
}

/**
 * Verify OAuth callback HMAC
 */
export function verifyOAuthCallback(
  query: Record<string, string>,
  clientSecret: string
): boolean {
  const { hmac, ...rest } = query;
  
  if (!hmac) return false;
  
  // Sort and build query string
  const sortedParams = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('&');
  
  const generatedHmac = crypto
    .createHmac('sha256', clientSecret)
    .update(sortedParams)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(hmac, 'utf8'),
    Buffer.from(generatedHmac, 'utf8')
  );
}
