'use client';

import { useState } from 'react';
import { RefreshCw, Download, Users, Clock, Shield, Settings, BarChart3, Key, Activity } from 'lucide-react';
import { Toaster, toast } from 'sonner';

interface AdminStats {
  totalDownloads: number;
  todayDownloads: number;
  activeProvider: string;
  avgResponseTime: number;
  errorRate: number;
}

const AdminDashboard = () => {
  // Simple admin auth — password stored in env
  const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';

  // Check session using lazy initializer (avoids setState in effect)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      const session = sessionStorage.getItem('tikdl_admin_session');
      return session === 'authenticated';
    } catch {
      return false;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [stats, setStats] = useState<AdminStats>({
    totalDownloads: 0,
    todayDownloads: 0,
    activeProvider: 'tikhub',
    avgResponseTime: 0,
    errorRate: 0,
  });
  const [activeTab, setActiveTab] = useState<'stats' | 'settings' | 'providers'>('stats');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('tikdl_admin_session', 'authenticated');
      toast.success('Admin access granted');
    } else {
      toast.error('Invalid password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('tikdl_admin_session');
    setLoginPassword('');
    toast.success('Logged out');
  };

  // Not authenticated — show login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center px-4">
        <Toaster position="top-center" richColors closeButton />
        <div className="glass max-w-md w-full rounded-3xl p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-[#FE2C55] rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">♪</div>
            <h1 className="text-2xl font-bold">TikDL Admin</h1>
            <p className="text-gray-400 text-sm mt-2">Enter admin password to continue</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-[#FE2C55] transition-colors"
            />
            <button
              type="submit"
              className="w-full bg-[#FE2C55] hover:bg-[#FE2C55]/90 py-3 rounded-2xl font-semibold transition-colors"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Authenticated — show dashboard
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <Toaster position="top-center" richColors closeButton />

      {/* Header */}
      <nav className="sticky top-0 z-50 glass border-b border-white/10 bg-black/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#FE2C55] rounded-xl flex items-center justify-center text-xl font-bold">♪</div>
            <span className="font-bold text-2xl tracking-tighter">TikDL Admin</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {(['stats', 'providers', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-2xl font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-[#FE2C55] text-white'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              {tab === 'stats' && <BarChart3 size={18} className="inline mr-2" />}
              {tab === 'providers' && <Key size={18} className="inline mr-2" />}
              {tab === 'settings' && <Settings size={18} className="inline mr-2" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Stats tab */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Download size={20} className="text-[#25F4EE]" />
                <span className="text-gray-400 text-sm">Total Downloads</span>
              </div>
              <div className="text-3xl font-bold">{stats.totalDownloads.toLocaleString()}</div>
            </div>
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Activity size={20} className="text-[#FE2C55]" />
                <span className="text-gray-400 text-sm">Today&apos;s Downloads</span>
              </div>
              <div className="text-3xl font-bold">{stats.todayDownloads.toLocaleString()}</div>
            </div>
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Clock size={20} className="text-[#25F4EE]" />
                <span className="text-gray-400 text-sm">Avg Response</span>
              </div>
              <div className="text-3xl font-bold">{stats.avgResponseTime}ms</div>
            </div>
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield size={20} className="text-[#FE2C55]" />
                <span className="text-gray-400 text-sm">Error Rate</span>
              </div>
              <div className="text-3xl font-bold">{stats.errorRate}%</div>
            </div>
          </div>
        )}

        {/* Providers tab */}
        {activeTab === 'providers' && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-6">
              <h3 className="text-xl font-semibold mb-4">Provider Configuration</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                  <div>
                    <div className="font-medium">TikHub Provider</div>
                    <div className="text-sm text-gray-500">Primary TikTok video fetching service</div>
                  </div>
                  <span className="px-3 py-1 rounded-lg bg-[#25F4EE]/20 text-[#25F4EE] text-sm font-medium">
                    {stats.activeProvider === 'tikhub' ? 'Active' : 'Available'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                  <div>
                    <div className="font-medium">RapidAPI Provider</div>
                    <div className="text-sm text-gray-500">Fallback provider for redundancy</div>
                  </div>
                  <span className="px-3 py-1 rounded-lg bg-[#FE2C55]/20 text-[#FE2C55] text-sm font-medium">
                    {stats.activeProvider === 'rapidapi' ? 'Active' : 'Fallback'}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl p-6">
              <h3 className="text-xl font-semibold mb-4">Environment Keys</h3>
              <p className="text-gray-400 text-sm mb-4">
                API keys are configured via environment variables on your deployment platform (Vercel, etc.).
                Never hardcode keys in source code.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  <Key size={16} className="text-gray-400" />
                  <span className="text-sm">TIKHUB_API_KEY</span>
                  <span className="text-xs text-gray-500 ml-auto">Set via env var</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  <Key size={16} className="text-gray-400" />
                  <span className="text-sm">RAPIDAPI_KEY</span>
                  <span className="text-xs text-gray-500 ml-auto">Set via env var</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  <Key size={16} className="text-gray-400" />
                  <span className="text-sm">PROVIDER_NAME</span>
                  <span className="text-xs text-gray-500 ml-auto">tikhub | rapidapi</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings tab */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-6">
              <h3 className="text-xl font-semibold mb-4">General Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Ad Countdown Duration</div>
                    <div className="text-sm text-gray-500">Seconds users wait before download</div>
                  </div>
                  <span className="text-[#25F4EE] font-bold">5s</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Rate Limit (per IP)</div>
                    <div className="text-sm text-gray-500">Max requests per hour</div>
                  </div>
                  <span className="text-[#25F4EE] font-bold">20/h</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Retry Attempts</div>
                    <div className="text-sm text-gray-500">Max retry count per request</div>
                  </div>
                  <span className="text-[#25F4EE] font-bold">3</span>
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl p-6">
              <h3 className="text-xl font-semibold mb-4">Supabase Integration</h3>
              <p className="text-gray-400 text-sm">
                Connect Supabase for persistent analytics, user authentication, and admin session management.
                Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
