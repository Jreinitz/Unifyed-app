import type { ShopifyProduct, ShopifyOrder, ShopifyShop } from './types.js';

export interface ShopifyClientConfig {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
}

export class ShopifyClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly apiVersion: string;

  constructor(config: ShopifyClientConfig) {
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion ?? '2024-01';
    this.baseUrl = `https://${config.shopDomain}.myshopify.com/admin/api/${this.apiVersion}`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // Shop
  async getShop(): Promise<ShopifyShop> {
    const data = await this.request<{ shop: ShopifyShop }>('/shop.json');
    return data.shop;
  }

  // Products
  async getProducts(params?: {
    limit?: number;
    page_info?: string;
  }): Promise<{ products: ShopifyProduct[]; nextPageInfo?: string }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.page_info) searchParams.set('page_info', params.page_info);
    
    const query = searchParams.toString();
    const endpoint = `/products.json${query ? `?${query}` : ''}`;
    
    const data = await this.request<{ products: ShopifyProduct[] }>(endpoint);
    
    // Handle pagination via Link header would be done here
    return { products: data.products };
  }

  async getProduct(id: number): Promise<ShopifyProduct> {
    const data = await this.request<{ product: ShopifyProduct }>(`/products/${id}.json`);
    return data.product;
  }

  // Orders
  async getOrders(params?: {
    status?: string;
    limit?: number;
    created_at_min?: string;
  }): Promise<ShopifyOrder[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.created_at_min) searchParams.set('created_at_min', params.created_at_min);
    
    const query = searchParams.toString();
    const endpoint = `/orders.json${query ? `?${query}` : ''}`;
    
    const data = await this.request<{ orders: ShopifyOrder[] }>(endpoint);
    return data.orders;
  }

  async getOrder(id: number): Promise<ShopifyOrder> {
    const data = await this.request<{ order: ShopifyOrder }>(`/orders/${id}.json`);
    return data.order;
  }

  // Inventory
  async getInventoryLevels(inventoryItemIds: number[]): Promise<Array<{
    inventory_item_id: number;
    location_id: number;
    available: number;
  }>> {
    const ids = inventoryItemIds.join(',');
    const data = await this.request<{
      inventory_levels: Array<{
        inventory_item_id: number;
        location_id: number;
        available: number;
      }>;
    }>(`/inventory_levels.json?inventory_item_ids=${ids}`);
    return data.inventory_levels;
  }

  // Webhooks
  async createWebhook(topic: string, address: string): Promise<{ id: number }> {
    const data = await this.request<{ webhook: { id: number } }>('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({
        webhook: { topic, address, format: 'json' },
      }),
    });
    return { id: data.webhook.id };
  }

  async deleteWebhook(id: number): Promise<void> {
    await this.request(`/webhooks/${id}.json`, { method: 'DELETE' });
  }

  async listWebhooks(): Promise<Array<{ id: number; topic: string; address: string }>> {
    const data = await this.request<{
      webhooks: Array<{ id: number; topic: string; address: string }>;
    }>('/webhooks.json');
    return data.webhooks;
  }
}
