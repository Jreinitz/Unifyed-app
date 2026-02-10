'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  completed: boolean;
  ctaText: string;
}

export function OnboardingWizard() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Check connections (e-commerce + streaming)
      const [connectionsRes, toolsRes, productsRes, offersRes] = await Promise.all([
        fetch(`${apiUrl}/connections`, { headers }).then(r => r.ok ? r.json() : { connections: [] }),
        fetch(`${apiUrl}/connections/tools`, { headers }).then(r => r.ok ? r.json() : { connections: [] }),
        fetch(`${apiUrl}/catalog/products?limit=1`, { headers }).then(r => r.ok ? r.json() : { products: [] }),
        fetch(`${apiUrl}/offers?limit=1`, { headers }).then(r => r.ok ? r.json() : { offers: [] }),
      ]);

      const hasEcommerce = (connectionsRes.connections || []).some(
        (c: { platform: string; status: string }) => c.platform === 'shopify' && (c.status === 'healthy' || c.status === 'connected')
      );
      const hasStreaming = (connectionsRes.connections || []).some(
        (c: { status: string }) => c.status === 'healthy' || c.status === 'connected'
      ) || (toolsRes.connections || []).some(
        (c: { status: string }) => c.status === 'connected'
      );
      const hasProducts = (productsRes.products || []).length > 0;
      const hasOffers = (offersRes.offers || []).length > 0;

      const onboardingSteps: OnboardingStep[] = [
        {
          id: 'connect-store',
          title: 'Connect your store',
          description: 'Link your Shopify store to sync products and process orders.',
          icon: '🛍️',
          href: '/dashboard/connections',
          completed: hasEcommerce,
          ctaText: 'Connect Shopify',
        },
        {
          id: 'connect-streaming',
          title: 'Connect streaming platforms',
          description: 'Link TikTok, YouTube, Twitch, or Restream to track your streams.',
          icon: '📡',
          href: '/dashboard/connections',
          completed: hasStreaming,
          ctaText: 'Connect Platforms',
        },
        {
          id: 'sync-products',
          title: 'Sync your products',
          description: 'Your product catalog will sync automatically from Shopify.',
          icon: '📦',
          href: '/dashboard/products',
          completed: hasProducts,
          ctaText: 'View Products',
        },
        {
          id: 'create-offer',
          title: 'Create your first offer',
          description: 'Set up a discount or deal to share during your next stream.',
          icon: '🏷️',
          href: '/dashboard/offers',
          completed: hasOffers,
          ctaText: 'Create Offer',
        },
      ];

      setSteps(onboardingSteps);
    } catch {
      // Silently fail - onboarding is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check if user previously dismissed onboarding
    const wasDismissed = localStorage.getItem('unifyed_onboarding_dismissed');
    if (wasDismissed) {
      setDismissed(true);
      setLoading(false);
      return;
    }
    checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  const completedCount = steps.filter(s => s.completed).length;
  const allCompleted = steps.length > 0 && completedCount === steps.length;

  const handleDismiss = () => {
    localStorage.setItem('unifyed_onboarding_dismissed', 'true');
    setDismissed(true);
  };

  // Don't show if loading, dismissed, or all steps complete
  if (loading || dismissed || allCompleted) return null;

  const progressPercent = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Get started with Unifyed</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Complete these steps to start selling during your streams.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-1.5">
          <span>{completedCount} of {steps.length} completed</span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-center gap-4 p-4 rounded-lg transition-colors ${
              step.completed
                ? 'bg-white/60 opacity-70'
                : 'bg-white shadow-sm'
            }`}
          >
            {/* Step number / check */}
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step.completed
                ? 'bg-green-100 text-green-600'
                : 'bg-indigo-100 text-indigo-600'
            }`}>
              {step.completed ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                index + 1
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                {step.title}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
            </div>

            {/* Icon */}
            <span className="text-xl flex-shrink-0">{step.icon}</span>

            {/* CTA */}
            {!step.completed && (
              <Link
                href={step.href}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {step.ctaText}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
