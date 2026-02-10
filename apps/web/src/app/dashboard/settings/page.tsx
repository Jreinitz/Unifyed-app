'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/dashboard';
import { createClient } from '@/lib/supabase/client';

interface Creator {
  id: string;
  email: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
}

interface ConnectStatus {
  connected: boolean;
  accountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'account' | 'payments' | 'notifications'>('account');
  const [creator, setCreator] = useState<Creator | null>(null);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');

  const getToken = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }, []);

  useEffect(() => {
    // Check URL params for Stripe Connect return
    if (searchParams.get('connected') === 'true') {
      setActiveTab('payments');
      setMessage({ type: 'success', text: 'Stripe Connect setup updated!' });
    }
    if (searchParams.get('refresh') === 'true') {
      setActiveTab('payments');
    }

    fetchData();
  }, [searchParams]);

  const fetchData = async () => {
    try {
      const token = await getToken();
      if (!token) {
        router.push('/login');
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      // Fetch creator profile
      const profileRes = await fetch(`${apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!profileRes.ok) {
        throw new Error('Failed to fetch profile');
      }

      const profileData = await profileRes.json();
      setCreator(profileData.creator);
      setName(profileData.creator.name);
      setHandle(profileData.creator.handle || '');

      // Fetch Stripe Connect status
      const connectRes = await fetch(`${apiUrl}/payments/connect/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (connectRes.ok) {
        const connectData = await connectRes.json();
        setConnectStatus(connectData);
      }
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to load settings' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/auth/profile`, {
        method: 'PATCH',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, handle: handle || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to update profile');
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      fetchData();
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to save' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConnectStripe = async () => {
    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/payments/connect/onboard`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });

      if (!res.ok) {
        throw new Error('Failed to start onboarding');
      }

      const data = await res.json();
      
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else if (data.status === 'active') {
        setMessage({ type: 'success', text: 'Stripe account is already active!' });
        fetchData();
      }
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to connect Stripe' 
      });
    }
  };

  const handleStripeDashboard = async () => {
    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/payments/connect/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        window.open(data.dashboardUrl, '_blank');
      }
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: 'Failed to open dashboard' 
      });
    }
  };

  const handleDisconnectStripe = async () => {
    if (!confirm('Are you sure you want to disconnect your Stripe account?')) {
      return;
    }

    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/payments/connect`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to disconnect');
      }

      setMessage({ type: 'success', text: 'Stripe account disconnected' });
      fetchData();
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to disconnect' 
      });
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
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
        <Header title="Settings" subtitle="Manage your account and preferences" />

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-700' 
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
            <button 
              onClick={() => setMessage(null)}
              className="ml-4 opacity-60 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(['account', 'payments', 'notifications'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Profile</h3>
              
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={creator?.email || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Profile Handle
                  </label>
                  <div className="flex items-center">
                    <span className="text-gray-500 text-sm mr-1">/c/</span>
                    <input
                      type="text"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="your-handle"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Your public profile will be at {process.env['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000'}/c/{handle || 'your-handle'}
                  </p>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-lg border border-red-200 p-6">
              <h3 className="text-lg font-medium text-red-600 mb-4">Danger Zone</h3>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
              >
                Log Out
              </button>
            </div>
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Stripe Connect</h3>
              <p className="text-sm text-gray-600 mb-6">
                Connect your Stripe account to receive payments directly from customers. 
                We charge a 10% platform fee on all sales.
              </p>

              {connectStatus?.connected ? (
                <div>
                  {/* Status */}
                  <div className="p-4 bg-gray-50 rounded-lg mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${
                        connectStatus.chargesEnabled ? 'bg-green-500' : 'bg-yellow-500'
                      }`}></span>
                      <span className="font-medium text-gray-900">
                        {connectStatus.chargesEnabled && connectStatus.detailsSubmitted
                          ? 'Account Active'
                          : 'Setup Incomplete'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Account ID: {connectStatus.accountId}
                    </p>
                  </div>

                  {/* Capabilities */}
                  <div className="flex gap-4 mb-6">
                    <div className={`flex items-center gap-2 text-sm ${
                      connectStatus.chargesEnabled ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {connectStatus.chargesEnabled ? '✓' : '○'} Can accept payments
                    </div>
                    <div className={`flex items-center gap-2 text-sm ${
                      connectStatus.payoutsEnabled ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {connectStatus.payoutsEnabled ? '✓' : '○'} Can receive payouts
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    {connectStatus.chargesEnabled && connectStatus.detailsSubmitted ? (
                      <button
                        onClick={handleStripeDashboard}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                      >
                        View Stripe Dashboard
                      </button>
                    ) : (
                      <button
                        onClick={handleConnectStripe}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                      >
                        Complete Setup
                      </button>
                    )}
                    <button
                      onClick={handleDisconnectStripe}
                      className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleConnectStripe}
                  className="px-6 py-3 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Connect with Stripe
                </button>
              )}
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Preferences</h3>
              <p className="text-sm text-gray-500">
                Notification settings will be available soon.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
