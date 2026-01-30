'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ChecklistItem {
  status: 'ready' | 'warning' | 'error';
  message: string;
}

interface PlatformDetails {
  target: string[];
  connected: string[];
  missing: string[];
}

interface OfferItem {
  id: string;
  name: string;
  status: string;
}

interface Checklist {
  platforms: ChecklistItem & { details: PlatformDetails };
  streaming: ChecklistItem & { hasRestream: boolean };
  offers: ChecklistItem & { items: OfferItem[] };
  products: ChecklistItem & { count: number };
  overall: {
    ready: boolean;
    warnings: string[];
  };
}

interface SessionTemplate {
  id: string;
  name: string;
  description: string | null;
  platforms: string[] | null;
  isDefault: boolean;
}

interface PreparedSession {
  id: string;
  title: string | null;
  status: string;
}

interface PreStreamChecklistProps {
  sessionId?: string;
  onClose: () => void;
  onGoLive?: (session: PreparedSession) => void;
}

const STATUS_ICONS = {
  ready: (
    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
};

export function PreStreamChecklist({ sessionId, onClose, onGoLive }: PreStreamChecklistProps) {
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [session, setSession] = useState<PreparedSession | null>(null);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  // If no sessionId provided, we're in "prepare new session" mode
  const isNewSession = !sessionId;

  const fetchTemplates = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/live-sessions/templates`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        
        // Auto-select default template
        const defaultTemplate = data.templates.find((t: SessionTemplate) => t.isDefault);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        }
      }
    } catch {
      // Ignore - templates are optional
    }
  }, []);

  const fetchChecklist = useCallback(async (sessId: string) => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/live-sessions/${sessId}/checklist`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch checklist');
      }

      const data = await res.json();
      setChecklist(data.checklist);
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  }, []);

  const prepareSession = async () => {
    setPreparing(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/live-sessions/prepare`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title || undefined,
          templateId: selectedTemplateId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to prepare session');
      }

      const data = await res.json();
      const newSession = data.session;
      setSession(newSession);

      // Now fetch the checklist for this session
      await fetchChecklist(newSession.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare session');
    } finally {
      setPreparing(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchChecklist(sessionId);
    } else {
      fetchTemplates();
      setLoading(false);
    }
  }, [sessionId, fetchChecklist, fetchTemplates]);

  // New session mode - show template selection
  if (isNewSession && !session) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Prepare to Go Live</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stream Title (optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Flash Sale Friday!"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {templates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Use Template
                  </label>
                  <div className="space-y-2">
                    <button
                      onClick={() => setSelectedTemplateId(null)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        selectedTemplateId === null
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-medium text-gray-900">No template</span>
                      <p className="text-sm text-gray-500">Start with default settings</p>
                    </button>
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          selectedTemplateId === template.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{template.name}</span>
                          {template.isDefault && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Default</span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-gray-500">{template.description}</p>
                        )}
                        {template.platforms && template.platforms.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {template.platforms.map((p) => (
                              <span key={p} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={prepareSession}
                disabled={preparing}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {preparing ? 'Preparing...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading checklist...</p>
        </div>
      </div>
    );
  }

  // Checklist view
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Pre-Stream Checklist</h2>
              {session?.title && (
                <p className="text-sm text-gray-500">{session.title}</p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {checklist && (
            <div className="space-y-4">
              {/* Platforms */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                {STATUS_ICONS[checklist.platforms.status]}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Platforms</p>
                  <p className="text-sm text-gray-600">{checklist.platforms.message}</p>
                  {checklist.platforms.details.missing.length > 0 && (
                    <p className="text-sm text-yellow-600 mt-1">
                      Missing: {checklist.platforms.details.missing.join(', ')}
                    </p>
                  )}
                </div>
              </div>

              {/* Streaming Setup */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                {STATUS_ICONS[checklist.streaming.status]}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Streaming Setup</p>
                  <p className="text-sm text-gray-600">{checklist.streaming.message}</p>
                </div>
              </div>

              {/* Offers */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                {STATUS_ICONS[checklist.offers.status]}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Offers</p>
                  <p className="text-sm text-gray-600">{checklist.offers.message}</p>
                  {checklist.offers.items.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {checklist.offers.items.map((offer) => (
                        <span
                          key={offer.id}
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            offer.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {offer.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Products */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                {STATUS_ICONS[checklist.products.status]}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Products</p>
                  <p className="text-sm text-gray-600">{checklist.products.message}</p>
                </div>
              </div>

              {/* Overall Status */}
              {checklist.overall.warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="font-medium text-yellow-800">Warnings</p>
                  <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                    {checklist.overall.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {checklist.overall.ready && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="font-medium text-green-800 flex items-center gap-2">
                    {STATUS_ICONS.ready}
                    Ready to go live!
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Start your stream in OBS or your preferred streaming software.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
            <div className="flex gap-2">
              <a
                href="/dashboard/connections"
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
              >
                Manage Connections
              </a>
              {checklist?.overall.ready && session && onGoLive && (
                <button
                  onClick={() => onGoLive(session)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  I'm Ready - Go Live!
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
