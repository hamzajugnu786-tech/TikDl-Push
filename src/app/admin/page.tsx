'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Download, Users, Clock, Shield, Settings, BarChart3, Key, Activity, Megaphone } from 'lucide-react';
import { Toaster, toast } from 'sonner';

interface AdminStats {
  totalDownloads: number;
  todayDownloads: number;
  activeProvider: string;
  avgResponseTime: number;
  errorRate: number;
}

interface InterstitialConfig {
  id?: string;
  enabled: boolean;
  countdownDuration: number;
  autoDownload: boolean;
  popupTitle: string;
  popupDescription: string;
}

interface AdPlacementConfig {
  id?: string;
  enabled: boolean;
  type: string;
  position: string;
  dimensions: string;
  priority: number;
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
  const [activeTab, setActiveTab] = useState<'stats' | 'providers' | 'ads' | 'settings'>('stats');

  // Interstitial config state
  const [interstitialConfig, setInterstitialConfig] = useState<InterstitialConfig>({
    enabled: true,
    countdownDuration: 5,
    autoDownload: true,
    popupTitle: 'Support free downloads',
    popupDescription: 'Your download will start automatically...',
  });

  // Ad placement config state
  const [adPlacementConfig, setAdPlacementConfig] = useState<AdPlacementConfig>({
    enabled: true,
    type: 'display',
    position: 'center',
    dimensions: '300x250',
    priority: 1,
  });

  // Settings values for dynamic display
  const [settingsValues, setSettingsValues] = useState({
    countdownDuration: 5,
    rateLimit: '20/h',
    retryAttempts: 3,
  });

  const [isSaving, setIsSaving] = useState(false);

  // Fetch config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/admin/config');
        const data = await res.json();
        if (data.success) {
          if (data.interstitial) {
            setInterstitialConfig({
              id: data.interstitial.id,
              enabled: data.interstitial.enabled,
              countdownDuration: data.interstitial.countdownDuration,
              autoDownload: data.interstitial.autoDownload,
              popupTitle: data.interstitial.popupTitle,
              popupDescription: data.interstitial.popupDescription,
            });
            setSettingsValues(prev => ({
              ...prev,
              countdownDuration: data.interstitial.countdownDuration,
            }));
          }
          if (data.ads && data.ads.length > 0) {
            const primaryAd = data.ads[0];
            setAdPlacementConfig({
              id: primaryAd.id,
              enabled: primaryAd.enabled,
              type: primaryAd.type,
              position: primaryAd.position,
              dimensions: primaryAd.dimensions,
              priority: primaryAd.priority,
            });
          }
          if (data.settings) {
            const settingsMap: Record<string, string> = {};
            for (const s of data.settings) {
              settingsMap[s.key] = s.value;
            }
            setSettingsValues(prev => ({
              ...prev,
              rateLimit: settingsMap['rateLimit'] || prev.rateLimit,
              retryAttempts: parseInt(settingsMap['retryAttempts'] || String(prev.retryAttempts)),
            }));
          }
        }
      } catch {
        // Use defaults on failure
      }
    };
    if (isAuthenticated) {
      fetchConfig();
    }
  }, [isAuthenticated]);

  // Fetch analytics stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/analytics');
        const data = await res.json();
        if (data.success) {
          setStats({
            totalDownloads: data.summary.totalDownloads || 0,
            todayDownloads: data.today.totalDownloads || 0,
            activeProvider: 'tikhub',
            avgResponseTime: data.summary.avgResponseMs || 0,
            errorRate: data.summary.successRate > 0 ? 100 - data.summary.successRate : 0,
          });
        }
      } catch {
        // Keep default stats
      }
    };
    if (isAuthenticated) {
      fetchStats();
    }
  }, [isAuthenticated]);

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

  // Save interstitial + ad config
  const handleSaveAdsConfig = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interstitial: {
            ...interstitialConfig,
          },
          ads: [adPlacementConfig],
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuration saved successfully');
        // Update local settings values
        setSettingsValues(prev => ({
          ...prev,
          countdownDuration: interstitialConfig.countdownDuration,
        }));
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch {
      toast.error('Network error — failed to save');
    } finally {
      setIsSaving(false);
    }
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
        <div className="flex gap-2 mb-8 flex-wrap">
          {(['stats', 'providers', 'ads', 'settings'] as const).map((tab) => (
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
              {tab === 'ads' && <Megaphone size={18} className="inline mr-2" />}
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

        {/* Ads / Interstitial tab */}
        {activeTab === 'ads' && (
          <div className="space-y-6">
            {/* Interstitial Config */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-xl font-semibold mb-6">Interstitial Configuration</h3>
              <div className="space-y-6">
                {/* Enabled toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Interstitial Enabled</div>
                    <div className="text-sm text-gray-500">Show countdown popup before downloads</div>
                  </div>
                  <button
                    onClick={() => setInterstitialConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      interstitialConfig.enabled ? 'bg-[#FE2C55]' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        interstitialConfig.enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Countdown seconds */}
                <div>
                  <label className="font-medium">Countdown Duration</label>
                  <p className="text-sm text-gray-500 mb-2">Seconds users wait before auto-download (min 3, max 30)</p>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={interstitialConfig.countdownDuration}
                    onChange={(e) => setInterstitialConfig(prev => ({
                      ...prev,
                      countdownDuration: Math.max(3, Math.min(30, parseInt(e.target.value) || 5)),
                    }))}
                    className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#FE2C55] transition-colors text-center"
                  />
                  <span className="text-sm text-gray-400 ml-2">seconds</span>
                </div>

                {/* Auto-download toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Auto-Download After Timer</div>
                    <div className="text-sm text-gray-500">Automatically trigger download when countdown reaches 0</div>
                  </div>
                  <button
                    onClick={() => setInterstitialConfig(prev => ({ ...prev, autoDownload: !prev.autoDownload }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      interstitialConfig.autoDownload ? 'bg-[#FE2C55]' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        interstitialConfig.autoDownload ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Popup title */}
                <div>
                  <label className="font-medium">Popup Title</label>
                  <p className="text-sm text-gray-500 mb-2">Heading displayed in the interstitial popup</p>
                  <input
                    type="text"
                    value={interstitialConfig.popupTitle}
                    onChange={(e) => setInterstitialConfig(prev => ({ ...prev, popupTitle: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-[#FE2C55] transition-colors"
                    placeholder="Support free downloads"
                  />
                </div>

                {/* Popup description */}
                <div>
                  <label className="font-medium">Popup Description</label>
                  <p className="text-sm text-gray-500 mb-2">Subtext shown below the countdown</p>
                  <textarea
                    value={interstitialConfig.popupDescription}
                    onChange={(e) => setInterstitialConfig(prev => ({ ...prev, popupDescription: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-[#FE2C55] transition-colors resize-none"
                    rows={2}
                    placeholder="Your download will start automatically..."
                  />
                </div>
              </div>
            </div>

            {/* Ad Placement Config */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-xl font-semibold mb-6">Advertisement Placement</h3>
              <div className="space-y-6">
                {/* Ad enabled toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Advertisement Enabled</div>
                    <div className="text-sm text-gray-500">Show advertisement area in the interstitial popup</div>
                  </div>
                  <button
                    onClick={() => setAdPlacementConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      adPlacementConfig.enabled ? 'bg-[#FE2C55]' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        adPlacementConfig.enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Ad size */}
                <div>
                  <label className="font-medium">Advertisement Size</label>
                  <p className="text-sm text-gray-500 mb-2">Dimensions of the ad placement area</p>
                  <select
                    value={adPlacementConfig.dimensions}
                    onChange={(e) => setAdPlacementConfig(prev => ({ ...prev, dimensions: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-[#FE2C55] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="300x250">300 × 250 (Medium Rectangle)</option>
                    <option value="728x90">728 × 90 (Leaderboard)</option>
                    <option value="320x50">320 × 50 (Mobile Banner)</option>
                    <option value="160x600">160 × 600 (Wide Skyscraper)</option>
                  </select>
                </div>

                {/* Ad position */}
                <div>
                  <label className="font-medium">Advertisement Position</label>
                  <p className="text-sm text-gray-500 mb-2">Position within the popup</p>
                  <select
                    value={adPlacementConfig.position}
                    onChange={(e) => setAdPlacementConfig(prev => ({ ...prev, position: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-[#FE2C55] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>

                {/* Ad type */}
                <div>
                  <label className="font-medium">Advertisement Type</label>
                  <p className="text-sm text-gray-500 mb-2">Type of ad content to display</p>
                  <select
                    value={adPlacementConfig.type}
                    onChange={(e) => setAdPlacementConfig(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-[#FE2C55] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="display">Display</option>
                    <option value="video">Video</option>
                    <option value="native">Native</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleSaveAdsConfig}
              disabled={isSaving}
              className="w-full py-4 bg-[#FE2C55] hover:bg-[#FE2C55]/90 text-white font-semibold rounded-2xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Shield size={20} />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* Settings tab */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-6">
              <h3 className="text-xl font-semibold mb-4">General Settings</h3>
              <p className="text-gray-400 text-sm mb-4">
                These values reflect the current configuration. Modify Interstitial settings in the Ads tab.
              </p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Ad Countdown Duration</div>
                    <div className="text-sm text-gray-500">Seconds users wait before download</div>
                  </div>
                  <span className="text-[#25F4EE] font-bold">{settingsValues.countdownDuration}s</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Rate Limit (per IP)</div>
                    <div className="text-sm text-gray-500">Max requests per hour</div>
                  </div>
                  <span className="text-[#25F4EE] font-bold">{settingsValues.rateLimit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Retry Attempts</div>
                    <div className="text-sm text-gray-500">Max retry count per request</div>
                  </div>
                  <span className="text-[#25F4EE] font-bold">{settingsValues.retryAttempts}</span>
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
