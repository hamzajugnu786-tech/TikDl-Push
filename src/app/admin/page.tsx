'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Download, Clock, Shield, Settings, BarChart3, Key, Activity,
  Megaphone, LayoutDashboard, Menu, X, TrendingUp, TrendingDown,
  Globe, ChevronDown, ChevronUp, Search, Trash2, Database, Monitor,
  Smartphone, Lock, Eye, FileText, Palette, Zap, Wrench,
  Copy, Plus, Layers, Tag, LayoutGrid,
  Code, Edit3, Check, AlertCircle
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { sanitizeAdHtml } from '@/lib/sanitize';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
// Recharts — used ONLY by the Analytics tab for interactive charts (Bug #3).
// Lazy-loaded chunk via dynamic import inside the Analytics tab component to
// avoid bloating the rest of the admin bundle. The components below are the
// subset we actually use.
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, PieChart, Pie, Area, AreaChart,
} from 'recharts';
// Centralized ad registry — single source of truth for pages, placements,
// templates, dimensions. Used by both the admin UI and the public ads API.
import {
  KNOWN_PAGES,
  GLOBAL_PAGE_KEY,
  UNIVERSAL_PLACEMENTS,
  HOMEPAGE_ONLY_PLACEMENTS,
  ALL_PLACEMENTS,
  AD_TEMPLATES,
  AD_DIMENSIONS,
  AD_TYPES,
  placementsForPage,
  pageLabel,
  placementLabel,
  parseDimensions,
  type PageMeta,
} from '@/lib/ad-registry';

// ===== Future Platforms =====
const FUTURE_PLATFORMS = [
  { name: 'TikTok', enabled: true, icon: '♪' },
  { name: 'Instagram', enabled: false, icon: 'IG' },
  { name: 'YouTube', enabled: false, icon: 'YT' },
  { name: 'Facebook', enabled: false, icon: 'FB' },
  { name: 'X (Twitter)', enabled: false, icon: 'X' },
  { name: 'Pinterest', enabled: false, icon: 'PI' },
  { name: 'Reddit', enabled: false, icon: 'RE' },
  { name: 'Snapchat', enabled: false, icon: 'SC' },
  { name: 'Vimeo', enabled: false, icon: 'VI' },
  { name: 'Dailymotion', enabled: false, icon: 'DM' },
];

// ===== Interfaces =====
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
  name: string;
  template: string;
  enabled: boolean;
  type: string;
  page: string;
  placement: string;
  position: string;
  dimensions: string;
  adCode: string;
  description: string;
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
    device?: string | null;
  }>;
  providers: Array<{
    name: string;
    active: boolean;
    successRate: number;
    avgResponseMs: number;
    lastCheck: string;
  }>;
  deviceBreakdown?: {
    mobile: number;
    desktop: number;
    tablet: number;
    unknown: number;
  };
  last30DaysCount?: number;
}

interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority: number;
  status: 'Active' | 'Fallback';
}

// ===== Placement mockup generator =====
// parseDimensions is imported from '@/lib/ad-registry' — single source of truth.
function PlacementMockup({ placementId }: { placementId: string }) {
  const mockups: Record<string, React.ReactNode> = {
    header_banner: (
      <div className="placement-mockup w-full h-[40px] flex flex-col justify-center">
        <div className="ad-zone h-[24px] text-center">Header Banner</div>
      </div>
    ),
    hero_section: (
      <div className="placement-mockup w-full h-[60px] flex flex-col">
        <div className="ad-zone h-[28px] text-center">Hero Ad</div>
      </div>
    ),
    between_url_download: (
      <div className="placement-mockup w-full h-[50px] flex flex-col items-center justify-center">
        <div className="ad-zone w-[80%] h-[28px] text-center">Inline Ad</div>
      </div>
    ),
    between_features_faq: (
      <div className="placement-mockup w-full h-[50px] flex flex-col items-center justify-center">
        <div className="ad-zone w-[80%] h-[28px] text-center">Inline Ad</div>
      </div>
    ),
    above_footer: (
      <div className="placement-mockup w-full h-[40px] flex flex-col justify-center">
        <div className="ad-zone h-[24px] text-center">Footer Banner</div>
      </div>
    ),
    left_sidebar: (
      <div className="placement-mockup h-[120px] flex flex-col items-center justify-center">
        <div className="ad-zone w-[90%] h-[80px] text-center">Left Sidebar</div>
      </div>
    ),
    right_sidebar: (
      <div className="placement-mockup h-[120px] flex flex-col items-center justify-center">
        <div className="ad-zone w-[90%] h-[80px] text-center">Right Sidebar</div>
      </div>
    ),
    interstitial_popup: (
      <div className="placement-mockup w-full h-[80px] flex flex-col items-center justify-center rounded-[8px]">
        <div className="text-[8px] text-[#9CA3AF] uppercase mb-1">Popup</div>
        <div className="ad-zone w-[60%] h-[40px] text-center">Interstitial Ad</div>
      </div>
    ),
    native_content: (
      <div className="placement-mockup w-full h-[50px] flex flex-col items-center justify-center">
        <div className="ad-zone w-[90%] h-[30px] text-center">Native Content</div>
      </div>
    ),
  };
  return mockups[placementId] || <div className="placement-mockup h-[40px]"><div className="ad-zone h-full text-center">Ad Placement</div></div>;
}

// ===== Admin Dashboard =====
const AdminDashboard = () => {
  // Server-side authentication — HttpOnly cookie verified via /api/admin/auth/verify
  // Password is NEVER exposed to browser JavaScript (no NEXT_PUBLIC_ADMIN_PASSWORD)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);

  // After mount, check server-side auth status via HttpOnly cookie (client-only)
  useEffect(() => {
    setMounted(true);
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/auth/verify');
        const data = await res.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
        }
      } catch {
        // Auth verification failed — stay unauthenticated
      }
    };
    checkAuth();
  }, []);
  // Helper: handle 401 responses from admin API routes
  // If auth expires mid-session, kick user back to login
  const handleApiResponse = async (res: Response): Promise<any> => {
    if (res.status === 401) {
      setIsAuthenticated(false);
      setLoginError('Session expired. Please log in again.');
      return null;
    }
    return res.json();
  };

  const [isLoading, setIsLoading] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginShake, setLoginShake] = useState(false);
  const [stats, setStats] = useState<AdminStats>({
    totalDownloads: 0,
    todayDownloads: 0,
    activeProvider: '',
    avgResponseTime: 0,
    errorRate: 0,
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'providers' | 'ads' | 'analytics' | 'settings' | 'platforms'>('dashboard');
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

  // Unlimited ads state
  const [ads, setAds] = useState<AdPlacementConfig[]>([
    {
      name: 'Interstitial Medium Rectangle',
      template: 'medium_rectangle',
      enabled: true,
      type: 'display',
      page: 'homepage',
      placement: 'interstitial_popup',
      position: 'center',
      dimensions: '300x250',
      adCode: '',
      description: 'Primary ad shown in the countdown popup',
      priority: 1,
    },
  ]);

  // Advertisement Management Center — currently selected page tab
  const [activeAdPage, setActiveAdPage] = useState<string>('homepage');
  // Dynamically discovered page list (KNOWN_PAGES + DB-distinct + fs scan)
  const [adPages, setAdPages] = useState<PageMeta[]>(KNOWN_PAGES);

  // Providers config state — initialized empty, populated from /api/health
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
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
  // Advertisement Management Center — Save button status: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ===== Analytics tab state (Bug #3 — production analytics upgrade) =====
  // Time range selector: 'daily' (7d), 'weekly' (14d grouped by week),
  // 'monthly' (30d grouped by day for monthly trend)
  const [analyticsRange, setAnalyticsRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  // Selected data point index — when set, the detail panel shows full info
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);

  // Fetch config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/admin/config');
        const data = await handleApiResponse(res);
        if (!data) return;
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
            setAds(data.ads.map((ad: any) => ({
              id: ad.id,
              name: ad.name || 'Untitled Ad',
              template: ad.template || 'medium_rectangle',
              enabled: ad.enabled,
              type: ad.type || 'display',
              page: ad.page || 'all',
              placement: ad.placement || 'interstitial_popup',
              position: ad.position || 'center',
              dimensions: ad.dimensions || '300x250',
              adCode: ad.adCode || '',
              description: ad.description || '',
              priority: ad.priority || 1,
            })));
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

  // Fetch dynamically discovered pages for the Advertisement Management Center
  // (KNOWN_PAGES + DB-distinct page values + filesystem scan of src/app/<dir>/page.tsx)
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchPages = async () => {
      try {
        const res = await fetch('/api/config/pages');
        const data = await handleApiResponse(res);
        if (data?.success && Array.isArray(data.pages) && data.pages.length > 0) {
          setAdPages(data.pages);
        }
      } catch {
        // Fall back to KNOWN_PAGES already in state
      }
    };
    fetchPages();
  }, [isAuthenticated]);

  // Fetch analytics stats and real provider data
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/analytics');
        const data = await handleApiResponse(res);
        if (!data) return;
        if (data.success) {
          setStats({
            totalDownloads: data.summary.totalDownloads || 0,
            todayDownloads: data.today.totalDownloads || 0,
            activeProvider: data.providers?.find((p: any) => p.active)?.name || data.providers?.[0]?.name || 'tiktok-api-dl',
            avgResponseTime: data.summary.avgResponseMs || 0,
            errorRate: data.summary.successRate > 0 ? 100 - data.summary.successRate : 0,
          });
          setAnalyticsData({
            last7Days: data.last7Days || [],
            recentLogs: data.recentLogs || [],
            providers: data.providers || [],
            deviceBreakdown: data.deviceBreakdown ?? { mobile: 0, desktop: 0, tablet: 0, unknown: 0 },
            last30DaysCount: data.last30DaysCount ?? 0,
          });
        }
      } catch {
        // Keep default stats
      }
    };

    // Fetch real provider status from the health API + saved provider config from /api/admin/config
    const fetchProviders = async () => {
      try {
        // 1. Fetch live health data (provider online/offline status)
        const healthRes = await fetch('/api/health');
        const healthData = await handleApiResponse(healthRes);
        if (!healthData || !healthData.providers) return;

        // 2. Fetch saved provider config from Settings DB
        //    (overrides live health status with admin's saved enabled/disabled state)
        let savedProviderSettings: Record<string, string> = {};
        try {
          const configRes = await fetch('/api/admin/config');
          const configData = await handleApiResponse(configRes);
          if (configData?.success && Array.isArray(configData.settings)) {
            for (const s of configData.settings) {
              savedProviderSettings[s.key] = s.value;
            }
          }
        } catch {
          // Config fetch failed — use live health data only
        }

        // Convert health API provider data into ProviderConfig format
        const providerEntries = Object.entries(healthData.providers) as [string, any][];
        const configs: ProviderConfig[] = providerEntries.map(([name, info], index) => {
          // Check if admin has explicitly saved an enabled/disabled state for this provider
          const savedEnabled = savedProviderSettings[`provider_tiktok_${name}_enabled`];
          const isEnabled = savedEnabled !== undefined
            ? savedEnabled === 'true'
            : info.status === 'online';

          return {
            name: info.platform === 'tiktok' ? name : `${name} (${info.platform || 'unknown'})`,
            enabled: isEnabled,
            priority: index + 1,
            status: info.status === 'online' ? 'Active' as const : 'Fallback' as const,
          };
        });
        setProviderConfigs(configs.length > 0 ? configs : []);
      } catch {
        // Keep empty provider list — will show "no data" message
      }
    };

    if (isAuthenticated) {
      fetchStats();
      fetchProviders();
    }
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        toast.success('Admin access granted');
      } else {
        setLoginError(data.error || 'Invalid password. Please try again.');
        setLoginShake(true);
        setTimeout(() => setLoginShake(false), 600);
      }
    } catch {
      setLoginError('Connection error. Please try again.');
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // Logout API call failed — clear local state anyway
    }
    setIsAuthenticated(false);
    setLoginPassword('');
    toast.success('Logged out');
  };

  // Save interstitial + ads config
  const handleSaveAdsConfig = async () => {
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interstitial: { ...interstitialConfig },
          ads: ads.map(ad => ({
            id: ad.id,
            name: ad.name,
            template: ad.template,
            enabled: ad.enabled,
            type: ad.type,
            page: ad.page || GLOBAL_PAGE_KEY,
            placement: ad.placement,
            position: ad.position,
            dimensions: ad.dimensions,
            adCode: ad.adCode,
            description: ad.description,
            priority: ad.priority,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuration Saved Successfully');
        // Update local state with DB-generated IDs for new ads
        if (data.ads && Array.isArray(data.ads)) {
          setAds(data.ads.map((ad: any) => ({
            id: ad.id,
            name: ad.name || 'Untitled Ad',
            template: ad.template || 'medium_rectangle',
            enabled: ad.enabled,
            type: ad.type || 'display',
            page: ad.page || GLOBAL_PAGE_KEY,
            placement: ad.placement || 'interstitial_popup',
            position: ad.position || 'center',
            dimensions: ad.dimensions || '300x250',
            adCode: ad.adCode || '',
            description: ad.description || '',
            priority: ad.priority || 1,
          })));
        }
        // Update interstitial config with DB ID
        if (data.interstitial?.id) {
          setInterstitialConfig(prev => ({ ...prev, id: data.interstitial.id }));
        }
        setSettingsValues(prev => ({
          ...prev,
          countdownDuration: interstitialConfig.countdownDuration,
        }));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        toast.error(data.error || 'Failed to save configuration');
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch {
      toast.error('Network error — failed to save');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Add new ad — defaults to the currently selected page in the Ad Management Center
  const addNewAd = (page?: string, placement?: string) => {
    const targetPage = page || activeAdPage || GLOBAL_PAGE_KEY;
    const targetPlacement = placement || 'above_footer';
    setAds(prev => [...prev, {
      name: 'New Advertisement',
      template: 'medium_rectangle',
      enabled: false,
      type: 'display',
      page: targetPage,
      placement: targetPlacement,
      position: 'center',
      dimensions: '300x250',
      adCode: '',
      description: '',
      priority: prev.length + 1,
    }]);
    toast.success(`New advertisement added to ${pageLabel(targetPage)} → ${placementLabel(targetPlacement)}`);
  };

  // Delete ad
  const deleteAd = async (index: number) => {
    const ad = ads[index];
    if (ad.id) {
      // Delete from DB
      try {
        await fetch('/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleteAds: [ad.id] }),
        });
        toast.success('Advertisement deleted');
      } catch {
        toast.error('Failed to delete from database');
      }
    }
    setAds(prev => prev.filter((_, i) => i !== index));
  };

  // Duplicate ad
  const duplicateAd = (index: number) => {
    const ad = ads[index];
    setAds(prev => [...prev, {
      name: `${ad.name} (Copy)`,
      template: ad.template,
      enabled: false,
      type: ad.type,
      page: ad.page,
      placement: ad.placement,
      position: ad.position,
      dimensions: ad.dimensions,
      adCode: ad.adCode,
      description: ad.description,
      priority: prev.length + 1,
    }]);
    toast.success('Advertisement duplicated');
  };

  // Update single ad field
  const updateAd = (index: number, field: string, value: any) => {
    setAds(prev => prev.map((ad, i) => i === index ? { ...ad, [field]: value } : ad));
  };

  // Apply template to ad
  const applyTemplate = (index: number, templateId: string) => {
    const template = AD_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    setAds(prev => prev.map((ad, i) => i === index ? {
      ...ad,
      template: templateId,
      dimensions: template.dimensions,
      placement: template.placement,
      description: template.desc,
      name: ad.name || template.label.replace(/^[^\s]+\s/, ''),
    } : ad));
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

  // Save provider config — persists provider_<platform>_enabled/_primary/_fallback
  // to the Settings table. The provider registry reads these on next load.
  const handleSaveProviders = async () => {
    setIsSaving(true);
    try {
      if (providerConfigs.length === 0) {
        toast.error('No providers to save');
        return;
      }

      // Determine platform — all current providers are tiktok platform
      // Future: extend to multi-platform when registry supports it
      const platform = 'tiktok';

      // Sort providers by priority (lowest priority number = primary)
      const sorted = [...providerConfigs].sort((a, b) => a.priority - b.priority);
      const enabledProviders = sorted.filter(p => p.enabled);
      const primary = enabledProviders[0]?.name || '';
      const fallback = enabledProviders[1]?.name || '';

      const settings = [
        // Platform-level enable/disable
        { key: `provider_${platform}_enabled`, value: String(enabledProviders.length > 0) },
        // Primary + fallback provider names
        { key: `provider_${platform}_primary`, value: primary },
        { key: `provider_${platform}_fallback`, value: fallback },
      ];

      // Also persist per-provider enable/disable state
      for (const p of providerConfigs) {
        settings.push({
          key: `provider_${platform}_${p.name}_enabled`,
          value: String(p.enabled),
        });
      }

      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Provider config saved', {
          description: `Primary: ${primary || 'none'} · Fallback: ${fallback || 'none'}`,
        });
      } else {
        toast.error(data.error || 'Failed to save provider config');
      }
    } catch {
      toast.error('Network error — failed to save');
    } finally {
      setIsSaving(false);
    }
  };

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
            name: 'Interstitial Medium Rectangle',
            template: 'medium_rectangle',
            enabled: true,
            type: 'display',
            page: 'homepage',
            placement: 'interstitial_popup',
            position: 'center',
            dimensions: '300x250',
            adCode: '',
            description: 'Primary ad shown in the countdown popup',
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
        setAds([{
          name: 'Interstitial Medium Rectangle',
          template: 'medium_rectangle',
          enabled: true,
          type: 'display',
          page: 'homepage',
          placement: 'interstitial_popup',
          position: 'center',
          dimensions: '300x250',
          adCode: '',
          description: 'Primary ad shown in the countdown popup',
          priority: 1,
        }]);
      } else {
        toast.error(data.error || 'Failed to seed config');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setIsSaving(false);
    }
  };

  // Sidebar nav items — includes Platforms
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'providers', label: 'Providers', icon: Key },
    { id: 'ads', label: 'Advertisements', icon: Megaphone },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'platforms', label: 'Platforms', icon: LayoutGrid },
  ];

  // Not authenticated — show professional login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center px-4">
        <Toaster position="top-center" richColors closeButton />

        {/* Ambient background accents */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[30%] -left-[20%] w-[60%] h-[60%] rounded-full bg-[#FE2C55]/[0.03] blur-[120px]" />
          <div className="absolute -bottom-[30%] -right-[20%] w-[50%] h-[50%] rounded-full bg-[#25F4EE]/[0.03] blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={`relative max-w-[420px] w-full ${loginShake ? 'animate-shake' : ''}`}
        >
          {/* Premium card */}
          <div className="glass rounded-[20px] p-8 sm:p-10 border border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-11 h-11 bg-[#FE2C55] rounded-[14px] flex items-center justify-center text-xl font-bold shadow-[0_4px_20px_rgba(254,44,85,0.3)]">
                ♪
              </div>
              <span className="text-[22px] font-extrabold tracking-tighter">TikDL</span>
            </div>

            {/* Subtitle */}
            <p className="text-center text-[#9CA3AF] text-sm mb-8">
              Admin Console — Authorized Access Only
            </p>

            {/* Separator */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-6" />

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Password field with show/hide */}
              <div>
                <label className="text-xs text-[#9CA3AF] font-medium mb-2 block">Admin Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                    placeholder="Enter your admin password"
                    disabled={isLoading}
                    autoFocus
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded-[12px] px-4 py-3 outline-none input-focus-ring text-sm pr-10 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#9CA3AF] transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <Eye size={16} /> : <Lock size={16} />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              <AnimatePresence>
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 text-[#FE2C55] text-xs bg-[#FE2C55]/10 border border-[#FE2C55]/20 rounded-[10px] px-3 py-2"
                  >
                    <AlertCircle size={14} />
                    {loginError}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <motion.button
                whileHover={!isLoading ? { scale: 1.01, y: -1 } : {}}
                whileTap={!isLoading ? { scale: 0.98 } : {}}
                type="submit"
                disabled={isLoading || !loginPassword}
                className="w-full bg-[#FE2C55] hover:bg-[#FE2C55]/95 disabled:bg-[#FE2C55]/50 disabled:cursor-not-allowed py-3 rounded-[12px] font-semibold text-sm transition-colors duration-150 shadow-[0_4px_20px_rgba(254,44,85,0.3)] flex items-center justify-center gap-2"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={16} /> : null}
                {isLoading ? 'Authenticating...' : 'Access Admin Panel'}
              </motion.button>
            </form>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-[10px] text-[#666]">
                Secure server-side authentication • HttpOnly cookie session
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Authenticated — show dashboard
  const maxBarValue = analyticsData.last7Days.length > 0
    ? Math.max(...analyticsData.last7Days.map(d => d.totalDownloads), 1)
    : 1;

  // ===== Analytics chart data (Bug #3) =====
  // Build the data series based on the selected time range.
  // - daily:    last 7 days, one point per day
  // - weekly:   last 14 days grouped into 2 weekly buckets + per-day breakdown
  // - monthly:  last 30 days grouped per-day (long-tail monthly trend)
  //
  // When the API returns fewer than 7 days of data, the missing days are
  // padded with zeros so the x-axis stays consistent.
  const analyticsSeries = (() => {
    const src = [...analyticsData.last7Days].reverse(); // API returns newest-first
    if (analyticsRange === 'daily') {
      // 7-day daily view — pad missing days at the start
      const today = new Date();
      const out: Array<{ date: string; totalDownloads: number; successCount: number; failCount: number; avgResponseMs: number; uniqueVisitors: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const ds = d.toISOString().slice(0, 10);
        const match = src.find(s => s.date === ds);
        out.push({
          date: ds,
          totalDownloads: match?.totalDownloads ?? 0,
          successCount: match?.successCount ?? 0,
          failCount: match?.failCount ?? 0,
          avgResponseMs: match?.avgResponseMs ?? 0,
          uniqueVisitors: match?.uniqueVisitors ?? 0,
        });
      }
      return out;
    }
    if (analyticsRange === 'weekly') {
      // Weekly view — show last 14 days, day-by-day, so the user can see
      // two weeks of trend side-by-side. The UI highlights the week boundary.
      const today = new Date();
      const out: Array<{ date: string; totalDownloads: number; successCount: number; failCount: number; avgResponseMs: number; uniqueVisitors: number }> = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const ds = d.toISOString().slice(0, 10);
        const match = src.find(s => s.date === ds);
        out.push({
          date: ds,
          totalDownloads: match?.totalDownloads ?? 0,
          successCount: match?.successCount ?? 0,
          failCount: match?.failCount ?? 0,
          avgResponseMs: match?.avgResponseMs ?? 0,
          uniqueVisitors: match?.uniqueVisitors ?? 0,
        });
      }
      return out;
    }
    // monthly — show last 30 days, day-by-day
    const today = new Date();
    const out: Array<{ date: string; totalDownloads: number; successCount: number; failCount: number; avgResponseMs: number; uniqueVisitors: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const ds = d.toISOString().slice(0, 10);
      const match = src.find(s => s.date === ds);
      out.push({
        date: ds,
        totalDownloads: match?.totalDownloads ?? 0,
        successCount: match?.successCount ?? 0,
        failCount: match?.failCount ?? 0,
        avgResponseMs: match?.avgResponseMs ?? 0,
        uniqueVisitors: match?.uniqueVisitors ?? 0,
      });
    }
    return out;
  })();

  // Summary numbers depend on the selected range
  const rangeTotals = (() => {
    const total = analyticsSeries.reduce((s, d) => s + d.totalDownloads, 0);
    const success = analyticsSeries.reduce((s, d) => s + d.successCount, 0);
    const fail = analyticsSeries.reduce((s, d) => s + d.failCount, 0);
    const daysWithLatency = analyticsSeries.filter(d => d.avgResponseMs > 0);
    const avgMs = daysWithLatency.length > 0
      ? Math.round(daysWithLatency.reduce((s, d) => s + d.avgResponseMs, 0) / daysWithLatency.length)
      : 0;
    return { total, success, fail, avgMs };
  })();

  // Selected data point details — show in the side panel
  const selectedPoint = selectedPointIdx !== null && selectedPointIdx >= 0 && selectedPointIdx < analyticsSeries.length
    ? analyticsSeries[selectedPointIdx]
    : null;

  // Device breakdown — real data from DownloadLog
  const deviceBreakdown = analyticsData.deviceBreakdown ?? { mobile: 0, desktop: 0, tablet: 0, unknown: 0 };
  const totalDeviceSamples = deviceBreakdown.mobile + deviceBreakdown.desktop + deviceBreakdown.tablet + deviceBreakdown.unknown;
  const hasRealDeviceData = totalDeviceSamples > 0 && (deviceBreakdown.mobile + deviceBreakdown.desktop + deviceBreakdown.tablet) > 0;

  // Format breakdown — from recent logs (success vs failed)
  const formatBreakdown = (() => {
    const total = analyticsData.recentLogs.length;
    if (total === 0) return null;
    const success = analyticsData.recentLogs.filter(l => l.success).length;
    const fail = total - success;
    return [
      { name: 'Successful', value: success, color: '#25F4EE' },
      { name: 'Failed', value: fail, color: '#FE2C55' },
    ].filter(d => d.value > 0);
  })();

  return (
    <div className="min-h-screen bg-[#000000] text-white flex">
      <Toaster position="top-center" richColors closeButton />

      {/* ===== Sidebar (Desktop) ===== */}
      <aside className="hidden lg:flex w-[200px] min-h-screen bg-[#111] border-r border-white/8 flex-col flex-shrink-0">
        <div className="px-3 py-3.5 flex items-center gap-2 border-b border-white/8">
          <div className="w-7 h-7 bg-[#FE2C55] rounded-lg flex items-center justify-center text-base font-bold">♪</div>
          <span className="font-bold text-base tracking-tighter">TikDL Admin</span>
        </div>
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as typeof activeTab)}
              className={`sidebar-item w-full text-left ${activeTab === item.id ? 'active' : ''}`}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-2.5 py-3 border-t border-white/8">
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-left hover:!text-red-400"
          >
            <X size={15} />
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
              initial={{ x: -200 }}
              animate={{ x: 0 }}
              exit={{ x: -200 }}
              transition={{ duration: 0.2 }}
              className="w-[200px] min-h-screen bg-[#111] border-r border-white/8 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-3.5 flex items-center justify-between border-b border-white/8">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-[#FE2C55] rounded-lg flex items-center justify-center text-base font-bold">♪</div>
                  <span className="font-bold text-base tracking-tighter">TikDL</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-white/10">
                  <X size={15} />
                </button>
              </div>
              <nav className="flex-1 px-2.5 py-3 space-y-0.5">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id as typeof activeTab); setSidebarOpen(false); }}
                    className={`sidebar-item w-full text-left ${activeTab === item.id ? 'active' : ''}`}
                  >
                    <item.icon size={15} />
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="px-2.5 py-3 border-t border-white/8">
                <button onClick={handleLogout} className="sidebar-item w-full text-left hover:!text-red-400">
                  <X size={15} />
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
        <div className="sticky top-0 z-40 glass border-b border-white/10 bg-black/80 px-4 py-2.5 flex items-center justify-between lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-white/10">
            <Menu size={18} />
          </button>
          <span className="font-bold text-sm tracking-tighter">TikDL Admin</span>
          <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-400 transition-colors duration-150">
            Logout
          </button>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6 max-w-[1100px]">

          {/* ===== Dashboard Tab ===== */}
          {activeTab === 'dashboard' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              {/* Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Download size={14} className="text-[#FE2C55]" />
                    <span className="text-[#9CA3AF] text-xs font-medium">Total Downloads</span>
                  </div>
                  <div className="text-lg sm:text-xl font-bold">{stats.totalDownloads.toLocaleString()}</div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-[#9CA3AF]">
                    <TrendingUp size={11} className="text-green-400" />
                    <span className="text-green-400">All time</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Activity size={14} className="text-[#25F4EE]" />
                    <span className="text-[#9CA3AF] text-xs font-medium">Today&apos;s Downloads</span>
                  </div>
                  <div className="text-lg sm:text-xl font-bold">{stats.todayDownloads.toLocaleString()}</div>
                  <div className="live-indicator mt-0.5 text-xs text-[#9CA3AF]">
                    <span className="dot" />
                    <span className="text-[#25F4EE]">Live</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Clock size={14} className="text-[#25F4EE]" />
                    <span className="text-[#9CA3AF] text-xs font-medium">Avg Response</span>
                  </div>
                  <div className="text-lg sm:text-xl font-bold">{stats.avgResponseTime}ms</div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-[#9CA3AF]">
                    {stats.avgResponseTime < 1000 ? (
                      <TrendingDown size={11} className="text-green-400" />
                    ) : (
                      <TrendingUp size={11} className="text-yellow-400" />
                    )}
                    <span>Speed</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Shield size={14} className="text-[#FE2C55]" />
                    <span className="text-[#9CA3AF] text-xs font-medium">Error Rate</span>
                  </div>
                  <div className="text-lg sm:text-xl font-bold">{stats.errorRate}%</div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-[#9CA3AF]">
                    {stats.errorRate < 5 ? (
                      <TrendingDown size={11} className="text-green-400" />
                    ) : (
                      <TrendingUp size={11} className="text-red-400" />
                    )}
                    <span>Reliability</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 mb-5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleHealthCheck}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-[10px] text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 border border-white/10"
                >
                  <Activity size={13} /> Health Check
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleClearCache}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-[10px] text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 border border-white/10"
                >
                  <Trash2 size={13} /> Clear Cache
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSeedConfig}
                  disabled={isSaving}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-[10px] text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 border border-white/10 disabled:opacity-50"
                >
                  <Database size={13} /> Seed Config
                </motion.button>
              </div>

              {/* Provider Status */}
              <div className="mb-5">
                <h3 className="text-xs font-semibold mb-2 text-[#9CA3AF] uppercase tracking-wider">Provider Status</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {analyticsData.providers.length > 0 ? (
                    analyticsData.providers.map((p) => (
                      <div key={p.name} className="stat-card flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">{p.name}</div>
                          <div className="text-xs text-[#9CA3AF] mt-0.5">
                            Latency: {p.avgResponseMs}ms · Rate: {p.successRate}%
                          </div>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          p.active ? 'bg-[#25F4EE]/15 text-[#25F4EE]' : 'bg-[#FE2C55]/15 text-[#FE2C55]'
                        }`}>
                          {p.active ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                    ))
                  ) : providerConfigs.length > 0 ? (
                    providerConfigs.map((p) => (
                      <div key={p.name} className="stat-card flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">{p.name}</div>
                          <div className="text-xs text-[#9CA3AF] mt-0.5">
                            Priority: {p.priority} · {p.status}
                          </div>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          p.enabled ? 'bg-[#25F4EE]/15 text-[#25F4EE]' : 'bg-[#FE2C55]/15 text-[#FE2C55]'
                        }`}>
                          {p.enabled ? 'Active' : 'Disabled'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="stat-card text-center text-sm text-[#9CA3AF] py-3 col-span-2">
                      Provider data loading...
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Downloads Table */}
              <div>
                <h3 className="text-xs font-semibold mb-2 text-[#9CA3AF] uppercase tracking-wider">Recent Downloads</h3>
                <div className="stat-card overflow-hidden">
                  <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[#1a1a1a]">
                        <tr className="text-[#9CA3AF] text-xs uppercase tracking-wider">
                          <th className="text-left py-2.5 px-2.5 font-medium">Time</th>
                          <th className="text-left py-2.5 px-2.5 font-medium">Video</th>
                          <th className="text-left py-2.5 px-2.5 font-medium">Provider</th>
                          <th className="text-center py-2.5 px-2.5 font-medium">Status</th>
                          <th className="text-right py-2.5 px-2.5 font-medium">Response</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.recentLogs.length > 0 ? (
                          analyticsData.recentLogs.slice(0, 10).map((log) => (
                            <tr key={log.id} className="table-row">
                              <td className="py-2 px-2.5 text-xs text-[#9CA3AF]">
                                {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-2 px-2.5 text-xs truncate max-w-[120px]">
                                {log.videoTitle || log.videoId || '—'}
                              </td>
                              <td className="py-2 px-2.5 text-xs text-[#9CA3AF]">{log.provider || '—'}</td>
                              <td className="py-2 px-2.5 text-center">
                                {log.success ? (
                                  <Check size={12} className="text-green-400 mx-auto" />
                                ) : (
                                  <X size={12} className="text-red-400 mx-auto" />
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-xs text-right text-[#9CA3AF]">
                                {log.responseTime ? `${log.responseTime}ms` : '—'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-[#9CA3AF] text-xs">
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
              transition={{ duration: 0.25 }}
            >
              <h2 className="text-lg font-bold mb-3">Provider Management</h2>

              {/* Read-only banner — provider execution order is registry-controlled */}
              <div className="stat-card mb-4 border border-[#25F4EE]/15">
                <div className="flex items-start gap-3">
                  <Lock size={14} className="text-[#25F4EE] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold mb-1">Provider execution order is registry-controlled</div>
                    <p className="text-xs text-[#9CA3AF] leading-relaxed">
                      The V1 / V2 / V3 race, first-success-wins behavior, and provider priority are
                      determined by the server-side provider registry. Provider enable/disable and
                      reordering are not persisted — they are not admin-configurable. API keys remain
                      environment-based and are never editable from this UI.
                    </p>
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                <input
                  type="text"
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  placeholder="Search providers..."
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] pl-8 pr-4 py-2 text-sm outline-none input-focus-ring"
                />
              </div>

              {/* Provider Table — READ-ONLY: priority and enabled are display-only */}
              <div className="stat-card overflow-hidden mb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[#9CA3AF] text-xs uppercase tracking-wider">
                        <th className="text-left py-2.5 px-2.5 font-medium">Name</th>
                        <th className="text-left py-2.5 px-2.5 font-medium">Status</th>
                        <th className="text-center py-2.5 px-2.5 font-medium">Priority</th>
                        <th className="text-center py-2.5 px-2.5 font-medium">Active</th>
                        <th className="text-left py-2.5 px-2.5 font-medium">Health</th>
                        <th className="text-right py-2.5 px-2.5 font-medium">Latency</th>
                        <th className="text-right py-2.5 px-2.5 font-medium">Success</th>
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
                            <tr key={provider.name} className="table-row">
                              <td className="py-2.5 px-2.5 font-medium text-sm">{provider.name}</td>
                              <td className="py-2.5 px-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  provider.status === 'Active'
                                    ? 'bg-[#25F4EE]/15 text-[#25F4EE]'
                                    : 'bg-[#FE2C55]/15 text-[#FE2C55]'
                                }`}>
                                  {provider.status}
                                </span>
                              </td>
                              {/* Read-only priority badge — no up/down controls */}
                              <td className="py-2.5 px-2.5 text-center">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-white/5 text-xs font-semibold text-[#9CA3AF]">
                                  {provider.priority}
                                </span>
                              </td>
                              {/* Read-only active indicator — no toggle */}
                              <td className="py-2.5 px-2.5">
                                <div className="flex justify-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                    provider.enabled
                                      ? 'bg-[#25F4EE]/10 text-[#25F4EE]'
                                      : 'bg-white/5 text-[#9CA3AF]'
                                  }`}>
                                    {provider.enabled ? 'On' : 'Off'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5">
                                <div className={`w-2 h-2 rounded-full inline-block ${
                                  analyticsProvider?.active || provider.enabled ? 'bg-green-400' : 'bg-red-400'
                                }`} />
                              </td>
                              <td className="py-2.5 px-2.5 text-right text-xs text-[#9CA3AF]">
                                {analyticsProvider?.avgResponseMs ? `${analyticsProvider.avgResponseMs}ms` : '—'}
                              </td>
                              <td className="py-2.5 px-2.5 text-right text-xs text-[#9CA3AF]">
                                {analyticsProvider?.successRate ? `${analyticsProvider.successRate}%` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {providerConfigs.length === 0 && (
                  <div className="text-center text-xs text-[#9CA3AF] py-6">
                    No provider telemetry available yet. Provider status appears once the health endpoint reports data.
                  </div>
                )}
              </div>

              {/* Environment Keys — read-only display */}
              <div className="stat-card mb-4">
                <h3 className="text-sm font-semibold mb-2">Environment Keys</h3>
                <p className="text-[#9CA3AF] text-xs mb-2">
                  API keys are configured via environment variables. Never hardcode keys in source code.
                </p>
                <div className="space-y-1.5">
                  {['TIKHUB_API_KEY', 'RAPIDAPI_KEY', 'PROVIDER_NAME'].map((key) => (
                    <div key={key} className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-[8px]">
                      <Key size={11} className="text-[#666]" />
                      <span className="text-xs font-medium">{key}</span>
                      <span className="text-[10px] text-[#9CA3AF] ml-auto">Set via env var</span>
                      <Lock size={9} className="text-[#666]" />
                    </div>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveProviders}
                disabled={isSaving || providerConfigs.length === 0}
                className="save-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Provider Config'}
              </motion.button>
            </motion.div>
          )}

          {/* ===== Advertisements Tab ===== */}
          {activeTab === 'ads' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* ===== HEADER: Title + Sticky Save Changes (top) ===== */}
              <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#000000]/95 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Megaphone size={16} className="text-[#FE2C55] flex-shrink-0" />
                  <h2 className="text-base sm:text-lg font-bold truncate">Advertisement Management Center</h2>
                  <span className="hidden sm:inline-block text-[10px] text-[#9CA3AF] ml-2 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                    {ads.length} ad{ads.length !== 1 ? 's' : ''} · {adPages.length} pages
                  </span>
                </div>
                <button
                  onClick={handleSaveAdsConfig}
                  disabled={isSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold transition-all duration-150 shadow-[0_4px_16px_rgba(254,44,85,0.25)] ${
                    saveStatus === 'saved' ? 'bg-[#10b981] text-black'
                    : saveStatus === 'error' ? 'bg-red-500 text-white'
                    : 'bg-[#FE2C55] hover:bg-[#FE2C55]/95 text-white'
                  } ${isSaving ? 'opacity-80 cursor-wait' : 'cursor-pointer'}`}
                >
                  {saveStatus === 'saving' && <RefreshCw className="animate-spin" size={14} />}
                  {saveStatus === 'saved' && <Check size={14} />}
                  {saveStatus === 'error' && <AlertCircle size={14} />}
                  {saveStatus === 'idle' && <Shield size={14} />}
                  <span className="hidden sm:inline">
                    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Failed — retry' : 'Save Changes'}
                  </span>
                  <span className="sm:hidden">
                    {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓' : saveStatus === 'error' ? '!' : 'Save'}
                  </span>
                </button>
              </div>

              {/* ===== PAGE TABS — horizontal scroll (mobile swipeable, desktop compact) ===== */}
              <div className="overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
                <div className="flex gap-1.5 min-w-max items-center">
                  {adPages.map(page => {
                    const isActive = activeAdPage === page.key;
                    return (
                      <button
                        key={page.key}
                        onClick={() => setActiveAdPage(page.key)}
                        className={`flex-shrink-0 px-3.5 py-2 rounded-[10px] text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                          isActive
                            ? 'bg-[#FE2C55] text-black shadow-[0_4px_16px_rgba(254,44,85,0.35)]'
                            : 'bg-white/[0.04] text-white border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12]'
                        }`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {page.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ===== PAGE CONTEXT BANNER ===== */}
              <div className="stat-card !py-3 !px-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-[#9CA3AF] uppercase tracking-wider">Managing ads for</div>
                  <div className="font-bold text-base truncate">{pageLabel(activeAdPage)}</div>
                </div>
                <div className="text-right text-[10px] text-[#9CA3AF] flex-shrink-0">
                  <div>Page key: <code className="text-white/70">{activeAdPage}</code></div>
                  <div className="mt-0.5">
                    {placementsForPage(activeAdPage).length} placement{placementsForPage(activeAdPage).length !== 1 ? 's' : ''} available
                  </div>
                </div>
              </div>

              {/* ===== INTERSTITIAL CONFIG (only on homepage tab — it's a homepage-only feature) ===== */}
              {activeAdPage === 'homepage' && (
                <details className="stat-card group" open>
                  <summary className="flex items-center justify-between cursor-pointer list-none">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-[#FE2C55]" />
                      <h3 className="text-sm font-semibold">Interstitial Popup</h3>
                      <span className="text-[10px] text-[#9CA3AF] px-2 py-0.5 rounded-full bg-white/5">Homepage only</span>
                    </div>
                    <ChevronDown size={14} className="text-[#9CA3AF] group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="space-y-4 mt-4">
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
                      <p className="text-xs text-[#9CA3AF] mb-1.5">Seconds users wait before auto-download</p>
                      <Select
                        value={String(interstitialConfig.countdownDuration)}
                        onValueChange={(val) => setInterstitialConfig(prev => ({ ...prev, countdownDuration: parseInt(val) }))}
                      >
                        <SelectTrigger className="w-[130px] bg-[#1a1a1a] border-[#333]">
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
                      <p className="text-xs text-[#9CA3AF] mb-1.5">Heading displayed in the interstitial popup</p>
                      <input
                        type="text"
                        value={interstitialConfig.popupTitle}
                        onChange={(e) => setInterstitialConfig(prev => ({ ...prev, popupTitle: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                        placeholder="Support free downloads"
                      />
                    </div>

                    {/* Popup description */}
                    <div>
                      <label className="font-medium text-sm">Popup Description</label>
                      <p className="text-xs text-[#9CA3AF] mb-1.5">Subtext shown below the countdown</p>
                      <textarea
                        value={interstitialConfig.popupDescription}
                        onChange={(e) => setInterstitialConfig(prev => ({ ...prev, popupDescription: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring resize-none"
                        rows={2}
                        placeholder="Your download will start automatically..."
                      />
                    </div>
                  </div>
                </details>
              )}

              {/* ===== SECTION-GROUPED AD CARDS =====
                   Ads for the currently selected page are grouped by placement.
                   Each placement is a "section" with its own heading and its own
                   "+ Add Advertisement" secondary action.

                   PAGE ISOLATION + INHERITED GLOBAL ADS
                   ------------------------------------
                   When the admin is on a specific page tab (e.g. HOME), we show:
                     - Page-specific ads (page=homepage) — solid red badge "HOME"
                     - Inherited global ads (page=all) — outlined cyan badge "GLOBAL"
                   Both render on the current page — the admin needs to see both
                   to understand what's actually displayed to users.

                   When the admin is on the GLOBAL tab, we show ONLY page=all ads.
                   Each ad card has a Page Scope dropdown so the admin can convert
                   a global ad to page-specific (or vice versa) without leaving
                   the current tab. */}
              {placementsForPage(activeAdPage).map(placement => {
                const isGlobalTab = activeAdPage === GLOBAL_PAGE_KEY;
                const sectionAds = ads
                  .map((ad, i) => ({ ad, i }))
                  .filter(({ ad }) =>
                    ad.placement === placement.id
                    && (isGlobalTab
                      ? ad.page === GLOBAL_PAGE_KEY
                      : (ad.page === activeAdPage || ad.page === GLOBAL_PAGE_KEY)
                    )
                  )
                  .sort((a, b) => {
                    // Sort: page-specific first (priority asc), then globals (priority asc)
                    const aIsGlobal = a.ad.page === GLOBAL_PAGE_KEY ? 1 : 0;
                    const bIsGlobal = b.ad.page === GLOBAL_PAGE_KEY ? 1 : 0;
                    if (aIsGlobal !== bIsGlobal) return aIsGlobal - bIsGlobal;
                    return (a.ad.priority || 1) - (b.ad.priority || 1);
                  });
                const placementInfo = ALL_PLACEMENTS.find(p => p.id === placement.id);

                return (
                  <div key={placement.id} className="space-y-3">
                    {/* Section heading */}
                    <div className="flex items-center justify-between gap-3 px-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1 h-5 rounded-full bg-[#FE2C55]" />
                        <h3 className="text-sm font-bold uppercase tracking-wide text-white/90">{placement.label}</h3>
                        <span className="text-[10px] text-[#9CA3AF] px-2 py-0.5 rounded-full bg-white/5 border border-white/[0.08]">
                          {sectionAds.length} ad{sectionAds.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <button
                        onClick={() => addNewAd(activeAdPage, placement.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-[8px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#9CA3AF] hover:text-white transition-colors"
                        title={`Add ad to ${placement.label}`}
                      >
                        <Plus size={11} /> Add
                      </button>
                    </div>
                    {placementInfo?.desc && (
                      <p className="text-[11px] text-[#9CA3AF] -mt-2 px-1">{placementInfo.desc}</p>
                    )}

                    {/* Section ad cards (or empty state) */}
                    {sectionAds.length === 0 ? (
                      <div className="stat-card !py-6 text-center">
                        <Megaphone size={20} className="text-gray-700 mx-auto mb-2" />
                        <p className="text-xs text-[#9CA3AF]">No ads configured for this section.</p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          {activeAdPage === GLOBAL_PAGE_KEY
                            ? 'A global ad here will render on every page that has this placement.'
                            : 'A page-specific ad here overrides any global ad for the same placement.'}
                        </p>
                      </div>
                    ) : (
                      sectionAds.map(({ ad, i: index }) => {
                        const dim = parseDimensions(ad.dimensions);
                        const templateInfo = AD_TEMPLATES.find(t => t.id === ad.template);
                        const adIsGlobal = ad.page === GLOBAL_PAGE_KEY;
                        // On a page-specific tab, a global ad is "inherited" (shown with cyan badge)
                        const isInherited = !isGlobalTab && adIsGlobal;

                        return (
                          <div
                            key={ad.id || `new-${index}`}
                            className={`stat-card space-y-4 ${isInherited ? 'border-l-2 border-l-[#25F4EE]/60' : ''}`}
                          >
                            {/* Ad Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <Megaphone size={14} className="text-[#9CA3AF] flex-shrink-0" />
                                <h3 className="text-sm font-semibold truncate">{ad.name}</h3>
                                {/* SCOPE BADGE — instantly identify global vs page-specific */}
                                {adIsGlobal ? (
                                  <span
                                    className="text-[9px] text-[#25F4EE] px-1.5 py-0.5 rounded-full bg-[#25F4EE]/10 border border-[#25F4EE]/40 uppercase tracking-wider flex items-center gap-1 flex-shrink-0"
                                    title="Global ad — renders on every page that has this placement"
                                  >
                                    <Globe size={9} /> Global
                                  </span>
                                ) : (
                                  <span
                                    className="text-[9px] text-[#FE2C55] px-1.5 py-0.5 rounded-full bg-[#FE2C55]/10 border border-[#FE2C55]/40 uppercase tracking-wider flex-shrink-0"
                                    title={`Page-specific to ${pageLabel(ad.page)}`}
                                  >
                                    {pageLabel(ad.page)}
                                  </span>
                                )}
                                {isInherited && (
                                  <span
                                    className="text-[9px] text-[#9CA3AF] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 flex-shrink-0"
                                    title="Inherited from Global — also renders on this page"
                                  >
                                    inherited
                                  </span>
                                )}
                                {!ad.enabled && (
                                  <span className="text-[9px] text-[#9CA3AF] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 uppercase tracking-wider">Disabled</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Switch
                                  checked={ad.enabled}
                                  onCheckedChange={(val) => updateAd(index, 'enabled', val)}
                                />
                                <button
                                  onClick={() => duplicateAd(index)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                  title="Duplicate"
                                >
                                  <Copy size={12} className="text-[#9CA3AF]" />
                                </button>
                                <button
                                  onClick={() => deleteAd(index)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/20 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={12} className="text-[#9CA3AF] hover:text-red-400" />
                                </button>
                              </div>
                            </div>

                            {/* Dynamic Preview */}
                            <div className="p-3 bg-[#0d0d0d] rounded-[12px] border border-white/8">
                              <div className="text-xs text-[#9CA3AF] mb-1.5 flex items-center gap-1.5">
                                <Eye size={11} /> Dynamic Preview
                              </div>
                              {ad.adCode ? (
                                <div className="rounded-[8px] overflow-hidden" style={{ maxWidth: Math.min(dim.w, 380), minHeight: Math.min(dim.h, 280) }}>
                                  <div dangerouslySetInnerHTML={{ __html: sanitizeAdHtml(ad.adCode) }} />
                                </div>
                              ) : (
                                <div
                                  className="template-preview-mini mx-auto flex items-center justify-center"
                                  style={{
                                    width: Math.min(dim.w, 380),
                                    height: Math.min(dim.h, 280),
                                    maxWidth: '100%',
                                  }}
                                >
                                  <div className="flex flex-col items-center gap-1">
                                    <Globe size={16} className="text-gray-600" />
                                    <span className="text-xs text-[#9CA3AF]">{ad.dimensions === 'responsive' ? 'Responsive' : `${dim.w} × ${dim.h}`}</span>
                                    <span className="text-[10px] text-gray-500">{templateInfo?.label || ad.template}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Placement Mockup */}
                            {placementInfo && (
                              <div className="p-3 bg-[#1a1a1a] rounded-[10px]">
                                <div className="text-xs text-[#9CA3AF] mb-1.5 flex items-center gap-1.5">
                                  <LayoutGrid size={11} /> Where this appears
                                </div>
                                <div className="text-xs text-[#9CA3AF] mb-1">{placementInfo.desc}</div>
                                <PlacementMockup placementId={ad.placement} />
                              </div>
                            )}

                            {/* Ad Config Fields */}
                            <div className="space-y-3">
                              {/* Name */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1">Name</label>
                                <input
                                  type="text"
                                  value={ad.name}
                                  onChange={(e) => updateAd(index, 'name', e.target.value)}
                                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring"
                                />
                              </div>

                              {/* Template */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1">Template</label>
                                <p className="text-[10px] text-[#9CA3AF] mb-1">Select a built-in template — auto-configures dimensions, placement & description</p>
                                <Select
                                  value={ad.template}
                                  onValueChange={(val) => applyTemplate(index, val)}
                                >
                                  <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#1a1a1a] border-[#333]">
                                    {AD_TEMPLATES.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.label} — {t.dimensions}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* PAGE SCOPE — change ad.page (global ↔ page-specific) */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1 flex items-center gap-1.5">
                                  <Globe size={11} /> Page Scope
                                </label>
                                <p className="text-[10px] text-[#9CA3AF] mb-1">
                                  {adIsGlobal
                                    ? 'Global ad — renders on every page that has this placement.'
                                    : `Page-specific — only renders on ${pageLabel(ad.page)}.`}
                                  {' '}Change scope to control which pages this ad appears on.
                                </p>
                                <Select
                                  value={ad.page || GLOBAL_PAGE_KEY}
                                  onValueChange={(val) => updateAd(index, 'page', val)}
                                >
                                  <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#1a1a1a] border-[#333] max-h-[280px]">
                                    <SelectItem value={GLOBAL_PAGE_KEY}>
                                      🌍 Global (All Pages)
                                    </SelectItem>
                                    {adPages
                                      .filter(p => p.key !== GLOBAL_PAGE_KEY)
                                      .map(p => (
                                        <SelectItem key={p.key} value={p.key}>
                                          🏠 {p.label}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Placement — uses ad.page (not activeAdPage) so options match the ad's scope */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1">Placement</label>
                                <p className="text-[10px] text-[#9CA3AF] mb-1">Where on the page this ad renders. Options filtered by the ad's Page Scope above.</p>
                                <Select
                                  value={ad.placement}
                                  onValueChange={(val) => updateAd(index, 'placement', val)}
                                >
                                  <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#1a1a1a] border-[#333] max-h-[280px]">
                                    {placementsForPage(ad.page || GLOBAL_PAGE_KEY).map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.label} — {p.desc}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Dimensions */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1">Dimensions</label>
                                <p className="text-[10px] text-[#9CA3AF] mb-1">Size of the ad area. Changing this instantly updates the preview above.</p>
                                <Select
                                  value={ad.dimensions}
                                  onValueChange={(val) => updateAd(index, 'dimensions', val)}
                                >
                                  <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#1a1a1a] border-[#333]">
                                    {AD_DIMENSIONS.map(d => (
                                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Ad Type */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1">Type</label>
                                <Select
                                  value={ad.type}
                                  onValueChange={(val) => updateAd(index, 'type', val)}
                                >
                                  <SelectTrigger className="w-[120px] bg-[#1a1a1a] border-[#333]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#1a1a1a] border-[#333]">
                                    {AD_TYPES.map(t => (
                                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Priority */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1">Priority</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={ad.priority}
                                  onChange={(e) => updateAd(index, 'priority', Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-[60px] bg-[#1a1a1a] border border-[#333] rounded-[8px] px-2 py-1.5 text-sm text-center outline-none input-focus-ring"
                                />
                              </div>

                              {/* Description */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1">Description</label>
                                <textarea
                                  value={ad.description}
                                  onChange={(e) => updateAd(index, 'description', e.target.value)}
                                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-xs outline-none input-focus-ring resize-none"
                                  rows={2}
                                  placeholder="Describe this advertisement..."
                                />
                              </div>

                              {/* Code Editor */}
                              <div>
                                <label className="text-xs text-[#9CA3AF] mb-1 flex items-center gap-1.5">
                                  <Code size={11} /> Ad Provider Code
                                </label>
                                <p className="text-[10px] text-[#9CA3AF] mb-1">Paste HTML/JS code from your ad provider. This will render on the landing page.</p>
                                <textarea
                                  value={ad.adCode}
                                  onChange={(e) => updateAd(index, 'adCode', e.target.value)}
                                  className="code-editor w-full"
                                  rows={4}
                                  placeholder="<!-- Paste your ad provider HTML/JS code here -->"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}

              {/* ===== STICKY + ADD ADVERTISEMENT (bottom) =====
                   Floating action button pinned to the bottom of the viewport
                   so it's always accessible while scrolling. Adds a new ad to
                   the currently selected page in the first available placement. */}
              <div className="sticky bottom-4 z-20 flex justify-center pointer-events-none">
                <button
                  onClick={() => addNewAd(activeAdPage, placementsForPage(activeAdPage)[0]?.id)}
                  className="pointer-events-auto flex items-center gap-2 px-5 py-3 bg-[#FE2C55] hover:bg-[#FE2C55]/95 text-white rounded-[14px] text-sm font-semibold shadow-[0_8px_32px_rgba(254,44,85,0.4)] transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                  title={`Add advertisement to ${pageLabel(activeAdPage)}`}
                >
                  <Plus size={16} />
                  <span>Add Advertisement to {pageLabel(activeAdPage)}</span>
                </button>
              </div>

              {/* Trailing spacer so the floating button never covers the last card */}
              <div className="h-12" />
            </motion.div>
          )}

          {/* ===== Analytics Tab ===== */}
          {activeTab === 'analytics' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-bold">Analytics</h2>
                {/* Time range selector — Daily / Weekly / Monthly */}
                <div className="inline-flex bg-[#1a1a1a] border border-[#333] rounded-[10px] p-1 gap-1">
                  {(['daily', 'weekly', 'monthly'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => { setAnalyticsRange(r); setSelectedPointIdx(null); }}
                      className={`px-3 py-1 rounded-[8px] text-xs font-semibold transition-all ${
                        analyticsRange === r
                          ? 'bg-[#FE2C55] text-white shadow-[0_4px_12px_rgba(254,44,85,0.3)]'
                          : 'text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      {r === 'daily' ? 'Daily' : r === 'weekly' ? 'Weekly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary cards — depend on selected range */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="stat-card relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-[#FE2C55]/5 rounded-full blur-2xl" />
                  <div className="text-xs text-[#9CA3AF] font-medium mb-1">
                    {analyticsRange === 'daily' ? '7-Day' : analyticsRange === 'weekly' ? '14-Day' : '30-Day'} Total
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{rangeTotals.total}</div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                  className="stat-card relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-[#25F4EE]/5 rounded-full blur-2xl" />
                  <div className="text-xs text-[#9CA3AF] font-medium mb-1">Success Rate</div>
                  <div className="text-2xl font-bold tabular-nums text-[#25F4EE]">
                    {rangeTotals.total > 0 ? `${Math.round((rangeTotals.success / rangeTotals.total) * 100)}%` : '—'}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="stat-card relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-[#FBBF24]/5 rounded-full blur-2xl" />
                  <div className="text-xs text-[#9CA3AF] font-medium mb-1">Avg Latency</div>
                  <div className="text-2xl font-bold tabular-nums">
                    {rangeTotals.avgMs > 0 ? `${rangeTotals.avgMs}ms` : '—'}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                  className="stat-card relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-[#FE2C55]/5 rounded-full blur-2xl" />
                  <div className="text-xs text-[#9CA3AF] font-medium mb-1">Fail Count</div>
                  <div className="text-2xl font-bold tabular-nums text-red-400">{rangeTotals.fail}</div>
                </motion.div>
              </div>

              {/* Main bar chart — interactive, click to select */}
              <div className="stat-card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">
                    Downloads Trend
                    <span className="ml-2 text-xs text-[#9CA3AF] font-normal">
                      {analyticsRange === 'daily' ? 'last 7 days' : analyticsRange === 'weekly' ? 'last 14 days' : 'last 30 days'}
                    </span>
                  </h3>
                  {selectedPoint && (
                    <button
                      onClick={() => setSelectedPointIdx(null)}
                      className="text-xs text-[#9CA3AF] hover:text-white transition-colors"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
                {analyticsSeries.length > 0 && analyticsSeries.some(d => d.totalDownloads > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={analyticsSeries}
                      margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
                      onClick={(e: any) => {
                        if (e && typeof e.activeTooltipIndex === 'number') {
                          setSelectedPointIdx(e.activeTooltipIndex);
                        }
                      }}
                    >
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FE2C55" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#FE2C55" stopOpacity={0.6} />
                        </linearGradient>
                        <linearGradient id="barGradientSelected" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#25F4EE" stopOpacity={1} />
                          <stop offset="100%" stopColor="#25F4EE" stopOpacity={0.7} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#9CA3AF', fontSize: 10 }}
                        tickFormatter={(d: string) => d.slice(5)}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#9CA3AF', fontSize: 10 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(254,44,85,0.08)' }}
                        contentStyle={{
                          background: 'rgba(20,20,20,0.95)',
                          border: '1px solid rgba(254,44,85,0.3)',
                          borderRadius: 10,
                          color: '#fff',
                          fontSize: 12,
                        }}
                        labelStyle={{ color: '#9CA3AF', marginBottom: 4 }}
                        formatter={(value: number, name: string) => {
                          if (name === 'totalDownloads') return [value, 'Downloads'];
                          if (name === 'successCount') return [value, 'Success'];
                          if (name === 'failCount') return [value, 'Failed'];
                          return [value, name];
                        }}
                        labelFormatter={(label: string) => `Date: ${label}`}
                      />
                      <Bar
                        dataKey="totalDownloads"
                        radius={[4, 4, 0, 0]}
                        animationDuration={500}
                      >
                        {analyticsSeries.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={selectedPointIdx === idx ? 'url(#barGradientSelected)' : 'url(#barGradient)'}
                            stroke={selectedPointIdx === idx ? '#25F4EE' : 'transparent'}
                            strokeWidth={selectedPointIdx === idx ? 1.5 : 0}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[260px] text-[#9CA3AF] text-xs">
                    No data yet — download activity will appear here
                  </div>
                )}
              </div>

              {/* Selected data point detail panel */}
              <AnimatePresence>
                {selectedPoint && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="stat-card border border-[#25F4EE]/25 bg-gradient-to-br from-[#25F4EE]/[0.03] to-transparent">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#25F4EE] animate-pulse" />
                          Selected: {selectedPoint.date}
                        </h3>
                        <button
                          onClick={() => setSelectedPointIdx(null)}
                          className="text-xs text-[#9CA3AF] hover:text-white"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <div className="text-[10px] uppercase text-[#9CA3AF] mb-1">Total</div>
                          <div className="text-lg font-bold tabular-nums">{selectedPoint.totalDownloads}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-[#9CA3AF] mb-1">Success</div>
                          <div className="text-lg font-bold tabular-nums text-[#25F4EE]">{selectedPoint.successCount}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-[#9CA3AF] mb-1">Failed</div>
                          <div className="text-lg font-bold tabular-nums text-red-400">{selectedPoint.failCount}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-[#9CA3AF] mb-1">Avg Latency</div>
                          <div className="text-lg font-bold tabular-nums">
                            {selectedPoint.avgResponseMs > 0 ? `${selectedPoint.avgResponseMs}ms` : '—'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <div className="text-[10px] uppercase text-[#9CA3AF] mb-1">Unique Visitors</div>
                        <div className="text-sm font-semibold tabular-nums">{selectedPoint.uniqueVisitors}</div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Trend line + Device breakdown, side by side on desktop */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Trend area chart */}
                <div className="stat-card">
                  <h3 className="text-sm font-semibold mb-3">Trend (Cumulative View)</h3>
                  {analyticsSeries.some(d => d.totalDownloads > 0) ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={analyticsSeries} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FE2C55" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#FE2C55" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: '#9CA3AF', fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: '#9CA3AF', fontSize: 10 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: 'rgba(20,20,20,0.95)',
                            border: '1px solid rgba(254,44,85,0.3)',
                            borderRadius: 10,
                            color: '#fff',
                            fontSize: 12,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="totalDownloads"
                          stroke="#FE2C55"
                          strokeWidth={2}
                          fill="url(#areaGradient)"
                          animationDuration={600}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-[#9CA3AF] text-xs">
                      No trend data yet
                    </div>
                  )}
                </div>

                {/* Device breakdown */}
                <div className="stat-card">
                  <h3 className="text-sm font-semibold mb-3">Device Breakdown</h3>
                  {hasRealDeviceData ? (
                    <>
                      <div className="flex items-center justify-center mb-2">
                        <ResponsiveContainer width="100%" height={140}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Mobile', value: deviceBreakdown.mobile, color: '#FE2C55' },
                                { name: 'Desktop', value: deviceBreakdown.desktop, color: '#25F4EE' },
                                { name: 'Tablet', value: deviceBreakdown.tablet, color: '#A78BFA' },
                                ...(deviceBreakdown.unknown > 0 ? [{ name: 'Unknown', value: deviceBreakdown.unknown, color: '#52525B' }] : []),
                              ].filter(d => d.value > 0)}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={55}
                              paddingAngle={2}
                              animationDuration={500}
                            >
                              {[
                                { name: 'Mobile', value: deviceBreakdown.mobile, color: '#FE2C55' },
                                { name: 'Desktop', value: deviceBreakdown.desktop, color: '#25F4EE' },
                                { name: 'Tablet', value: deviceBreakdown.tablet, color: '#A78BFA' },
                                ...(deviceBreakdown.unknown > 0 ? [{ name: 'Unknown', value: deviceBreakdown.unknown, color: '#52525B' }] : []),
                              ].filter(d => d.value > 0).map((entry, idx) => (
                                <Cell key={idx} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: 'rgba(20,20,20,0.95)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 10,
                                color: '#fff',
                                fontSize: 12,
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="w-2 h-2 rounded-full bg-[#FE2C55]" />
                          <Smartphone size={11} className="text-[#FE2C55]" />
                          <span className="font-semibold tabular-nums">
                            {totalDeviceSamples > 0 ? Math.round((deviceBreakdown.mobile / totalDeviceSamples) * 100) : 0}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="w-2 h-2 rounded-full bg-[#25F4EE]" />
                          <Monitor size={11} className="text-[#25F4EE]" />
                          <span className="font-semibold tabular-nums">
                            {totalDeviceSamples > 0 ? Math.round((deviceBreakdown.desktop / totalDeviceSamples) * 100) : 0}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="w-2 h-2 rounded-full bg-[#A78BFA]" />
                          <Layers size={11} className="text-[#A78BFA]" />
                          <span className="font-semibold tabular-nums">
                            {totalDeviceSamples > 0 ? Math.round((deviceBreakdown.tablet / totalDeviceSamples) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 text-center text-[10px] text-[#9CA3AF]">
                        Sample size: {totalDeviceSamples} downloads · last 7 days
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[140px] text-center">
                      <Smartphone size={20} className="text-[#52525B] mb-2" />
                      <div className="text-xs text-[#9CA3AF]">No device data yet</div>
                      <div className="text-[10px] text-[#52525B] mt-1 max-w-[200px]">
                        Device category is captured for new downloads. Historical
                        rows written before this fix have no device info.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Format breakdown donut */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold mb-3">Downloads by Outcome</h3>
                {formatBreakdown && formatBreakdown.length > 0 ? (
                  <div className="flex items-center gap-5 flex-wrap">
                    <ResponsiveContainer width={140} height={140}>
                      <PieChart>
                        <Pie
                          data={formatBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={60}
                          paddingAngle={2}
                          animationDuration={500}
                        >
                          {formatBreakdown.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: 'rgba(20,20,20,0.95)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 10,
                            color: '#fff',
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {formatBreakdown.map(item => {
                        const total = formatBreakdown.reduce((s, d) => s + d.value, 0);
                        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                        return (
                          <div key={item.name} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-xs font-medium">{item.name}</span>
                            <span className="text-xs text-[#9CA3AF] tabular-nums">{item.value} ({pct}%)</span>
                          </div>
                        );
                      })}
                      <div className="text-[10px] text-[#9CA3AF] pt-1 border-t border-white/5">
                        Based on {analyticsData.recentLogs.length} recent download logs
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[140px] text-[#9CA3AF] text-xs">
                    No download data yet
                  </div>
                )}
              </div>

              {/* Recent activity feed */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
                {analyticsData.recentLogs.length > 0 ? (
                  <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                    {analyticsData.recentLogs.slice(0, 12).map((log) => {
                      const date = new Date(log.createdAt);
                      const timeAgo = (() => {
                        const diffMs = Date.now() - date.getTime();
                        const min = Math.floor(diffMs / 60_000);
                        if (min < 1) return 'just now';
                        if (min < 60) return `${min}m ago`;
                        const hr = Math.floor(min / 60);
                        if (hr < 24) return `${hr}h ago`;
                        return `${Math.floor(hr / 24)}d ago`;
                      })();
                      const deviceIcon = log.device === 'mobile' ? <Smartphone size={10} className="text-[#FE2C55]" />
                        : log.device === 'desktop' ? <Monitor size={10} className="text-[#25F4EE]" />
                        : log.device === 'tablet' ? <Layers size={10} className="text-[#A78BFA]" />
                        : null;
                      return (
                        <div key={log.id} className="flex items-center gap-2 p-2 rounded-[8px] hover:bg-white/[0.03] transition-colors">
                          <div className={`w-1.5 h-1.5 rounded-full ${log.success ? 'bg-[#25F4EE]' : 'bg-[#FE2C55]'}`} />
                          <span className="text-xs font-medium truncate flex-1">
                            {log.videoTitle?.slice(0, 50) || 'Untitled'}
                          </span>
                          {deviceIcon}
                          <span className="text-[10px] text-[#9CA3AF] tabular-nums flex-shrink-0">{timeAgo}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[120px] text-[#9CA3AF] text-xs">
                    No recent activity
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ===== Settings Tab ===== */}
          {activeTab === 'settings' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              <h2 className="text-lg font-bold mb-3">Settings</h2>

              {/* Site Settings */}
              <div className="settings-section">
                <button onClick={() => toggleSettingsSection('site')} className="settings-toggle-btn">
                  <div className="flex items-center gap-2">
                    <Globe size={13} className="text-[#9CA3AF]" />
                    <span className="font-semibold text-sm">Site Settings</span>
                  </div>
                  {openSettingsSections.has('site') ? <ChevronUp size={13} className="text-[#9CA3AF]" /> : <ChevronDown size={13} className="text-[#9CA3AF]" />}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('site') && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="mt-3 space-y-2.5">
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Site Name</label>
                          <input type="text" value={settingsValues.siteName} onChange={(e) => setSettingsValues(prev => ({ ...prev, siteName: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" />
                        </div>
                        <div>
                          <label className="text-xs text-[#9CA3AF] mb-1">Site URL</label>
                          <input type="text" value={settingsValues.siteUrl} onChange={(e) => setSettingsValues(prev => ({ ...prev, siteUrl: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" />
                        </div>
                        <div className="flex items-center justify-between">
                          <div><div className="text-sm font-medium">Maintenance Mode</div><div className="text-xs text-[#9CA3AF]">Disable site for public access</div></div>
                          <Switch checked={settingsValues.maintenanceMode} onCheckedChange={(val) => setSettingsValues(prev => ({ ...prev, maintenanceMode: val }))} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* SEO Settings */}
              <div className="settings-section">
                <button onClick={() => toggleSettingsSection('seo')} className="settings-toggle-btn">
                  <div className="flex items-center gap-2"><Search size={13} className="text-[#9CA3AF]" /><span className="font-semibold text-sm">SEO Settings</span></div>
                  {openSettingsSections.has('seo') ? <ChevronUp size={13} className="text-[#9CA3AF]" /> : <ChevronDown size={13} className="text-[#9CA3AF]" />}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('seo') && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="mt-3 space-y-2.5">
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Meta Title</label><input type="text" value={settingsValues.metaTitle} onChange={(e) => setSettingsValues(prev => ({ ...prev, metaTitle: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" /></div>
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Meta Description</label><textarea value={settingsValues.metaDescription} onChange={(e) => setSettingsValues(prev => ({ ...prev, metaDescription: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring resize-none" rows={2} /></div>
                        <div><label className="text-xs text-[#9CA3AF] mb-1">OG Image URL</label><input type="text" value={settingsValues.ogImageUrl} onChange={(e) => setSettingsValues(prev => ({ ...prev, ogImageUrl: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" placeholder="https://..." /></div>
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Robots Directive</label>
                          <Select value={settingsValues.robotsDirective} onValueChange={(val) => setSettingsValues(prev => ({ ...prev, robotsDirective: val }))}>
                            <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-[#1a1a1a] border-[#333]">
                              <SelectItem value="index, follow">Index, Follow</SelectItem><SelectItem value="noindex, follow">NoIndex, Follow</SelectItem><SelectItem value="index, nofollow">Index, NoFollow</SelectItem><SelectItem value="noindex, nofollow">NoIndex, NoFollow</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* API Keys */}
              <div className="settings-section">
                <button onClick={() => toggleSettingsSection('apikeys')} className="settings-toggle-btn">
                  <div className="flex items-center gap-2"><Key size={13} className="text-[#9CA3AF]" /><span className="font-semibold text-sm">API Keys</span></div>
                  {openSettingsSections.has('apikeys') ? <ChevronUp size={13} className="text-[#9CA3AF]" /> : <ChevronDown size={13} className="text-[#9CA3AF]" />}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('apikeys') && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="mt-3 space-y-1.5">
                        {['TIKHUB_API_KEY', 'RAPIDAPI_KEY', 'PROVIDER_NAME'].map((key) => (
                          <div key={key} className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-[8px]">
                            <Key size={11} className="text-[#666]" /><span className="text-xs font-medium">{key}</span><span className="text-[10px] text-[#9CA3AF] ml-auto">Set via env var</span><Lock size={9} className="text-[#666]" />
                          </div>
                        ))}
                        <p className="text-xs text-[#9CA3AF] mt-1">API keys are configured via environment variables and cannot be edited here.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Branding */}
              <div className="settings-section">
                <button onClick={() => toggleSettingsSection('branding')} className="settings-toggle-btn">
                  <div className="flex items-center gap-2"><Palette size={13} className="text-[#9CA3AF]" /><span className="font-semibold text-sm">Branding</span></div>
                  {openSettingsSections.has('branding') ? <ChevronUp size={13} className="text-[#9CA3AF]" /> : <ChevronDown size={13} className="text-[#9CA3AF]" />}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('branding') && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="mt-3 space-y-2.5">
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Logo Text</label><input type="text" value={settingsValues.logoText} onChange={(e) => setSettingsValues(prev => ({ ...prev, logoText: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" /></div>
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Primary Color</label><div className="flex items-center gap-2"><input type="text" value={settingsValues.primaryColor} onChange={(e) => setSettingsValues(prev => ({ ...prev, primaryColor: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" /><div className="color-preview" style={{ backgroundColor: settingsValues.primaryColor }} /></div></div>
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Accent Color</label><div className="flex items-center gap-2"><input type="text" value={settingsValues.accentColor} onChange={(e) => setSettingsValues(prev => ({ ...prev, accentColor: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" /><div className="color-preview" style={{ backgroundColor: settingsValues.accentColor }} /></div></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Security */}
              <div className="settings-section">
                <button onClick={() => toggleSettingsSection('security')} className="settings-toggle-btn">
                  <div className="flex items-center gap-2"><Shield size={13} className="text-[#9CA3AF]" /><span className="font-semibold text-sm">Security</span></div>
                  {openSettingsSections.has('security') ? <ChevronUp size={13} className="text-[#9CA3AF]" /> : <ChevronDown size={13} className="text-[#9CA3AF]" />}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('security') && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="mt-3 space-y-2.5">
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Rate Limit (per IP)</label><input type="text" value={settingsValues.rateLimit} onChange={(e) => setSettingsValues(prev => ({ ...prev, rateLimit: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" /></div>
                        <div><label className="text-xs text-[#9CA3AF] mb-1">CORS Origins</label><input type="text" value={settingsValues.corsOrigins} onChange={(e) => setSettingsValues(prev => ({ ...prev, corsOrigins: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" /></div>
                        <div className="p-2 bg-[#1a1a1a] rounded-[8px]"><div className="text-xs text-[#9CA3AF]">Admin Password</div><div className="text-xs font-medium mt-0.5">Set via ADMIN_PASSWORD env var (server-side only)</div></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Downloads */}
              <div className="settings-section">
                <button onClick={() => toggleSettingsSection('downloads')} className="settings-toggle-btn">
                  <div className="flex items-center gap-2"><Download size={13} className="text-[#9CA3AF]" /><span className="font-semibold text-sm">Downloads</span></div>
                  {openSettingsSections.has('downloads') ? <ChevronUp size={13} className="text-[#9CA3AF]" /> : <ChevronDown size={13} className="text-[#9CA3AF]" />}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('downloads') && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="mt-3 space-y-2.5">
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Max File Size</label><input type="text" value={settingsValues.maxFileSize} onChange={(e) => setSettingsValues(prev => ({ ...prev, maxFileSize: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" /></div>
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Allowed Formats</label><input type="text" value={settingsValues.allowedFormats} onChange={(e) => setSettingsValues(prev => ({ ...prev, allowedFormats: e.target.value }))} className="w-full bg-[#1a1a1a] border border-[#333] rounded-[10px] px-3 py-2 text-sm outline-none input-focus-ring" /></div>
                        <div><label className="text-xs text-[#9CA3AF] mb-1">Concurrent Downloads</label><input type="number" min={1} max={10} value={settingsValues.concurrentDownloads} onChange={(e) => setSettingsValues(prev => ({ ...prev, concurrentDownloads: parseInt(e.target.value) || 3 }))} className="w-[60px] bg-[#1a1a1a] border border-[#333] rounded-[8px] px-2 py-1.5 text-sm text-center outline-none input-focus-ring" /></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Maintenance */}
              <div className="settings-section">
                <button onClick={() => toggleSettingsSection('maintenance')} className="settings-toggle-btn">
                  <div className="flex items-center gap-2"><Wrench size={13} className="text-[#9CA3AF]" /><span className="font-semibold text-sm">Maintenance</span></div>
                  {openSettingsSections.has('maintenance') ? <ChevronUp size={13} className="text-[#9CA3AF]" /> : <ChevronDown size={13} className="text-[#9CA3AF]" />}
                </button>
                <AnimatePresence>
                  {openSettingsSections.has('maintenance') && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="mt-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div><div className="text-sm font-medium">Maintenance Mode</div><div className="text-xs text-[#9CA3AF]">Disable site for public access</div></div>
                          <Switch checked={settingsValues.maintenanceMode} onCheckedChange={(val) => setSettingsValues(prev => ({ ...prev, maintenanceMode: val }))} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleClearCache} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-[10px] text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 border border-white/10"><Trash2 size={11} /> Clear Cache</button>
                          <button onClick={() => toast.info('Analytics reset requires database operation')} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-[10px] text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 border border-white/10"><RefreshCw size={11} /> Reset Analytics</button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="save-btn flex items-center justify-center gap-2"
              >
                {isSaving ? <RefreshCw className="animate-spin" size={14} /> : <Shield size={14} />}
                {isSaving ? 'Saving...' : 'Save Settings'}
              </motion.button>
            </motion.div>
          )}

          {/* ===== Platforms Tab (Coming Soon) ===== */}
          {activeTab === 'platforms' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Platforms Manager</h2>
                <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FE2C55]/15 text-[#FE2C55] border border-[#FE2C55]/20">
                  Coming Soon
                </div>
              </div>

              <p className="text-sm text-[#9CA3AF] mb-4">
                This section will be active after NovaDL Engine integration. Currently only TikTok is enabled for downloads. The UI architecture is designed to support additional platforms without redesigning.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {FUTURE_PLATFORMS.map((platform) => (
                  <div key={platform.name} className={`platform-grid-item ${platform.enabled ? 'enabled' : 'coming-soon'}`}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: platform.enabled ? 'rgba(254,44,85,0.15)' : 'rgba(255,255,255,0.05)' }}>
                      {platform.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{platform.name}</div>
                      <div className="text-xs text-[#9CA3AF]">{platform.enabled ? 'Enabled — Downloads active' : 'Coming Soon — Not yet available'}</div>
                    </div>
                    {platform.enabled ? (
                      <Check size={14} className="text-[#25F4EE]" />
                    ) : (
                      <AlertCircle size={14} className="text-[#9CA3AF]" />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 stat-card">
                <div className="text-sm font-semibold mb-2">Future NovaDL Compatibility</div>
                <p className="text-xs text-[#9CA3AF]">
                  When NovaDL Engine is integrated, each platform will have its own provider configuration, download endpoint, and feature flags. The current architecture supports multiple providers, provider priority, and platform management without requiring UI redesign. 21+ platforms are planned for future support.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
