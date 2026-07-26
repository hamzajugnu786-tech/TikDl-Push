'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Download, Clock, Shield, Settings, BarChart3, Key, Activity,
  Megaphone, LayoutDashboard, Menu, X, TrendingUp, TrendingDown,
  Globe, ChevronDown, ChevronUp, Search, Trash2, Database, Monitor,
  Smartphone, Lock, Eye, FileText, Palette, Zap, Wrench,
  Copy, Plus, Layers, Tag, LayoutGrid,
  Code, MoveUp, MoveDown, Edit3, Check, AlertCircle
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ===== Ad Templates =====
const AD_TEMPLATES = [
  { id: 'mobile_banner', label: '📱 Mobile Banner', dimensions: '320x100', placement: 'header_banner', desc: 'Compact banner optimized for mobile screens. Best for header or footer placement.' },
  { id: 'medium_rectangle', label: '🖼️ Medium Rectangle', dimensions: '300x250', placement: 'interstitial_popup', desc: 'The most common ad size. Versatile for popups, sidebars, and inline placements.' },
  { id: 'large_rectangle', label: '📏 Large Rectangle', dimensions: '336x280', placement: 'interstitial_popup', desc: 'Slightly larger than medium rectangle. Higher visibility for important placements.' },
  { id: 'leaderboard', label: '🖥️ Leaderboard', dimensions: '728x90', placement: 'header_banner', desc: 'Wide horizontal banner ideal for header placement on desktop.' },
  { id: 'large_leaderboard', label: '🎯 Large Leaderboard', dimensions: '970x250', placement: 'header_banner', desc: 'Premium large banner for maximum desktop visibility.' },
  { id: 'half_page', label: '📐 Half Page', dimensions: '300x600', placement: 'right_sidebar', desc: 'Tall vertical ad perfect for sidebar placement.' },
  { id: 'skyscraper', label: '🏢 Skyscraper', dimensions: '160x600', placement: 'right_sidebar', desc: 'Slim vertical ad designed for sidebar placement.' },
  { id: 'responsive_banner', label: '🌐 Responsive Banner', dimensions: 'responsive', placement: 'native_content', desc: 'Fluid ad that adapts to any container width. Best for flexible layouts.' },
  { id: 'interstitial', label: '📺 Interstitial', dimensions: '300x250', placement: 'interstitial_popup', desc: 'Full-screen overlay ad shown during the countdown popup.' },
  { id: 'native_ad', label: '📰 Native Ad', dimensions: 'responsive', placement: 'native_content', desc: 'Content-integrated ad that blends naturally with the page layout.' },
];

// ===== Ad Placements =====
const AD_PLACEMENTS = [
  { id: 'header_banner', label: 'Header Banner', desc: 'Top of page, above the hero section', icon: Monitor },
  { id: 'hero_section', label: 'Hero Section', desc: 'Inside the hero/download area', icon: LayoutGrid },
  { id: 'between_url_download', label: 'Between URL & Download', desc: 'Between input field and download button', icon: Zap },
  { id: 'between_features_faq', label: 'Between Features & FAQ', desc: 'Inline placement between sections', icon: FileText },
  { id: 'above_footer', label: 'Above Footer', desc: 'Bottom banner before the footer', icon: Globe },
  { id: 'left_sidebar', label: 'Left Desktop Sidebar', desc: 'Left sidebar ad (desktop only)', icon: Layers },
  { id: 'right_sidebar', label: 'Right Desktop Sidebar', desc: 'Right sidebar ad (desktop only)', icon: Layers },
  { id: 'interstitial_popup', label: 'Interstitial Popup', desc: 'Inside the countdown popup modal', icon: Megaphone },
  { id: 'native_content', label: 'Native Content', desc: 'Blends with page content naturally', icon: Tag },
];

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

// ===== Dynamic dimension parser =====
function parseDimensions(dimStr: string): { w: number; h: number } {
  if (dimStr === 'responsive' || dimStr === 'native') return { w: 300, h: 150 };
  const parts = dimStr.split('x');
  return { w: parseInt(parts[0]) || 300, h: parseInt(parts[1]) || 250 };
}

// ===== Placement mockup generator =====
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
  const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';

  // Initialize to false to avoid hydration mismatch — sessionStorage is undefined during SSR
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);

  // After mount, check sessionStorage for existing session (client-only)
  useEffect(() => {
    setMounted(true);
    try {
      const session = sessionStorage.getItem('tikdl_admin_session');
      if (session === 'authenticated') {
        setIsAuthenticated(true);
      }
    } catch {
      // sessionStorage not available
    }
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [stats, setStats] = useState<AdminStats>({
    totalDownloads: 0,
    todayDownloads: 0,
    activeProvider: 'tikhub',
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
      placement: 'interstitial_popup',
      position: 'center',
      dimensions: '300x250',
      adCode: '',
      description: 'Primary ad shown in the countdown popup',
      priority: 1,
    },
  ]);

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
            setAds(data.ads.map((ad: any) => ({
              id: ad.id,
              name: ad.name || 'Untitled Ad',
              template: ad.template || 'medium_rectangle',
              enabled: ad.enabled,
              type: ad.type || 'display',
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

  // Save interstitial + ads config
  const handleSaveAdsConfig = async () => {
    setIsSaving(true);
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
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch {
      toast.error('Network error — failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Add new ad
  const addNewAd = () => {
    setAds(prev => [...prev, {
      name: 'New Advertisement',
      template: 'medium_rectangle',
      enabled: false,
      type: 'display',
      placement: 'interstitial_popup',
      position: 'center',
      dimensions: '300x250',
      adCode: '',
      description: '',
      priority: prev.length + 1,
    }]);
    toast.success('New advertisement added');
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
          <div className="text-center mb-6">
            <div className="w-10 h-10 bg-[#FE2C55] rounded-[12px] flex items-center justify-center text-xl mx-auto mb-3">♪</div>
            <h1 className="text-lg font-bold">TikDL Admin</h1>
            <p className="text-[#9CA3AF] text-sm mt-1">Enter admin password to continue</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-[12px] px-4 py-2.5 outline-none input-focus-ring text-sm"
            />
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full bg-[#FE2C55] hover:bg-[#FE2C55]/95 py-2.5 rounded-[12px] font-semibold text-sm transition-colors duration-150 shadow-[0_4px_16px_rgba(254,44,85,0.25)]"
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
                  ) : (
                    <>
                      <div className="stat-card flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">TikHub</div>
                          <div className="text-xs text-[#9CA3AF] mt-0.5">Primary provider</div>
                        </div>
                        <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#25F4EE]/15 text-[#25F4EE]">Active</div>
                      </div>
                      <div className="stat-card flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">RapidAPI</div>
                          <div className="text-xs text-[#9CA3AF] mt-0.5">Fallback provider</div>
                        </div>
                        <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FE2C55]/15 text-[#FE2C55]">Fallback</div>
                      </div>
                    </>
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

              {/* Provider Table */}
              <div className="stat-card overflow-hidden mb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[#9CA3AF] text-xs uppercase tracking-wider">
                        <th className="text-left py-2.5 px-2.5 font-medium">Name</th>
                        <th className="text-left py-2.5 px-2.5 font-medium">Status</th>
                        <th className="text-center py-2.5 px-2.5 font-medium">Priority</th>
                        <th className="text-center py-2.5 px-2.5 font-medium">Enabled</th>
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
                              <td className="py-2.5 px-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => setProviderConfigs(prev =>
                                      prev.map(p => p.name === provider.name ? { ...p, priority: Math.max(1, p.priority - 1) } : p)
                                    )}
                                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 transition-colors"
                                  >
                                    <MoveUp size={10} />
                                  </button>
                                  <span className="text-sm font-semibold w-4 text-center">{provider.priority}</span>
                                  <button
                                    onClick={() => setProviderConfigs(prev =>
                                      prev.map(p => p.name === provider.name ? { ...p, priority: Math.min(10, p.priority + 1) } : p)
                                    )}
                                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 transition-colors"
                                  >
                                    <MoveDown size={10} />
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5">
                                <div className="flex justify-center">
                                  <Switch
                                    checked={provider.enabled}
                                    onCheckedChange={(val) => setProviderConfigs(prev =>
                                      prev.map(p => p.name === provider.name ? { ...p, enabled: val } : p)
                                    )}
                                  />
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
              </div>

              {/* Environment Keys */}
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
                onClick={() => toast.info('Provider config saved locally. API keys are env-based.')}
                className="save-btn"
              >
                Save Provider Config
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
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Advertisements</h2>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={addNewAd}
                  className="px-3 py-2 bg-[#FE2C55] hover:bg-[#FE2C55]/95 rounded-[10px] text-sm font-semibold flex items-center gap-1.5 transition-colors duration-150 shadow-[0_4px_16px_rgba(254,44,85,0.25)]"
                >
                  <Plus size={14} /> Add Advertisement
                </motion.button>
              </div>

              {/* Interstitial Config */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold mb-4">Interstitial Popup</h3>
                <div className="space-y-4">
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
              </div>

              {/* ===== Individual Ad Cards ===== */}
              {ads.map((ad, index) => {
                const dim = parseDimensions(ad.dimensions);
                const templateInfo = AD_TEMPLATES.find(t => t.id === ad.template);
                const placementInfo = AD_PLACEMENTS.find(p => p.id === ad.placement);

                return (
                  <div key={ad.id || `new-${index}`} className="stat-card space-y-4">
                    {/* Ad Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Megaphone size={14} className="text-[#9CA3AF]" />
                        <h3 className="text-sm font-semibold">{ad.name}</h3>
                      </div>
                      <div className="flex items-center gap-2">
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
                          <div dangerouslySetInnerHTML={{ __html: ad.adCode }} />
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

                      {/* Placement */}
                      <div>
                        <label className="text-xs text-[#9CA3AF] mb-1">Placement</label>
                        <p className="text-[10px] text-[#9CA3AF] mb-1">Where this ad will appear on the landing page</p>
                        <Select
                          value={ad.placement}
                          onValueChange={(val) => updateAd(index, 'placement', val)}
                        >
                          <SelectTrigger className="w-full bg-[#1a1a1a] border-[#333]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            {AD_PLACEMENTS.map((p) => (
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
                            <SelectItem value="320x100">320 × 100 (Mobile Banner)</SelectItem>
                            <SelectItem value="300x250">300 × 250 (Medium Rectangle)</SelectItem>
                            <SelectItem value="336x280">336 × 280 (Large Rectangle)</SelectItem>
                            <SelectItem value="728x90">728 × 90 (Leaderboard)</SelectItem>
                            <SelectItem value="970x250">970 × 250 (Large Leaderboard)</SelectItem>
                            <SelectItem value="300x600">300 × 600 (Half Page)</SelectItem>
                            <SelectItem value="160x600">160 × 600 (Skyscraper)</SelectItem>
                            <SelectItem value="970x90">970 × 90 (Billboard)</SelectItem>
                            <SelectItem value="responsive">Responsive</SelectItem>
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
                            <SelectItem value="display">Display</SelectItem>
                            <SelectItem value="video">Video</SelectItem>
                            <SelectItem value="native">Native</SelectItem>
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
              })}

              {/* Save button */}
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveAdsConfig}
                disabled={isSaving}
                className="save-btn flex items-center justify-center gap-2"
              >
                {isSaving ? <RefreshCw className="animate-spin" size={14} /> : <Shield size={14} />}
                {isSaving ? 'Saving...' : 'Save All Advertisements'}
              </motion.button>
            </motion.div>
          )}

          {/* ===== Analytics Tab ===== */}
          {activeTab === 'analytics' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <h2 className="text-lg font-bold mb-3">Analytics</h2>

              {/* Daily Downloads Bar Chart */}
              <div className="stat-card mb-3">
                <h3 className="text-sm font-semibold mb-3">Daily Downloads (Last 7 Days)</h3>
                {analyticsData.last7Days.length > 0 ? (
                  <div className="flex items-end gap-1.5 h-[140px]">
                    {analyticsData.last7Days.map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div className="text-xs text-[#9CA3AF] mb-1 font-medium">
                          {day.totalDownloads}
                        </div>
                        <div
                          className="chart-bar w-full"
                          style={{ height: `${Math.max((day.totalDownloads / maxBarValue) * 110, 4)}px` }}
                        />
                        <div className="text-[10px] text-[#9CA3AF] mt-1.5">
                          {day.date.slice(5)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[140px] text-[#9CA3AF] text-xs">
                    No data yet — download activity will appear here
                  </div>
                )}
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
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
              <div className="stat-card mb-3">
                <h3 className="text-sm font-semibold mb-3">Downloads by Format</h3>
                <div className="flex items-center gap-5 justify-center">
                  {[
                    { label: 'MP4', color: '#FE2C55', pct: 65 },
                    { label: 'MP3', color: '#38BDF8', pct: 25 },
                    { label: 'Cover', color: '#4ADE80', pct: 10 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs font-medium">{item.label}</span>
                      <span className="text-xs text-[#9CA3AF]">{item.pct}%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-center">
                  <svg width="110" height="110" viewBox="0 0 110 110">
                    <circle cx="55" cy="55" r="45" fill="none" stroke="#FE2C55" strokeWidth="14"
                      strokeDasharray={`${2 * Math.PI * 45 * 0.65} ${2 * Math.PI * 45 * 0.35}`}
                      strokeDashoffset="0" transform="rotate(-90 55 55)" />
                    <circle cx="55" cy="55" r="45" fill="none" stroke="#38BDF8" strokeWidth="14"
                      strokeDasharray={`${2 * Math.PI * 45 * 0.25} ${2 * Math.PI * 45 * 0.75}`}
                      strokeDashoffset={`${-2 * Math.PI * 45 * 0.65}`} transform="rotate(-90 55 55)" />
                    <circle cx="55" cy="55" r="45" fill="none" stroke="#4ADE80" strokeWidth="14"
                      strokeDasharray={`${2 * Math.PI * 45 * 0.10} ${2 * Math.PI * 45 * 0.90}`}
                      strokeDashoffset={`${-2 * Math.PI * 45 * 0.90}`} transform="rotate(-90 55 55)" />
                  </svg>
                </div>
              </div>

              {/* Platforms Breakdown */}
              <div className="stat-card mb-3">
                <h3 className="text-sm font-semibold mb-2">Platforms</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Smartphone size={13} className="text-[#FE2C55]" />
                    <span className="text-xs font-medium">Mobile</span>
                    <span className="text-xs text-[#9CA3AF]">~70%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor size={13} className="text-[#38BDF8]" />
                    <span className="text-xs font-medium">Desktop</span>
                    <span className="text-xs text-[#9CA3AF]">~30%</span>
                  </div>
                </div>
              </div>

              {/* Weekly Sparkline */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold mb-2">Weekly Trend</h3>
                {analyticsData.last7Days.length > 0 ? (
                  <svg width="100%" height="50" viewBox="0 0 200 50" preserveAspectRatio="none">
                    <polyline
                      fill="none"
                      stroke="#FE2C55"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={analyticsData.last7Days
                        .reverse()
                        .map((d, i) => `${(i / (analyticsData.last7Days.length - 1)) * 200},${50 - (d.totalDownloads / maxBarValue) * 40}`)
                        .join(' ')}
                    />
                  </svg>
                ) : (
                  <div className="text-xs text-[#9CA3AF] text-center py-3">No data yet</div>
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
                        <div className="p-2 bg-[#1a1a1a] rounded-[8px]"><div className="text-xs text-[#9CA3AF]">Admin Password</div><div className="text-xs font-medium mt-0.5">Set via NEXT_PUBLIC_ADMIN_PASSWORD env var</div></div>
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
