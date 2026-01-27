'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard';

interface Variant {
  id: string;
  title: string;
  sku: string;
  price: number;
  inventoryQuantity: number;
  imageUrl: string | null;
}

interface Product {
  id: string;
  title: string;
  description: string | null;
  vendor: string | null;
  productType: string | null;
  status: string;
  imageUrl: string | null;
  variants: Variant[];
  createdAt: string;
  updatedAt: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/catalog/products?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch products');
      }

      const data = await res.json();
      setProducts(data.products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const token = localStorage.getItem('token');
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/catalog/sync`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });

      if (!res.ok) {
        throw new Error('Failed to sync products');
      }

      // Wait a bit then refresh
      await new Promise(resolve => setTimeout(resolve, 2000));
      fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.vendor?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8">
        <Header 
          title="Products" 
          subtitle="Manage your product catalog"
          actions={
            <div className="flex gap-3">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync from Shopify'}
              </button>
            </div>
          }
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-4 text-red-500 hover:text-red-700">
              Dismiss
            </button>
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="text-4xl mb-4">📦</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No products yet</h3>
            <p className="text-gray-500 mb-4">Connect your Shopify store and sync your products.</p>
            <a
              href="/dashboard/connections"
              className="inline-flex px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Connect Shopify
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={() => setSelectedProduct(product)}
                formatPrice={formatPrice}
              />
            ))}
          </div>
        )}

        {/* Product Detail Modal */}
        {selectedProduct && (
          <ProductModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            formatPrice={formatPrice}
          />
        )}
      </div>
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  onSelect: () => void;
  formatPrice: (cents: number) => string;
}

function ProductCard({ product, onSelect, formatPrice }: ProductCardProps) {
  const mainVariant = product.variants[0];
  const totalInventory = product.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
  const priceRange = product.variants.length > 1 
    ? `${formatPrice(Math.min(...product.variants.map(v => v.price)))} - ${formatPrice(Math.max(...product.variants.map(v => v.price)))}`
    : formatPrice(mainVariant?.price || 0);

  return (
    <div 
      onClick={onSelect}
      className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="aspect-square bg-gray-100 relative">
        {product.imageUrl ? (
          <img 
            src={product.imageUrl} 
            alt={product.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">
            📦
          </div>
        )}
        <span className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium ${
          product.status === 'active' 
            ? 'bg-green-100 text-green-700' 
            : 'bg-gray-100 text-gray-600'
        }`}>
          {product.status}
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-medium text-gray-900 truncate">{product.title}</h3>
        <p className="text-sm text-gray-500 mt-1">{priceRange}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">
            {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}
          </span>
          <span className={`text-xs ${totalInventory > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totalInventory} in stock
          </span>
        </div>
      </div>
    </div>
  );
}

interface ProductModalProps {
  product: Product;
  onClose: () => void;
  formatPrice: (cents: number) => string;
}

function ProductModal({ product, onClose, formatPrice }: ProductModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">{product.title}</h2>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
              {product.imageUrl ? (
                <img 
                  src={product.imageUrl} 
                  alt={product.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl text-gray-300">
                  📦
                </div>
              )}
            </div>

            <div>
              {product.vendor && (
                <p className="text-sm text-gray-500 mb-2">by {product.vendor}</p>
              )}
              
              {product.description && (
                <p className="text-gray-700 mb-4">{product.description}</p>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <span className={product.status === 'active' ? 'text-green-600' : 'text-gray-600'}>
                    {product.status}
                  </span>
                </div>
                {product.productType && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Type</span>
                    <span className="text-gray-900">{product.productType}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Variants */}
          <div className="mt-6">
            <h3 className="font-medium text-gray-900 mb-3">Variants</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Variant</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">SKU</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Price</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {product.variants.map((variant) => (
                    <tr key={variant.id}>
                      <td className="px-4 py-2 text-gray-900">{variant.title}</td>
                      <td className="px-4 py-2 text-gray-500">{variant.sku || '-'}</td>
                      <td className="px-4 py-2 text-right text-gray-900">{formatPrice(variant.price)}</td>
                      <td className={`px-4 py-2 text-right ${variant.inventoryQuantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {variant.inventoryQuantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
            <a
              href={`/dashboard/offers/new?product=${product.id}`}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Create Offer
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
