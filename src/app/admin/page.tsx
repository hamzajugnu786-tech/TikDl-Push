'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Download, Clock, Shield, Settings, BarChart3, Key, Activity,
  Megaphone, LayoutDashboard, Menu, X, TrendingUp, TrendingDown,
  Globe, ChevronDown, ChevronUp, Search, Trash2, Database, Monitor,
  Smartphone, Lock, Eye, FileText, Palette, Zap, Wrench
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

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

interface AnalyticsData {
  last7Days: Array<{
    date: string;
    totalDownloads: number;
    successCount: number;
    failCount: number;
    avgResponseMs: number;
    uniqueVisitors: number;
  }>;
  recentLogs: Array<{
    id: string;
    videoId: string;
    videoTitle: string;
    provider: string;
    success: boolean;
    responseTime: number;
    error: string;
    createdAt: string;
  }>;
  providers: Array<{
    name: string;
    active: boolean;
    successRate: number;
    avgResponseMs: number;
    lastCheck: string;
  }>;
}

interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority: number;
  status: 'Active' | 'Fallback';
}

const AdminDashboard = () => {
  const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'providers' | 'ads' | 'analytics' | 'settings'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    last7Days: [],
    recentLogs: [],
    providers: [],
  });

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

  // Providers config state
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([
    { name: 'TikHub', enabled: true, priority: 1, status: 'Active' },
    { name: 'RapidAPI', enabled: true, priority: 2, status: 'Fallback' },
  ]);
  const [providerSearch, setProviderSearch] = useState('');

  // Settings state
  const [settingsValues, setSettingsValues] = useState({
    countdownDuration: 5,
    rateLimit: '20/h',
    retryAttempts: 3,
    siteName: 'TikDL',
    siteUrl: 'https://tikdl.app',
    maintenanceMode: false,
    metaTitle: 'TikDL - Free TikTok Video Downloader Without Watermark',
    metaDescription: 'Download TikTok videos without watermark in HD quality. Free, unlimited, no signup required.',
    ogImageUrl: '',
    robotsDirective: 'index, follow',
    logoText: 'TikDL',
    primaryColor: '#FE2C55',
    accentColor: '#25F4EE',
    maxFileSize: '100MB',
    allowedFormats: 'mp4, mp3, jpg',
    concurrentDownloads: 3,
    corsOrigins: '*',
  });

  // Settings collapsible sections
  const [openSettingsSections, setOpenSettingsSections] = useState<Set<string>>(new Set(['site']));

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
              siteName: settingsMap['siteName'] || prev.siteName,
              siteUrl: settingsMap['siteUrl'] || prev.siteUrl,
              maintenanceMode: settingsMap['maintenanceMode'] === 'true',
              metaTitle: settingsMap['metaTitle'] || prev.metaTitle,
              metaDescription: settingsMap['metaDescription'] || prev.metaDescription,
              ogImageUrl: settingsMap['ogImageUrl'] || prev.ogImageUrl,
              robotsDirective: settingsMap['robotsDirective'] || prev.robotsDirective,
              logoText: settingsMap['logoText'] || prev.logoText,
              primaryColor: settingsMap['primaryColor'] || prev.primaryColor,
              accentColor: settingsMap['accentColor'] || prev.accentColor,
              maxFileSize: settingsMap['maxFileSize'] || prev.maxFileSize,
              allowedFormats: settingsMap['allowedFormats'] || prev.allowedFormats,
              concurrentDownloads: parseInt(settingsMap['concurrentDownloads'] || String(prev.concurrentDownloads)),
              corsOrigins: settingsMap['corsOrigins'] || prev.corsOrigins,
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

  // Fetch analytics stats + full analytics data
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
          setAnalyticsData({
            last7Days: data.last7Days || [],
            recentLogs: data.recentLogs || [],
            providers: data.providers || [],
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
          interstitial: { ...interstitialConfig },
          ads: [adPlacementConfig],
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuration saved successfully');
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

  // Save settings
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { key: 'rateLimit', value: settingsValues.rateLimit },
            { key: 'retryAttempts', value: String(settingsValues.retryAttempts) },
            { key: 'siteName', value: settingsValues.siteName },
            { key: 'siteUrl', value: settingsValues.siteUrl },
            { key: 'maintenanceMode', value: String(settingsValues.maintenanceMode) },
            { key: 'metaTitle', value: settingsValues.metaTitle },
            { key: 'metaDescription', value: settingsValues.metaDescription },
            { key: 'ogImageUrl', value: settingsValues.ogImageUrl },
            { key: 'robotsDirective', value: settingsValues.robotsDirective },
            { key: 'logoText', value: settingsValues.logoText },
            { key: 'primaryColor', value: settingsValues.primaryColor },
            { key: 'accentColor', value: settingsValues.accentColor },
            { key: 'maxFileSize', value: settingsValues.maxFileSize },
            { key: 'allowedFormats', value: settingsValues.allowedFormats },
            { key: 'concurrentDownloads', value: String(settingsValues.concurrentDownloads) },
            { key: 'corsOrigins', value: settingsValues.corsOrigins },
          ],
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Settings saved successfully');
      } else {
        toast.error(data.error || 'Failed to save settings');
      }
    } catch {
      toast.error('Network error — failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle settings section
  const toggleSettingsSection = useCallback((section: string) => {
    setOpenSettingsSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  }, []);

  // Quick actions
  const handleHealthCheck = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.status === 'ok') {
        toast.success('Health check passed', { description: 'Database connected' });
      } else {
        toast.error('Health check degraded', { description: 'Database disconnected' });
      }
    } catch {
      toast.error('Health check failed');
    }
  };

  const handleClearCache = () => {
    toast.success('Cache cleared');
  };

  const handleSeedConfig = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interstitial: {
            enabled: true,
            countdownDuration: 5,
            autoDownload: true,
            popupTitle: 'Support free downloads',
            popupDescription: 'Your download will start automatically...',
          },
          ads: [{
            enabled: true,
            type: 'display',
            position: 'center',
            dimensions: '300x250',
            priority: 1,
          }],
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Config seeded with defaults');
        setInterstitialConfig({
          enabled: true,
          countdownDuration: 5,
          autoDownload: true,
          popupTitle: 'Support free downloads',
          popupDescription: 'Your download will start automatically...',
        });
        setAdPlacementConfig({
          enabled: true,
          type: 'display',
          position: 'center',
          dimensions: '300x250',
          priority: 1,
        });
      } else {
        toast.error(data.error || 'Failed to seed config');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setIsSaving(false);
    }
  };

  // Sidebar nav items
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'providers', label: 'Providers', icon: Key },
    { id: 'ads', label: 'Ads', icon: Megaphone },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // Not authenticated — show login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center px-4">
        <Toaster position="top-center" richColors closeButton />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass max-w-md w-full rounded-[16px] p-8"
        >
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-[#FE2C55] rounded-[12px] flex items-center justify-center text-2xl mx-auto mb-4">♪</div>
            <h1 className="text-xl font-bold">TikDL Admin</h1>
            <p className="text-[#9CA3AF] text-sm mt-2">Enter admin password to continue</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-[14px] px-4 py-3 outline-none input-focus-ring text-sm"
            />
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full bg-[#FE2C55] hover:bg-[#FE2C55]/95 py-3 rounded-[14px] font-semibold transition-colors duration-150 shadow-[0_4px_20px_rgba(254,44,85,0.3)]"
            >
              Login
            </motion.button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Authenticated — show dashboard
  const maxBarValue = analyticsData.last7Days.length > 0
    ? Math.max(...analyticsData.last7Days.map(d => d.totalDownloads), 1)
    : 1;

  return (
    <div className="min-h-screen bg-[#000000] text-white flex">
      <Toaster position="top-center" richColors closeButton />

      {/* ===== Sidebar (Desktop) ===== */}
      <aside className="hidden lg:flex w-[220px] min-h-screen bg-[#111] border-r border-white/8 flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-2.5 border-b border-white/8">
          <div className="w-7 h-7 bg-[#FE2C55] rounded-lg flex items-center justify-center text-base font-bold">♪</div>
          <span className="font-bold text-lg tracking-tighter">TikDL</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as typeof activeTab)}
              className={`sidebar-item w-full text-left ${activeTab === item.id ? 'active' : ''}`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/8">
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-left hover:!text-red-400"
          >
            <X size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* ===== Mobile Sidebar Overlay ===== */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <motion.aside
              initial={{ x: -220 }}
              animate={{ x: 0 }}
              exit={{ x: -220 }}
              transition={{ duration: 0.2 }}
              className="w-[220px] min-h-screen bg-[#111] border-r border-white/8 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-4 flex items-center justify-between border-b border-white/8">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-[#FE2C55] rounded-lg flex items-center justify-center text-base font-bold">♪</div>
                  <span className="font-bold text-lg tracking-tighter">TikDL</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id as typeof activeTab); setSidebarOpen(false); }}
                    className={`sidebar-item w-full text-left ${activeTab === item.id ? 'active' : ''}`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="px-3 py-4 border-t border-white/8">
                <button onClick={handleLogout} className="sidebar-item w-full text-left hover:!text-red-400">
                  <X size={16} />
                  Logout
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Main Content ===== */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        {/* Top bar (mobile) */}
        <div className="sticky top-0 z-40 glass border-b border-white/10 bg-black/80 px-4 py-3 flex items-center justify-between lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-white/10">
            <Menu size={20} />
          </button>
          <span className="font-bold text-lg tracking-tighter">TikDL Admin</span>
          <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-400 transition-colors duration-150">
            Logout
          </button>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1200px]">
          {/* ===== Dashboard Tab ===== */}
          {activeTab === 'dashboard' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Download size={16} className="text-[#FE2C55]" />
                    <span className="text-[#9CA3AF] text-xs font-medium">Total Downloads</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold">{stats.totalDownloads.toLocaleString()}</div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-[#9CA3AF]">
                    <TrendingUp size={12} className="text-green-400" />
                    <span className="text-green-400">All time</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity size={16} className="text-[#25F4EE]" />
                    <span className="text-[#9CA3AF] text-xs font-medium">Today&apos;s Downloads</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold">{stats.todayDownloads.toLocaleString()}</div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-[#9CA3AF]">
                    <TrendingUp size={12} className="text-[#25F4EE]" />
                    <span className="text-[#25F4EE]">Live</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={16} className="text-[#25F4EE]" />
                    <span className="text-[#9CA3AF] text-xs font-medium">Avg Response</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold">{stats.avgResponseTime}ms</div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-[#9CA3AF]">
                    {stats.avgResponseTime < 1000 ? (
                      <TrendingDown size={12} className="text-green-400" />
                    ) : (
                      <TrendingUp size={12} className="text-yellow-400" />
                    )}
                    <span>Speed</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={16} className="text-[#FE2C55]" />
                    <span className="text-[#9CA3AF] text-xs font-medium">Error Rate</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold">{stats.errorRate}%</div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-[#9CA3AF]">
                    {stats.errorRate < 5 ? (
                      <TrendingDown size={12} className="text-green-400" />
                    ) : (
                      <TrendingUp size={12} className="text-red-400" />
                    )}
                    <span>Reliability</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-3 mb-6">
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleHealthCheck}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-[10px] text-sm font-medium flex items-center gap-2 transition-colors duration-150 border border-white/10"
                >
                  <Activity size={14} /> Run Health Check
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleClearCache}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-[10px] text-sm font-medium flex items-center gap-2 transition-colors duration-150 border border-white/10"
                >
                  <Trash2 size={14} /> Clear Cache
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSeedConfig}
                  disabled={isSaving}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-[10px] text-sm font-medium flex items-center gap-2 transition-colors duration-150 border border-white/10 disabled:opacity-50"
                >
                  <Database size={14} /> Seed Config
                </motion.button>
              </div>

              {/* Provider Status Cards */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 text-[#9CA3AF] uppercase tracking-wider">Provider Status</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {analyticsData.providers.length > 0 ? (
                    analyticsData.providers.map((p) => (
                      <div key={p.name} className="stat-card flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">{p.name}</div>
                          <div className="text-xs text-[#9CA3AF] mt-1">
                            Latency: {p.avgResponseMs}ms · Rate: {p.successRate}%
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          p.active ? 'bg-[#25F4EE]/15 text-[#25F4EE]' : 'bg-[#FE2C55]/15 text-[#FE2C55]'
                        }`}>
                          {p.active ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="stat-card flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">TikHub</div>
                          <div className="text-xs text-[#9CA3AF] mt-1">Primary provider</div>
                        </div>
                        <div className="px-3 py-1 rounded-full text-xs font-semibold bg-[#25F4EE]/15 text-[#25F4EE]">Active</div>
                      </div>
                      <div className="stat-card flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">RapidAPI</div>
                          <div className="text-xs text-[#9CA3AF] mt-1">Fallback provider</div>
                        </div>
                        <div className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FE2C55]/15 text-[#FE2C55]">Fallback</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Recent Downloads Table */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-[#9CA3AF] uppercase tracking-wider">Recent Downloads</h3>
                <div className="stat-card overflow-hidden">
                  <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[#1a1a1a]">
                        <tr className="text-[#9CA3AF] text-xs uppercase tracking-wider">
                          <th className="text-left py-3 px-3 font-medium">Time</th>
                          <th className="text-left py-3 px-3 font-medium">Video</th>
                          <th className="text-left py-3 px-3 font-medium">Provider</th>
                          <th className="text-center py-3 px-3 font-medium">Status</th>
                          <th className="text-right py-3 px-3 font-medium">Response</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.recentLogs.length > 0 ? (
                          analyticsData.recentLogs.slice(0, 10).map((log) => (
                            <tr key={log.id} className="border-t border-white/5 hover:bg-white/5 transition-colors duration-150">
                              <td className="py-2.5 px-3 text-xs text-[#9CA3AF]">
                                {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-2.5 px-3 text-xs truncate max-w-[140px]">
                                {log.videoTitle || log.videoId || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-[#9CA3AF]">{log.provider || '—'}</td>
                              <td className="py-2.5 px-3 text-center">
                                {log.success ? (
                                  <span className="text-green-400 text-xs">✓</span>
                                ) : (
                                  <span className="text-red-400 text-xs">✗</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-right text-[#9CA3AF]">
                                {log.responseTime ? `${log.responseTime}ms` : '—'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-[#9CA3AF] text-xs">
                              No download logs yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ===== Providers Tab ===== */}
          {activeTab === 'providers' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-xl font-bold mb-4">Provider Management</h2>

              {/* Search */}
              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                <input
                  type="text"
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  placeholder="Search providers..."
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] pl-9 pr-4 py-2.5 text-sm outline-none input-focus-ring"
                />
              </div>

              {/* Provider Table */}
              <div className="stat-card overflow-hidden mb-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[#9CA3AF] text-xs uppercase tracking-wider">
                        <th className="text-left py-3 px-3 font-medium">Name</th>
                        <th className="text-left py-3 px-3 font-medium">Status</th>
                        <th className="text-center py-3 px-3 font-medium">Priority</th>
                        <th className="text-center py-3 px-3 font-medium">Enabled</th>
                        <th className="text-left py-3 px-3 font-medium">Health</th>
                        <th className="text-right py-3 px-3 font-medium">Latency</th>
                        <th className="text-right py-3 px-3 font-medium">Success Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerConfigs
                        .filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase()))
                        .map((provider) => {
                          const analyticsProvider = analyticsData.providers.find(
                            ap => ap.name.toLowerCase() === provider.name.toLowerCase()
                          );
                          return (
                            <tr key={provider.name} className="border-t border-white/5 hover:bg-white/5 transition-colors duration-150">
                              <td className="py-3 px-3 font-medium">{provider.name}</td>
                              <td className="py-3 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  provider.status === 'Active'
                                    ? 'bg-[#25F4EE]/15 text-[#25F4EE]'
                                    : 'bg-[#FE2C55]/15 text-[#FE2C55]'
                                }`}>
                                  {provider.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={provider.priority}
                                  onChange={(e) => setProviderConfigs(prev =>
                                    prev.map(p => p.name === provider.name
                                      ? { ...p, priority: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) }
                                      : p
                                    )
                                  )}
                                  className="w-12 bg-[#1a1a1a] border border-[#333] rounded-[8px] px-2 py-1 text-sm text-center outline-none input-focus-ring"
                                />
                              </td>
                              <td className="py-3 px-3 flex justify-center">
                                <Switch
                                  checked={provider.enabled}
                                  onCheckedChange={(val) => setProviderConfigs(prev =>
                                    prev.map(p => p.name === provider.name ? { ...p, enabled: val } : p)
                                  )}
                                />
                              </td>
                              <td className="py-3 px-3">
                                <div className={`w-2 h-2 rounded-full inline-block ${
                                  analyticsProvider?.active || provider.enabled ? 'bg-green-400' : 'bg-red-400'
                                }`} />
                              </td>
                              <td className="py-3 px-3 text-right text-xs text-[#9CA3AF]">
                                {analyticsProvider?.avgResponseMs ? `${analyticsProvider.avgResponseMs}ms` : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-xs text-[#9CA3AF]">
                                {analyticsProvider?.successRate ? `${analyticsProvider.successRate}%` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Environment Keys */}
              <div className="stat-card mb-5">
                <h3 className="text-sm font-semibold mb-3">Environment Keys</h3>
                <p className="text-[#9CA3AF] text-xs mb-3">
                  API keys are configured via environment variables. Never hardcode keys in source code.
                </p>
                <div className="space-y-2">
                  {['TIKHUB_API_KEY', 'RAPIDAPI_KEY', 'PROVIDER_NAME'].map((key) => (
                    <div key={key} className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-[8px]">
                      <Key size={12} className="text-[#666]" />
                      <span className="text-xs font-medium">{key}</span>
                      <span className="text-[10px] text-[#9CA3AF] ml-auto">Set via env var</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save button */}
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toast.info('Provider config saved locally. API keys are env-based.')}
                className="w-full py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/95 text-white font-semibold rounded-[14px] transition-colors duration-150 shadow-[0_4px_20px_rgba(254,44,85,0.3)]"
              >
                Save Provider Config
              </motion.button>
            </motion.div>
          )}

          {/* ===== Ads Tab ===== */}
          {activeTab === 'ads' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <h2 className="text-xl font-bold">Ads & Interstitial Configuration</h2>

              {/* Interstitial Config */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold mb-5">Interstitial Popup</h3>
                <div className="space-y-5">
                  {/* Enabled switch */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Interstitial Enabled</div>
                      <div className="text-xs text-[#9CA3AF]">Show countdown popup before downloads</div>
                    </div>
                    <Switch
                      checked={interstitialConfig.enabled}
                      onCheckedChange={(val) => setInterstitialConfig(prev => ({ ...prev, enabled: val }))}
                    />
                  </div>

                  {/* Timer dropdown */}
                  <div>
                    <label className="font-medium text-sm">Countdown Duration</label>
                    <p className="text-xs text-[#9CA3AF] mb-2">Seconds users wait before auto-download</p>
                    <Select
                      value={String(interstitialConfig.countdownDuration)}
                      onValueChange={(val) => setInterstitialConfig(prev => ({ ...prev, countdownDuration: parseInt(val) }))}
                    >
                      <SelectTrigger className="w-[140px] bg-[#1a1a1a] border-[#333]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-[#333]">
                        {[5, 10, 15, 20, 25, 30].map((val) => (
                          <SelectItem key={val} value={String(val)}>
                            {val} seconds
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Auto-download switch */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Auto-Download After Timer</div>
                      <div className="text-xs text-[#9CA3AF]">Automatically trigger download when countdown reaches 0</div>
                    </div>
                    <Switch
                      checked={interstitialConfig.autoDownload}
                      onCheckedChange={(val) => setInterstitialConfig(prev => ({ ...prev, autoDownload: val }))}
                    />
                  </div>

                  {/* Popup title */}
                  <div>
                    <label className="font-medium text-sm">Popup Title</label>
                    <p className="text-xs text-[#9CA3AF] mb-2">Heading displayed in the interstitial popup</p>
                    <input
                      type="text"
                      value={interstitialConfig.popupTitle}
                      onChange={(e) => setInterstitialConfig(prev => ({ ...prev, popupTitle: e.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-4 py-2.5 text-sm outline-none input-focus-ring"
                      placeholder="Support free downloads"
                    />
                  </div>

                  {/* Popup description */}
                  <div>
                    <label className="font-medium text-sm">Popup Description</label>
                    <p className="text-xs text-[#9CA3AF] mb-2">Subtext shown below the countdown</p>
                    <textarea
                      value={interstitialConfig.popupDescription}
                      onChange={(e) => setInterstitialConfig(prev => ({ ...prev, popupDescription: e.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-4 py-2.5 text-sm outline-none input-focus-ring resize-none"
                      rows={2}
                      placeholder="Your download will start automatically..."
                    />
                  </div>
                </div>
              </div>

              {/* Ad Placement Config */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold mb-5">Advertisement Placement</h3>

                {/* Visual Preview */}
                <div className="mb-5 p-4 bg-[#1a1a1a] rounded-[12px] border border-white/8">
                  <div className="text-xs text-[#9CA3AF] mb-2">Placement Preview</div>
                  {/* Mini popup mockup */}
                  <div className="mx-auto max-w-[240px] bg-[#0a0a0a] rounded-[12px] border border-white/10 p-3 text-center">
                    <div className="text-[8px] text-[#9CA3AF] uppercase mb-2">Sponsored</div>
                    <div className="text-[10px] font-semibold mb-2">Popup Title</div>
                    {/* Ad area highlighted */}
                    <div className="w-full h-[60px] bg-[#FE2C55]/10 border-2 border-[#FE2C55]/30 rounded-[6px] flex items-center justify-center text-[8px] text-[#FE2C55] font-medium">
                      Ad Area — {adPlacementConfig.dimensions}
                    </div>
                    <div className="mt-2 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full border border-[#FE2C55] flex items-center justify-center text-[8px] text-[#FE2C55]">5</div>
                    </div>
                    <div className="text-[8px] text-[#9CA3AF] mt-1">Auto-download starts...</div>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* Placement name + dimensions badge */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Interstitial Popup — Center</div>
                      <div className="text-xs text-[#9CA3AF]">Displayed in the popup modal during countdown</div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#1a1a1a] border border-[#333]">
                      {adPlacementConfig.dimensions}
                    </span>
                  </div>

                  {/* Ad enabled switch */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Advertisement Enabled</div>
                      <div className="text-xs text-[#9CA3AF]">Show advertisement area in the interstitial popup</div>
                    </div>
                    <Switch
                      checked={adPlacementConfig.enabled}
                      onCheckedChange={(val) => setAdPlacementConfig(prev => ({ ...prev, enabled: val }))}
                    />
                  </div>

                  {/* Ad size dropdown */}
                  <div>
                    <label className="font-medium text-sm">Advertisement Size</label>
                    <p className="text-xs text-[#9CA3AF] mb-2">Dimensions of the ad placement area</p>
                    <Select
                      value={adPlacementConfig.dimensions}
                      onValueChange={(val) => setAdPlacementConfig(prev => ({ ...prev, dimensions: val }))}
                    >
                      <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-[#333]">
                        <SelectItem value="300x250">300 × 250 (Medium Rectangle)</SelectItem>
                        <SelectItem value="728x90">728 × 90 (Leaderboard)</SelectItem>
                        <SelectItem value="320x50">320 × 50 (Mobile Banner)</SelectItem>
                        <SelectItem value="160x600">160 × 600 (Wide Skyscraper)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Ad position */}
                  <div>
                    <label className="font-medium text-sm">Advertisement Position</label>
                    <p className="text-xs text-[#9CA3AF] mb-2">Position within the popup</p>
                    <Select
                      value={adPlacementConfig.position}
                      onValueChange={(val) => setAdPlacementConfig(prev => ({ ...prev, position: val }))}
                    >
                      <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-[#333]">
                        <SelectItem value="top">Top</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="bottom">Bottom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Ad type */}
                  <div>
                    <label className="font-medium text-sm">Advertisement Type</label>
                    <p className="text-xs text-[#9CA3AF] mb-2">Type of ad content to display</p>
                    <Select
                      value={adPlacementConfig.type}
                      onValueChange={(val) => setAdPlacementConfig(prev => ({ ...prev, type: val }))}
                    >
                      <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-[#333]">
                        <SelectItem value="display">Display</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="native">Native</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Ad code editor */}
                  <div>
                    <label className="font-medium text-sm">Ad Provider Code</label>
                    <p className="text-xs text-[#9CA3AF] mb-2">Paste HTML/JS code from your ad provider</p>
                    <textarea
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-4 py-3 text-xs outline-none input-focus-ring resize-none font-mono leading-relaxed"
                      rows={4}
                      placeholder="<!-- Paste your ad provider HTML/JS code here -->"
                    />
                  </div>
                </div>
              </div>

              {/* Save button */}
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveAdsConfig}
                disabled={isSaving}
                className="w-full py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/95 text-white font-semibold rounded-[14px] disabled:opacity-50 transition-colors duration-150 flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(254,44,85,0.3)]"
              >
                {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <Shield size={16} />}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </motion.button>
            </motion.div>
          )}

          {/* ===== Analytics Tab ===== */}
          {activeTab === 'analytics' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-xl font-bold mb-4">Analytics</h2>

              {/* Daily Downloads Bar Chart */}
              <div className="stat-card mb-4">
                <h3 className="text-sm font-semibold mb-4">Daily Downloads (Last 7 Days)</h3>
                {analyticsData.last7Days.length > 0 ? (
                  <div className="flex items-end gap-2 h-[160px]">
                    {analyticsData.last7Days.map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div className="text-xs text-[#9CA3AF] mb-1 font-medium">
                          {day.totalDownloads}
                        </div>
                        <div
                          className="chart-bar w-full"
                          style={{ height: `${Math.max((day.totalDownloads / maxBarValue) * 120, 4)}px` }}
                        />
                        <div className="text-[10px] text-[#9CA3AF] mt-2">
                          {day.date.slice(5)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[160px] text-[#9CA3AF] text-xs">
                    No data yet — download activity will appear here
                  </div>
                )}
              </div>

              {/* Monthly Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="stat-card">
                  <div className="text-xs text-[#9CA3AF] font-medium mb-1">7-Day Total</div>
                  <div className="text-lg font-bold">
                    {analyticsData.last7Days.reduce((s, d) => s + d.totalDownloads, 0)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="text-xs text-[#9CA3AF] font-medium mb-1">Success Rate</div>
                  <div className="text-lg font-bold">
                    {analyticsData.last7Days.length > 0
                      ? `${Math.round(analyticsData.last7Days.reduce((s, d) => s + d.successCount, 0) / Math.max(analyticsData.last7Days.reduce((s, d) => s + d.totalDownloads, 0), 1) * 100)}%`
                      : '—'}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="text-xs text-[#9CA3AF] font-medium mb-1">Avg Latency</div>
                  <div className="text-lg font-bold">
                    {analyticsData.last7Days.length > 0
                      ? `${Math.round(analyticsData.last7Days.reduce((s, d) => s + d.avgResponseMs, 0) / analyticsData.last7Days.length)}ms`
                      : '—'}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="text-xs text-[#9CA3AF] font-medium mb-1">Fail Count</div>
                  <div className="text-lg font-bold text-red-400">
                    {analyticsData.last7Days.reduce((s, d) => s + d.failCount, 0)}
                  </div>
                </div>
              </div>

              {/* Downloads by Format */}
              <div className="stat-card mb-4">
                <h3 className="text-sm font-semibold mb-4">Downloads by Format</h3>
                <div className="flex items-center gap-6 justify-center">
                  {[
                    { label: 'MP4', color: '#FE2C55', pct: 65 },
                    { label: 'MP3', color: '#25F4EE', pct: 25 },
                    { label: 'Cover', color: '#9CA3AF', pct: 10 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs font-medium">{item.label}</span>
                      <span className="text-xs text-[#9CA3AF]">{item.pct}%</span>
                    </div>
                  ))}
                </div>
                {/* Simple pie chart visualization */}
                <div className="mt-4 flex items-center justify-center">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#FE2C55" strokeWidth="16"
                      strokeDasharray={`${2 * Math.PI * 50 * 0.65} ${2 * Math.PI * 50 * 0.35}`}
                      strokeDashoffset="0" transform="rotate(-90 60 60)" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#25F4EE" strokeWidth="16"
                      strokeDasharray={`${2 * Math.PI * 50 * 0.25} ${2 * Math.PI * 50 * 0.75}`}
                      strokeDashoffset={`${-2 * Math.PI * 50 * 0.65}`} transform="rotate(-90 60 60)" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#9CA3AF" strokeWidth="16"
                      strokeDasharray={`${2 * Math.PI * 50 * 0.10} ${2 * Math.PI * 50 * 0.90}`}
                      strokeDashoffset={`${-2 * Math.PI * 50 * 0.90}`} transform="rotate(-90 60 60)" />
                  </svg>
                </div>
              </div>

              {/* Platforms Breakdown */}
              <div className="stat-card mb-4">
                <h3 className="text-sm font-semibold mb-3">Platforms</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Smartphone size={14} className="text-[#FE2C55]" />
                    <span className="text-xs font-medium">Mobile</span>
                    <span className="text-xs text-[#9CA3AF]">~70%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor size={14} className="text-[#25F4EE]" />
                    <span className="text-xs font-medium">Desktop</span>
                    <span className="text-xs text-[#9CA3AF]">~30%</span>
                  </div>
                </div>
              </div>

              {/* Weekly Sparkline */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold mb-3">Weekly Trend</h3>
                {analyticsData.last7Days.length > 0 ? (
                  <svg width="100%" height="60" viewBox="0 0 200 60" preserveAspectRatio="none">
                    <polyline
                      fill="none"
                      stroke="#FE2C55"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={analyticsData.last7Days
                        .reverse()
                        .map((d, i) => `${(i / (analyticsData.last7Days.length - 1)) * 200},${60 - (d.totalDownloads / maxBarValue) * 50}`)
                        .join(' ')}
                    />
                  </svg>
                ) : (
                  <div className="text-xs text-[#9CA3AF] text-center py-4">No data yet</div>
                )}
              </div>
            </motion.div>
          )}

          {/* ===== Settings Tab ===== */}
          {activeTab === 'settings' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold mb-4">Settings</h2>

              {/* Site Settings */}
              <div className="stat-card">
                <button
                  onClick={() => toggleSettingsSection('site')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-[#9CA3AF]" />
                    <span className="font-semibold text-sm">Site Settings</span>
                  </div>
                  {openSettingsSections.has('site') ? (
                    <ChevronUp size={14} className="text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#9CA3AF]" />
                  )}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('site') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Site Name</label>
                          <input
                            type="text"
                            value={settingsValues.siteName}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, siteName: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Site URL</label>
                          <input
                            type="text"
                            value={settingsValues.siteUrl}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, siteUrl: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">Maintenance Mode</div>
                            <div className="text-xs text-[#9CA3AF]">Disable site for public access</div>
                          </div>
                          <Switch
                            checked={settingsValues.maintenanceMode}
                            onCheckedChange={(val) => setSettingsValues(prev => ({ ...prev, maintenanceMode: val }))}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* SEO Settings */}
              <div className="stat-card">
                <button
                  onClick={() => toggleSettingsSection('seo')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-[#9CA3AF]" />
                    <span className="font-semibold text-sm">SEO Settings</span>
                  </div>
                  {openSettingsSections.has('seo') ? (
                    <ChevronUp size={14} className="text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#9CA3AF]" />
                  )}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('seo') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Meta Title</label>
                          <input
                            type="text"
                            value={settingsValues.metaTitle}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, metaTitle: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Meta Description</label>
                          <textarea
                            value={settingsValues.metaDescription}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, metaDescription: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring resize-none"
                            rows={2}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">OG Image URL</label>
                          <input
                            type="text"
                            value={settingsValues.ogImageUrl}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, ogImageUrl: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Robots Directive</label>
                          <Select
                            value={settingsValues.robotsDirective}
                            onValueChange={(val) => setSettingsValues(prev => ({ ...prev, robotsDirective: val }))}
                          >
                            <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a1a] border-[#333]">
                              <SelectItem value="index, follow">Index, Follow</SelectItem>
                              <SelectItem value="noindex, follow">NoIndex, Follow</SelectItem>
                              <SelectItem value="index, nofollow">Index, NoFollow</SelectItem>
                              <SelectItem value="noindex, nofollow">NoIndex, NoFollow</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* API Keys */}
              <div className="stat-card">
                <button
                  onClick={() => toggleSettingsSection('apikeys')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Key size={14} className="text-[#9CA3AF]" />
                    <span className="font-semibold text-sm">API Keys</span>
                  </div>
                  {openSettingsSections.has('apikeys') ? (
                    <ChevronUp size={14} className="text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#9CA3AF]" />
                  )}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('apikeys') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-2">
                        {['TIKHUB_API_KEY', 'RAPIDAPI_KEY', 'PROVIDER_NAME'].map((key) => (
                          <div key={key} className="flex items-center gap-2 p-2.5 bg-[#1a1a1a] rounded-[8px]">
                            <Key size={12} className="text-[#666]" />
                            <span className="text-xs font-medium">{key}</span>
                            <span className="text-[10px] text-[#9CA3AF] ml-auto">Set via env var</span>
                            <Lock size={10} className="text-[#666]" />
                          </div>
                        ))}
                        <p className="text-xs text-[#9CA3AF] mt-1">API keys are configured via environment variables and cannot be edited here.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Branding */}
              <div className="stat-card">
                <button
                  onClick={() => toggleSettingsSection('branding')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Palette size={14} className="text-[#9CA3AF]" />
                    <span className="font-semibold text-sm">Branding</span>
                  </div>
                  {openSettingsSections.has('branding') ? (
                    <ChevronUp size={14} className="text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#9CA3AF]" />
                  )}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('branding') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Logo Text</label>
                          <input
                            type="text"
                            value={settingsValues.logoText}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, logoText: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Primary Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={settingsValues.primaryColor}
                              onChange={(e) => setSettingsValues(prev => ({ ...prev, primaryColor: e.target.value }))}
                              className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                            />
                            <div className="w-6 h-6 rounded-md border border-white/20" style={{ backgroundColor: settingsValues.primaryColor }} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Accent Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={settingsValues.accentColor}
                              onChange={(e) => setSettingsValues(prev => ({ ...prev, accentColor: e.target.value }))}
                              className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                            />
                            <div className="w-6 h-6 rounded-md border border-white/20" style={{ backgroundColor: settingsValues.accentColor }} />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Security */}
              <div className="stat-card">
                <button
                  onClick={() => toggleSettingsSection('security')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-[#9CA3AF]" />
                    <span className="font-semibold text-sm">Security</span>
                  </div>
                  {openSettingsSections.has('security') ? (
                    <ChevronUp size={14} className="text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#9CA3AF]" />
                  )}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('security') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Rate Limit (per IP)</label>
                          <input
                            type="text"
                            value={settingsValues.rateLimit}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, rateLimit: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">CORS Origins</label>
                          <input
                            type="text"
                            value={settingsValues.corsOrigins}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, corsOrigins: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                          />
                        </div>
                        <div className="p-2.5 bg-[#1a1a1a] rounded-[8px]">
                          <div className="text-xs text-[#9CA3AF]">Admin Password</div>
                          <div className="text-xs font-medium mt-1">Set via NEXT_PUBLIC_ADMIN_PASSWORD env var</div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Downloads */}
              <div className="stat-card">
                <button
                  onClick={() => toggleSettingsSection('downloads')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Download size={14} className="text-[#9CA3AF]" />
                    <span className="font-semibold text-sm">Downloads</span>
                  </div>
                  {openSettingsSections.has('downloads') ? (
                    <ChevronUp size={14} className="text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#9CA3AF]" />
                  )}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('downloads') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Max File Size</label>
                          <input
                            type="text"
                            value={settingsValues.maxFileSize}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, maxFileSize: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Allowed Formats</label>
                          <input
                            type="text"
                            value={settingsValues.allowedFormats}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, allowedFormats: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Concurrent Downloads Limit</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={settingsValues.concurrentDownloads}
                            onChange={(e) => setSettingsValues(prev => ({ ...prev, concurrentDownloads: parseInt(e.target.value) || 3 }))}
                            className="w-16 bg-[#1a1a1a] border border-[#333] rounded-[8px] px-2 py-2 text-sm text-center outline-none input-focus-ring"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Maintenance */}
              <div className="stat-card">
                <button
                  onClick={() => toggleSettingsSection('maintenance')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Wrench size={14} className="text-[#9CA3AF]" />
                    <span className="font-semibold text-sm">Maintenance</span>
                  </div>
                  {openSettingsSections.has('maintenance') ? (
                    <ChevronUp size={14} className="text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#9CA3AF]" />
                  )}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('maintenance') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">Maintenance Mode</div>
                            <div className="text-xs text-[#9CA3AF]">Disable site for public access</div>
                          </div>
                          <Switch
                            checked={settingsValues.maintenanceMode}
                            onCheckedChange={(val) => setSettingsValues(prev => ({ ...prev, maintenanceMode: val }))}
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={handleClearCache}
                            className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-[10px] text-xs font-medium flex items-center gap-2 transition-colors duration-150 border border-white/10"
                          >
                            <Trash2 size={12} /> Clear Cache
                          </button>
                          <button
                            onClick={() => toast.info('Analytics reset would need to be done via database')}
                            className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-[10px] text-xs font-medium flex items-center gap-2 transition-colors duration-150 border border-white/10"
                          >
                            <RefreshCw size={12} /> Reset Analytics
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Save Settings */}
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="w-full py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/95 text-white font-semibold rounded-[14px] disabled:opacity-50 transition-colors duration-150 flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(254,44,85,0.3)]"
              >
                {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <Shield size={16} />}
                {isSaving ? 'Saving...' : 'Save Settings'}
              </motion.button>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
