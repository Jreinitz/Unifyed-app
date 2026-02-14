'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard';
import { createClient } from '@/lib/supabase/client';

interface SessionTemplate {
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
  createdAt: string;
  updatedAt: string;
}

interface Offer {
  id: string;
  name: string;
  status: string;
}

interface Product {
  id: string;
  title: string;
}

const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', color: 'bg-black' },
  { id: 'youtube', name: 'YouTube', color: 'bg-red-500' },
  { id: 'twitch', name: 'Twitch', color: 'bg-purple-500' },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SessionTemplate | null>(null);

  const getToken = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/session-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOffersAndProducts = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const [offersRes, productsRes] = await Promise.all([
        fetch(`${apiUrl}/offers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/catalog/products`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (offersRes.ok) {
        const data = await offersRes.json();
        setOffers(data.offers || []);
      }

      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products || []);
      }
    } catch {
      // Silently fail - these are optional
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchOffersAndProducts();
  }, [fetchTemplates, fetchOffersAndProducts]);

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/session-templates/${templateId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to delete template');
      }

      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/session-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isDefault: true }),
      });

      if (!res.ok) {
        throw new Error('Failed to set default');
      }

      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/session-templates/${templateId}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to apply template');
      }

      const data = await res.json();
      alert(`Session prepared! ID: ${data.session.id}\n\nReady to go live with template: ${data.template.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template');
    }
  };

  const getPlatformBadges = (platforms: string[] | null) => {
    if (!platforms || platforms.length === 0) return null;
    
    return (
      <div className="flex gap-1">
        {platforms.map(p => {
          const platform = PLATFORMS.find(pl => pl.id === p);
          return platform ? (
            <span 
              key={p} 
              className={`px-2 py-0.5 text-xs rounded-full text-white ${platform.color}`}
            >
              {platform.name}
            </span>
          ) : null;
        })}
      </div>
    );
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
          title="Session Templates" 
          subtitle="Save your streaming configurations for quick setup"
          actions={
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Create Template
            </button>
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

        {templates.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
            <p className="text-gray-500 mb-4">Create templates to quickly set up your live sessions.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Create Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div 
                key={template.id} 
                className={`bg-white rounded-lg border ${template.isDefault ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200'} overflow-hidden hover:shadow-md transition-shadow`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{template.name}</h3>
                      {template.isDefault && (
                        <span className="text-xs text-indigo-600 font-medium">Default Template</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingTemplate(template)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {template.description && (
                    <p className="text-sm text-gray-500 mb-3">{template.description}</p>
                  )}

                  <div className="space-y-2 mb-4">
                    {getPlatformBadges(template.platforms)}
                    
                    {template.defaultOfferIds && template.defaultOfferIds.length > 0 && (
                      <p className="text-xs text-gray-500">
                        {template.defaultOfferIds.length} offer{template.defaultOfferIds.length !== 1 ? 's' : ''} preset
                      </p>
                    )}
                    
                    {template.defaultProductIds && template.defaultProductIds.length > 0 && (
                      <p className="text-xs text-gray-500">
                        {template.defaultProductIds.length} product{template.defaultProductIds.length !== 1 ? 's' : ''} preset
                      </p>
                    )}

                    {template.settings && (
                      <div className="flex gap-2">
                        {template.settings.autoStartChat && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">Auto Chat</span>
                        )}
                        {template.settings.autoAnnounce && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Auto Announce</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApplyTemplate(template.id)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      Use Template
                    </button>
                    {!template.isDefault && (
                      <button
                        onClick={() => handleSetDefault(template.id)}
                        className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        title="Set as Default"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {(showCreateModal || editingTemplate) && (
          <TemplateModal
            template={editingTemplate}
            offers={offers}
            products={products}
            onClose={() => {
              setShowCreateModal(false);
              setEditingTemplate(null);
            }}
            onSaved={() => {
              setShowCreateModal(false);
              setEditingTemplate(null);
              fetchTemplates();
            }}
          />
        )}
      </div>
    </div>
  );
}

interface TemplateModalProps {
  template: SessionTemplate | null;
  offers: Offer[];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}

function TemplateModal({ template, offers, products, onClose, onSaved }: TemplateModalProps) {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [platforms, setPlatforms] = useState<string[]>(template?.platforms || []);
  const [selectedOffers, setSelectedOffers] = useState<string[]>(template?.defaultOfferIds || []);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(template?.defaultProductIds || []);
  const [autoStartChat, setAutoStartChat] = useState(template?.settings?.autoStartChat ?? true);
  const [autoAnnounce, setAutoAnnounce] = useState(template?.settings?.autoAnnounce ?? false);
  const [defaultTitle, setDefaultTitle] = useState(template?.settings?.defaultTitle || '');
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name) {
      setError('Name is required');
      return;
    }

    try {
      setSubmitting(true);
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const body = {
        name,
        description: description || null,
        platforms: platforms.length > 0 ? platforms : null,
        defaultOfferIds: selectedOffers.length > 0 ? selectedOffers : null,
        defaultProductIds: selectedProducts.length > 0 ? selectedProducts : null,
        settings: {
          autoStartChat,
          autoAnnounce,
          defaultTitle: defaultTitle || undefined,
        },
        isDefault,
      };

      const res = await fetch(
        template 
          ? `${apiUrl}/session-templates/${template.id}`
          : `${apiUrl}/session-templates`,
        {
          method: template ? 'PATCH' : 'POST',
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || `Failed to ${template ? 'update' : 'create'} template`);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePlatform = (platformId: string) => {
    setPlatforms(prev => 
      prev.includes(platformId) 
        ? prev.filter(p => p !== platformId)
        : [...prev, platformId]
    );
  };

  const toggleOffer = (offerId: string) => {
    setSelectedOffers(prev => 
      prev.includes(offerId) 
        ? prev.filter(o => o !== offerId)
        : [...prev, offerId]
    );
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(p => p !== productId)
        : [...prev, productId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {template ? 'Edit Template' : 'Create Template'}
            </h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Basic Info */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Weekend Flash Sale"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this template for?"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Stream Title
              </label>
              <input
                type="text"
                value={defaultTitle}
                onChange={(e) => setDefaultTitle(e.target.value)}
                placeholder="e.g., Live Shopping Event"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Platforms */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platforms
              </label>
              <div className="flex gap-2">
                {PLATFORMS.map(platform => (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      platforms.includes(platform.id)
                        ? `${platform.color} text-white`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {platform.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Offers */}
            {offers.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Offers
                </label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg">
                  {offers.map(offer => (
                    <label 
                      key={offer.id}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOffers.includes(offer.id)}
                        onChange={() => toggleOffer(offer.id)}
                        className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700">{offer.name}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                        offer.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {offer.status}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Products */}
            {products.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Products
                </label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg">
                  {products.map(product => (
                    <label 
                      key={product.id}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                        className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700">{product.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Settings */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Settings
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoStartChat}
                  onChange={(e) => setAutoStartChat(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Auto-start chat aggregation</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAnnounce}
                  onChange={(e) => setAutoAnnounce(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Auto-announce offers when going live</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Set as default template</span>
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : template ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
