'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, X, Play, Music, Image as ImageIcon,
  Clock, User, Heart, RefreshCw, ClipboardPaste,
  ChevronDown, ChevronUp, Shield, Zap,
  Smartphone, Globe, CheckCircle, Share2,
  ArrowDown, Link as LinkIcon, Lock,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { sanitizeAdHtml } from '@/lib/sanitize';
import SiteNavbar from '@/components/site-navbar';
import SiteFooter from '@/components/site-footer';

interface VideoInfo {
  id: string;
  title: string;
  author: string;
  avatar: string;
  thumbnail: string;
  duration: string;
  views: string;
  likes: string;
  noWatermarkUrl: string;
  withWatermarkUrl: string;
  audioUrl: string;
  cover: string;
  postType?: 'video' | 'images';
  slideImages?: string[];
}

interface FAQItem {
  question: string;
  answer: string;
}

interface LandingAdSlot {
  id: string;
  name: string;
  dimensions: string;
  adCode: string;
  placement: string;
}

interface LandingAdData {
  interstitial: {
    enabled: boolean;
    countdownDuration: number;
    autoDownload: boolean;
    popupTitle: string;
    popupDescription: string;
  };
  interstitialAd: { id: string; dimensions: string; adCode: string } | null;
  sidebarAds: LandingAdSlot[];
  bannerAds: LandingAdSlot[];
  inlineAds: LandingAdSlot[];
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How do I download a TikTok video without watermark?',
    answer: 'Paste the TikTok video URL into the input field, click Download, and your HD video without watermark will be ready in seconds.',
  },
  {
    question: 'Is TikDL free to use?',
    answer: 'Yes, completely free with no limitations. Download as many TikTok videos as you want — no signup, no subscription, no hidden fees.',
  },
  {
    question: 'What video quality can I download?',
    answer: 'You get the original HD quality, exactly as uploaded by the creator. We never compress or reduce quality.',
  },
  {
    question: 'Can I download TikTok audio separately?',
    answer: 'Yes! Switch to the Audio tab to save just the music or sound from any TikTok as an MP3 file.',
  },
  {
    question: 'Does this work on mobile phones?',
    answer: 'Yes — works perfectly on iPhone, Android, tablets, and desktop. No app installation required.',
  },
  {
    question: 'Where do I find the TikTok video URL?',
    answer: 'Open TikTok, tap Share on the video, then tap "Copy Link." Paste that link into TikDL.',
  },
  {
    question: 'Is it legal to download TikTok videos?',
    answer: "Downloading for personal offline viewing is generally acceptable. Re-uploading someone else's content without permission may violate copyright. Always respect creators' rights.",
  },
  {
    question: 'Why is there a countdown before downloading?',
    answer: 'The brief timer supports our free service through ad revenue, keeping TikDL completely free for everyone.',
  },
];

const TikTokDownloader = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<VideoInfo[]>([]);
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState('');
  const [imagePostMode, setImagePostMode] = useState<'video' | 'images'>('video');
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [pendingUrl, setPendingUrl] = useState('');
  const [openFAQ, setOpenFAQ] = useState(false);
  const [autoProceedDone, setAutoProceedDone] = useState(false);
  const [interstitialConfig, setInterstitialConfig] = useState({
    enabled: true,
    countdownDuration: 5,
    autoDownload: true,
    popupTitle: 'Support free downloads',
    popupDescription: 'Your download will start automatically...',
  });
  const [landingAds, setLandingAds] = useState<LandingAdData>({
    interstitial: { enabled: true, countdownDuration: 5, autoDownload: true, popupTitle: 'Support free downloads', popupDescription: 'Your download will start automatically...' },
    interstitialAd: null,
    sidebarAds: [],
    bannerAds: [],
    inlineAds: [],
  });

  const adTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number>(5);
  const autoProceedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultCardRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const [pendingDownload, setPendingDownload] = useState<{ url: string; filename: string } | null>(null);
  const [resultHighlight, setResultHighlight] = useState(false);
  // Swipe state
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // Bug 4 fix: Scroll to top on mount, page refresh, new URL, and history navigation
  // Disable browser's automatic scroll restoration and always reset to top
  useEffect(() => {
    // Prevent browser from restoring previous scroll position on back/forward
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0 });

    // Also handle popstate (browser back/forward buttons)
    const handlePopState = () => {
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch ad config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config/ads');
        const data = await res.json();
        if (data.success) {
          if (data.interstitial) setInterstitialConfig(data.interstitial);
          setLandingAds({
            interstitial: data.interstitial || interstitialConfig,
            interstitialAd: data.interstitialAd || null,
            sidebarAds: data.sidebarAds || [],
            bannerAds: data.bannerAds || [],
            inlineAds: data.inlineAds || [],
          });
        }
      } catch { /* use defaults */ }
    };
    fetchConfig();
  }, []);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tiktokHistory');
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) setHistory(parsed); }
    } catch { /* ignore */ }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    try { localStorage.setItem('tiktokHistory', JSON.stringify(history)); } catch { /* ignore */ }
  }, [history]);

  const isValidTikTokUrl = (inputUrl: string): boolean => {
    const regex = /^https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/.+/i;
    return regex.test(inputUrl.trim());
  };

  // Reset all state for a fresh fetch
  const resetInterface = useCallback(() => {
    setActiveTab('video');
    setImagePostMode('video');
    setSelectedImages(new Set());
    setIsUnavailable(false);
    setUnavailableReason('');
    setError('');
    setVideoInfo(null);
  }, []);

  // Fetch video info
  const fetchVideo = useCallback(async (videoUrl: string) => {
    setIsLoading(true);
    resetInterface();

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
      });

      const result = await response.json();

      if (!result.success) {
        const errMsg = result.error || 'Failed to fetch video info';
        const unavailableCodes = ['PRIVATE_CONTENT', 'DELETED_CONTENT', 'AGE_RESTRICTED', 'GEO_BLOCKED'];
        const unavailableKeywords = ['private', 'deleted', 'unavailable', 'not available', 'region', 'age-restricted', 'geo'];
        const isUnavail = unavailableCodes.some(c => result.errorCode === c) ||
          unavailableKeywords.some(k => errMsg.toLowerCase().includes(k));
        if (isUnavail) {
          setIsUnavailable(true);
          setUnavailableReason(errMsg);
          setVideoInfo(null);
          toast.error('This TikTok isn\'t available');
          return;
        }
        throw new Error(errMsg);
      }

      const data: VideoInfo = result.data;

      // FRONTEND-SIDE UNAVAILABLE DETECTION:
      // If the API returned success but ALL download URLs are empty,
      // this is a video that returned metadata but no actual media.
      // Show unavailable instead of a broken card with empty download buttons.
      const hasAnyMedia = data.noWatermarkUrl || data.withWatermarkUrl || data.audioUrl ||
        (data.slideImages && data.slideImages.length > 0);
      if (!hasAnyMedia) {
        setIsUnavailable(true);
        setUnavailableReason('This video is unavailable. The video was removed by the creator or is no longer available on TikTok.');
        setVideoInfo(null);
        toast.error('This TikTok isn\'t available');
        return;
      }

      setVideoInfo(data);
      // Initialize photo/slide state
      if (data.postType === 'images' && data.slideImages && data.slideImages.length > 0) {
        setImagePostMode('images');
        setSelectedImages(new Set(data.slideImages.map((_, i) => i)));
      } else {
        setImagePostMode('video');
        setSelectedImages(new Set());
      }
      setActiveTab('video');
      setHistory(prev => [data, ...prev.slice(0, 4)]);
      toast.success('Video ready!');

      // Scroll to top after fetch
      setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 200);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to process this video. Try again.';
      setError(errorMessage);
      toast.error('Fetch failed', { description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [resetInterface]);

  // Auto-fetch from URL parameter (share links: ?v=<tiktok_url>)
  const hasAutoFetched = useRef(false);
  useEffect(() => {
    if (hasAutoFetched.current) return;
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('v');
    if (sharedUrl && isValidTikTokUrl(sharedUrl)) {
      hasAutoFetched.current = true;
      setUrl(sharedUrl);
      fetchVideo(sharedUrl);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchVideo]);

  // Ad popup timer
  const startAdTimer = useCallback((downloadUrl: string, filename: string) => {
    const duration = interstitialConfig.countdownDuration || 5;
    setCountdown(duration);
    setAutoProceedDone(false);
    autoProceedRef.current = false;
    setShowAdPopup(true);
    setPendingDownload({ url: downloadUrl, filename });
    countdownRef.current = duration;
    if (adTimerRef.current) clearInterval(adTimerRef.current);
    adTimerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        if (adTimerRef.current) clearInterval(adTimerRef.current);
        adTimerRef.current = null;
      }
    }, 1000);
  }, [interstitialConfig.countdownDuration]);

  // ──── SAFE DOWNLOAD: fetch+blob instead of <a> click ────
  // This prevents .json extension when proxy returns errors.
  // Old approach: <a href=proxyUrl download> → browser saves error body as file.mp4.json
  // New approach: fetch() → detect error → blob download only on success
  const triggerProxyDownload = useCallback(async (downloadUrl: string, filename: string) => {
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        const text = await res.text().catch(() => 'Download failed');
        toast.error('Download failed', { description: text.slice(0, 100) });
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success(`Downloading ${filename}`);
    } catch (err) {
      toast.error('Download failed', { description: err instanceof Error ? err.message : 'Network error' });
    }
  }, []);

  const proceedAfterAd = useCallback(() => {
    setShowAdPopup(false);
    if (pendingDownload) {
      triggerProxyDownload(pendingDownload.url, pendingDownload.filename);
      setPendingDownload(null);
    }
  }, [pendingDownload, triggerProxyDownload]);

  useEffect(() => {
    if (countdown === 0 && showAdPopup && interstitialConfig.autoDownload && !autoProceedRef.current) {
      autoProceedRef.current = true;
      setAutoProceedDone(true);
      const timeout = setTimeout(() => { proceedAfterAd(); }, 800);
      return () => clearTimeout(timeout);
    }
  }, [countdown, showAdPopup, interstitialConfig.autoDownload, proceedAfterAd]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) { toast.error('Enter a TikTok URL'); return; }
    if (!isValidTikTokUrl(trimmed)) {
      setError('Invalid TikTok URL format. Please use a valid TikTok link.');
      toast.error('Please use a valid TikTok link');
      return;
    }
    setError('');
    fetchVideo(trimmed);
  }, [url, fetchVideo]);

  const handleDownload = useCallback((downloadUrl: string, filename: string) => {
    if (!downloadUrl || downloadUrl.startsWith('#')) {
      toast.error('Download URL not available for this video.');
      return;
    }
    if (interstitialConfig.enabled) {
      startAdTimer(downloadUrl, filename);
    } else {
      triggerProxyDownload(downloadUrl, filename);
    }
  }, [interstitialConfig.enabled, startAdTimer, triggerProxyDownload]);

  const sanitizeFilename = useCallback((name: string): string => {
    let safe = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '');
    safe = safe.trim().replace(/^[.]+|[.]+$/g, '');
    if (safe.length > 180) safe = safe.slice(0, 180);
    if (!safe) safe = 'TikTok_Video';
    return safe;
  }, []);

  const getDownloadFilename = useCallback((type: 'video' | 'audio', info: VideoInfo, audioExt?: string): string => {
    const rawTitle = info.title || info.id;
    const baseName = sanitizeFilename(rawTitle);
    switch (type) {
      case 'video': return `${baseName}.mp4`;
      case 'audio': return `${baseName}.${audioExt || 'm4a'}`;
    }
  }, [sanitizeFilename]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('tiktokHistory');
    toast.success('History cleared');
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (adTimerRef.current) clearInterval(adTimerRef.current); };
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError('');
      toast.success('Link pasted from clipboard');
      inputRef.current?.blur();
    } catch { toast.error('Cannot read clipboard — please paste manually'); }
  }, []);

  const handleClearInput = useCallback(() => {
    setUrl('');
    setError('');
    inputRef.current?.focus();
  }, []);

  // Tab swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swipe left → next tab
        setActiveTab(prev => prev === 'video' ? 'audio' : prev);
      } else {
        // Swipe right → prev tab
        setActiveTab(prev => prev === 'audio' ? 'video' : prev);
      }
    }
    setTouchStart(null);
  }, [touchStart]);

  // Countdown ring
  const circumference = 2 * Math.PI * 36;
  const progress = interstitialConfig.countdownDuration > 0
    ? (interstitialConfig.countdownDuration - countdown) / interstitialConfig.countdownDuration
    : 1;
  const strokeDashoffset = circumference * (1 - progress);

  // Ad slot renderer
  const renderAdSlot = (ad: LandingAdSlot, className?: string) => {
    if (ad.adCode) {
      const safeHtml = sanitizeAdHtml(ad.adCode);
      return (
        <div key={ad.id} className={className || 'ad-slot-inline'}>
          <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </div>
      );
    }
    const dims = ad.dimensions.split('x');
    const w = parseInt(dims[0]) || 300;
    const h = parseInt(dims[1]) || 250;
    return (
      <div key={ad.id} className={className || 'ad-slot-inline'} style={{ minHeight: Math.min(h, 120), maxWidth: Math.min(w, 728) }}>
        <div className="flex flex-col items-center justify-center gap-1 h-full" style={{ minHeight: Math.min(h, 120) }}>
          <Globe size={16} className="text-gray-600" />
          <span className="text-gray-500 text-xs">{ad.name || 'Advertisement'}</span>
          <span className="text-gray-600 text-[10px]">{w} × {h}</span>
        </div>
      </div>
    );
  };

  // TASK 2: Generic unavailable message — never assume the reason is "private"
  // Only show specific messages for age-restriction and geo-blocking where
  // TikHub explicitly indicates those reasons. For everything else, one generic message.
  const getUnavailableMessage = (reason: string): { icon: string; title: string; desc: string } => {
    const r = reason.toLowerCase();
    if (r.includes('age') || r.includes('restrict')) return { icon: '🔞', title: 'Age restricted', desc: 'This video is age-restricted and cannot be downloaded through TikDL.' };
    if (r.includes('region') || r.includes('geo') || r.includes('block')) return { icon: '🌍', title: 'Region restricted', desc: 'This video is not available in your region due to geographic restrictions.' };
    return { icon: '⚠️', title: 'This video is unavailable', desc: 'The video was removed by the creator or is no longer available on TikTok.' };
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <Toaster position="top-center" richColors closeButton />
      <div ref={topRef} />

      {/* Navbar offset: fixed navbar needs padding-top so content isn't hidden */}
      <div className="h-[52px]" />

      {/* ===== Navbar ===== */}
      <SiteNavbar isHome />

      {/* ===== Banner Ad 1: Below Navbar ===== */}
      {landingAds.bannerAds.filter(a => a.placement === 'header_banner').length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-2">
          {landingAds.bannerAds.filter(a => a.placement === 'header_banner').map(ad => renderAdSlot(ad, 'ad-slot-banner'))}
        </div>
      )}

      {/* ===== Main Content with Sidebar Ads ===== */}
      <div className="flex-1 flex">
        {landingAds.sidebarAds.filter(a => a.placement === 'left_sidebar').length > 0 && (
          <aside className="hidden xl:block w-[160px] flex-shrink-0 px-2 pt-8">
            {landingAds.sidebarAds.filter(a => a.placement === 'left_sidebar').map(ad => renderAdSlot(ad, 'ad-slot-sidebar'))}
          </aside>
        )}

        {/* ===== Center Content ===== */}
        <div className="flex-1 min-w-0">

          {/* ===== Hero Section ===== */}
          <section className="pt-6 sm:pt-8 pb-4 sm:pb-5 px-4 sm:px-6">
            <div className="max-w-xl mx-auto text-center">
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="badge-pulse inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3 mt-2"
                style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#ffffff', border: '1px solid rgba(56, 189, 248, 0.35)' }}
              >
                Free and Unlimited
              </motion.div>

              <motion.h1
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-[clamp(26px,4vw,40px)] font-extrabold tracking-tight leading-[1.15] mb-3"
              >
                Download TikTok HD Videos <span className="text-[#FE2C55]">Without Watermark</span>
              </motion.h1>

              <motion.p
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="text-xs text-[#9CA3AF] leading-relaxed max-w-[400px] mx-auto mb-5"
              >
                Fast, free, no signup, no limits. Save videos and audio in HD quality.
              </motion.p>

              {/* Input + Button */}
              <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }}>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(''); }}
                    placeholder="Paste TikTok link here..."
                    className="w-full h-12 bg-[#1a1a1a] border border-[#333] rounded-[12px] pl-4 pr-10 text-sm placeholder:text-[#666] outline-none input-focus-ring disabled:opacity-50"
                    disabled={isLoading}
                  />
                  {url ? (
                    <button type="button" onClick={handleClearInput} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150" title="Clear input" disabled={isLoading}>
                      <X size={14} className="text-[#888] hover:text-red-400 transition-colors" />
                    </button>
                  ) : (
                    <button type="button" onClick={handlePaste} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150" title="Paste from clipboard" disabled={isLoading}>
                      <ClipboardPaste size={14} className="text-[#888] hover:text-white transition-colors" />
                    </button>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="mt-2.5">
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full h-12 bg-[#FE2C55] hover:bg-[#FE2C55]/95 rounded-[12px] font-semibold text-base flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-70 shadow-[0_4px_16px_rgba(254,44,85,0.25)]"
                  >
                    {isLoading ? (
                      <RefreshCw className="animate-spin" size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    {isLoading ? 'Fetching...' : 'Download'}
                  </motion.button>
                </form>
              </motion.div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-red-400 text-sm">
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Feature tags */}
              <motion.div initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.4 }} className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#FE2C55]/10 text-[#FE2C55] border border-[#FE2C55]/20">
                  <Play size={10} /> MP4 HD
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20">
                  <Music size={10} /> MP3 Audio
                </span>
              </motion.div>
            </div>
          </section>

          {/* ===== Banner Ad 2: Between URL Input and Result Card ===== */}
          {landingAds.inlineAds.filter(a => a.placement === 'between_url_download').length > 0 && (
            <div className="max-w-xl mx-auto px-4 sm:px-6 my-2">
              {landingAds.inlineAds.filter(a => a.placement === 'between_url_download').map(ad => renderAdSlot(ad))}
            </div>
          )}

          {/* ===== Video Result Section ===== */}
          <AnimatePresence>
            {/* ===== Unavailable State — Premium Popup ===== */}
            {isUnavailable && (() => {
              const msg = getUnavailableMessage(unavailableReason);
              return (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="max-w-md mx-auto px-4 sm:px-6 py-4"
                >
                  <div className="glass rounded-[16px] p-6 sm:p-8 text-center">
                    <div className="text-4xl mb-3">{msg.icon}</div>
                    <h3 className="text-lg font-semibold mb-2">{msg.title}</h3>
                    <p className="text-gray-400 text-sm mb-5">{msg.desc}</p>
                    <button
                      onClick={() => { resetInterface(); setUrl(''); }}
                      className="bg-[#FE2C55]/15 hover:bg-[#FE2C55]/25 text-[#FE2C55] px-5 py-2.5 rounded-[12px] text-sm font-medium transition-colors duration-150"
                    >
                      Try Another URL
                    </button>
                  </div>
                </motion.section>
              );
            })()}

            {/* ===== Video Info Card ===== */}
            {videoInfo && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="max-w-4xl mx-auto px-4 sm:px-6 py-4"
              >
                <div ref={resultCardRef} className={`glass rounded-[16px] p-4 sm:p-6 transition-all duration-500 ${resultHighlight ? 'ring-2 ring-[#FE2C55]/60' : ''}`}>
                  {/* Photo/Slide post indicator */}
                  {videoInfo.postType === 'images' && (
                    <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-[10px] bg-[#4ADE80]/10 border border-[#4ADE80]/20">
                      <ImageIcon size={16} className="text-[#4ADE80]" />
                      <span className="text-sm font-medium text-[#4ADE80]">TikTok Photo Post</span>
                      <span className="text-xs text-gray-500 ml-1">({videoInfo.slideImages?.length || 0} images)</span>
                    </div>
                  )}

                  {/* Tab selector — swipeable */}
                  <div
                    ref={tabContainerRef}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    className="flex gap-2 mb-5 select-none"
                  >
                    <button
                      onClick={() => setActiveTab('video')}
                      className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-all duration-200 ${activeTab === 'video' ? 'bg-[#FE2C55] text-white' : 'bg-white/10 text-gray-400 hover:bg-white/15'}`}
                    >
                      <Play size={14} className="inline mr-1" /> Video
                    </button>
                    <button
                      onClick={() => setActiveTab('audio')}
                      className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-all duration-200 ${activeTab === 'audio' ? 'bg-[#38BDF8] text-black' : 'bg-white/10 text-gray-400 hover:bg-white/15'}`}
                    >
                      <Music size={14} className="inline mr-1" /> Audio
                    </button>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-5">
                    {/* Preview */}
                    <div className="lg:flex-1">
                      {/* Photo/slide post: download mode selector */}
                      {videoInfo.postType === 'images' && activeTab === 'video' && (
                        <div className="mb-4">
                          <p className="text-sm text-gray-400 mb-2">Download Mode</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setImagePostMode('video')}
                              className={`flex-1 px-3 py-2 rounded-[10px] text-sm font-medium transition-colors duration-150 ${imagePostMode === 'video' ? 'bg-[#FE2C55] text-white' : 'bg-white/10 text-gray-400 hover:bg-white/15'}`}
                            >
                              <Play size={14} className="inline mr-1" />Download as Video
                            </button>
                            <button
                              onClick={() => setImagePostMode('images')}
                              className={`flex-1 px-3 py-2 rounded-[10px] text-sm font-medium transition-colors duration-150 ${imagePostMode === 'images' ? 'bg-[#4ADE80] text-black' : 'bg-white/10 text-gray-400 hover:bg-white/15'}`}
                            >
                              <ImageIcon size={14} className="inline mr-1" />Download Original Slides
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Photo/slide: horizontal swipe gallery */}
                      {videoInfo.postType === 'images' && activeTab === 'video' && imagePostMode === 'images' && videoInfo.slideImages && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedImages.size === videoInfo.slideImages.length}
                                onChange={() => {
                                  if (selectedImages.size === videoInfo.slideImages!.length) {
                                    setSelectedImages(new Set());
                                  } else {
                                    setSelectedImages(new Set(videoInfo.slideImages!.map((_, i) => i)));
                                  }
                                }}
                                className="accent-[#4ADE80]"
                              />
                              Select All
                            </label>
                            <span className="text-xs text-gray-500">{selectedImages.size} of {videoInfo.slideImages.length} selected</span>
                          </div>
                          {/* Grid gallery — 2 columns on mobile, 3 on sm+ */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {videoInfo.slideImages.map((imgUrl, idx) => (
                              <div
                                key={idx}
                                className={`relative rounded-[10px] overflow-hidden cursor-pointer transition-all duration-150 aspect-[3/4] ${selectedImages.has(idx) ? 'ring-2 ring-[#4ADE80] shadow-[0_0_12px_rgba(74,222,128,0.2)]' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
                                onClick={() => {
                                  setSelectedImages(prev => {
                                    const next = new Set(prev);
                                    if (next.has(idx)) next.delete(idx); else next.add(idx);
                                    return next;
                                  });
                                }}
                              >
                                <img
                                  src={`/api/proxy?url=${encodeURIComponent(imgUrl)}&filename=image_${idx + 1}.jpg&mode=inline`}
                                  alt={`Image ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/icon-512.png'; }}
                                />
                                {/* Selection overlay */}
                                {selectedImages.has(idx) && (
                                  <div className="absolute inset-0 bg-[#4ADE80]/15 pointer-events-none" />
                                )}
                                {/* Checkbox */}
                                <div className="absolute top-1.5 left-1.5">
                                  <input
                                    type="checkbox"
                                    checked={selectedImages.has(idx)}
                                    onChange={() => {
                                      setSelectedImages(prev => {
                                        const next = new Set(prev);
                                        if (next.has(idx)) next.delete(idx); else next.add(idx);
                                        return next;
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="accent-[#4ADE80] w-3.5 h-3.5"
                                  />
                                </div>
                                {/* Image number badge */}
                                <div className="absolute bottom-1 right-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
                                  {idx + 1}
                                </div>
                                {/* Individual download button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(imgUrl, sanitizeFilename(`${videoInfo.title || videoInfo.id}_${idx + 1}.jpg`));
                                  }}
                                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-md flex items-center justify-center transition-opacity duration-150"
                                  title={`Download image ${idx + 1}`}
                                >
                                  <Download size={11} className="text-white" />
                                </button>
                              </div>
                            ))}
                          </div>
                          {/* Download actions for slides */}
                          <div className="flex gap-2 flex-wrap">
                            {selectedImages.size > 0 && (
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                  const imgs = videoInfo.slideImages!;
                                  selectedImages.forEach(idx => {
                                    handleDownload(imgs[idx], sanitizeFilename(`${videoInfo.title || videoInfo.id}_${idx + 1}.jpg`));
                                  });
                                }}
                                className="flex-1 min-w-[140px] bg-[#4ADE80] hover:bg-[#4ADE80]/90 text-black py-2.5 rounded-[12px] font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors duration-150"
                              >
                                <Download size={16} /> Download Selected ({selectedImages.size})
                              </motion.button>
                            )}
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                const imgs = videoInfo.slideImages!;
                                imgs.forEach((imgUrl, idx) => {
                                  handleDownload(imgUrl, sanitizeFilename(`${videoInfo.title || videoInfo.id}_${idx + 1}.jpg`));
                                });
                              }}
                              className="flex-1 min-w-[140px] bg-white/10 hover:bg-white/15 py-2.5 rounded-[12px] font-medium text-[14px] flex items-center justify-center gap-2 transition-colors duration-150"
                            >
                              <Download size={16} /> Download All ({videoInfo.slideImages.length})
                            </motion.button>
                          </div>
                        </div>
                      )}

                      {/* Photo post in video mode: show message if slideshow video not available */}
                      {videoInfo.postType === 'images' && activeTab === 'video' && imagePostMode === 'video' && (
                        <div className="rounded-[12px] bg-zinc-900 p-5 flex flex-col items-center justify-center min-h-[180px] text-center">
                          <ImageIcon size={32} className="text-[#4ADE80] mb-3" />
                          <p className="text-sm font-medium mb-1">Photo Post Detected</p>
                          <p className="text-xs text-gray-500 mb-3">This is a photo slideshow. Switch to &quot;Download Original Slides&quot; to save individual images.</p>
                          <button
                            onClick={() => setImagePostMode('images')}
                            className="text-[#4ADE80] text-sm font-medium hover:underline"
                          >
                            View Slides →
                          </button>
                        </div>
                      )}

                      {/* Normal video preview */}
                      {videoInfo.postType !== 'images' && activeTab === 'video' && (
                        <div className="relative rounded-[12px] overflow-hidden bg-zinc-900">
                          <img
                            src={`/api/proxy?url=${encodeURIComponent(videoInfo.thumbnail)}&filename=thumbnail.jpg&mode=inline`}
                            alt={videoInfo.title}
                            className="w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/icon-512.png'; }}
                          />
                          <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                            <Clock size={12} /> {videoInfo.duration}
                          </div>
                        </div>
                      )}
                      {activeTab === 'audio' && (
                        <div className="rounded-[12px] bg-zinc-900 p-5 flex flex-col items-center justify-center min-h-[180px]">
                          <Music size={36} className="text-[#38BDF8] mb-3" />
                          <p className="text-gray-400 text-sm">Audio Preview</p>
                          <p className="text-sm font-semibold mt-2">{videoInfo.title}</p>
                        </div>
                      )}
                    </div>

                    {/* Info + download buttons */}
                    <div className="lg:flex-1 space-y-4">
                      <h3 className="text-base sm:text-lg font-semibold line-clamp-2">{videoInfo.title}</h3>
                      <div className="flex items-center gap-3">
                        {videoInfo.avatar && (
                          <img
                            src={`/api/proxy?url=${encodeURIComponent(videoInfo.avatar)}&filename=avatar.jpg&mode=inline`}
                            alt={videoInfo.author}
                            className="w-9 h-9 rounded-full object-cover bg-zinc-800"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div>
                          <div className="font-medium text-sm">{videoInfo.author}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-3">
                            {videoInfo.views && <span className="flex items-center gap-1"><User size={12} /> {videoInfo.views}</span>}
                            {videoInfo.likes && <span className="flex items-center gap-1"><Heart size={12} /> {videoInfo.likes}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Download actions */}
                      <div className="space-y-2">
                        {activeTab === 'video' && videoInfo.postType !== 'images' && (
                          <>
                            <motion.button
                              whileHover={{ scale: 1.02, y: -1 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleDownload(videoInfo.noWatermarkUrl, getDownloadFilename('video', videoInfo))}
                              className="w-full bg-[#FE2C55] hover:bg-[#FE2C55]/95 py-2.5 rounded-[12px] font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors duration-150 shadow-[0_4px_16px_rgba(254,44,85,0.25)]"
                              disabled={!videoInfo.noWatermarkUrl || videoInfo.noWatermarkUrl.startsWith('#')}
                            >
                              <Download size={16} /> No Watermark HD
                            </motion.button>
                            {videoInfo.withWatermarkUrl && !videoInfo.withWatermarkUrl.startsWith('#') && (
                              <button
                                onClick={() => handleDownload(videoInfo.withWatermarkUrl, sanitizeFilename(`${videoInfo.title || videoInfo.id}_wm.mp4`))}
                                className="w-full bg-white/10 hover:bg-white/15 py-2.5 rounded-[12px] font-medium text-[14px] flex items-center justify-center gap-2 transition-colors duration-150"
                              >
                                <Download size={14} /> With Watermark
                              </button>
                            )}
                          </>
                        )}
                        {activeTab === 'audio' && (
                          <motion.button
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleDownload(videoInfo.audioUrl, getDownloadFilename('audio', videoInfo))}
                            className="w-full bg-[#38BDF8] hover:bg-[#38BDF8]/90 text-black py-2.5 rounded-[12px] font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors duration-150 shadow-[0_4px_16px_rgba(56,189,248,0.25)]"
                            disabled={!videoInfo.audioUrl || videoInfo.audioUrl.startsWith('#')}
                          >
                            <Music size={16} /> Download Audio
                          </motion.button>
                        )}
                      </div>

                      {/* Share button only */}
                      <button
                        onClick={() => {
                          const tikdlShareUrl = `${window.location.origin}?v=${encodeURIComponent(url)}`;
                          if (navigator.share) {
                            navigator.share({
                              title: videoInfo.title,
                              text: `Download: ${videoInfo.title}`,
                              url: tikdlShareUrl,
                            }).catch(() => {});
                          } else {
                            navigator.clipboard.writeText(tikdlShareUrl).then(() => {
                              toast.success('Share link copied!');
                            }).catch(() => {
                              toast.error('Failed to copy');
                            });
                          }
                        }}
                        className="w-full bg-white/5 hover:bg-white/10 py-2 rounded-[10px] text-sm flex items-center justify-center gap-1.5 transition-colors duration-150"
                      >
                        <Share2 size={14} /> Share
                      </button>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* ===== Banner Ad 3: Between Result and Recent Downloads ===== */}
          {(videoInfo || isUnavailable) && landingAds.inlineAds.filter(a => a.placement === 'between_result_recent').length > 0 && (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 my-3">
              {landingAds.inlineAds.filter(a => a.placement === 'between_result_recent').map(ad => renderAdSlot(ad))}
            </div>
          )}

          {/* ===== Recent Downloads Section ===== */}
          {history.length > 0 && (
            <section id="history" ref={historyRef} className="py-4 sm:py-6 px-4 sm:px-6">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-gray-300">Recent Downloads</h2>
                  <button onClick={clearHistory} className="text-xs text-gray-500 hover:text-red-400 transition-colors duration-150">Clear</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="glass rounded-[12px] p-3 flex items-center gap-3 hover:bg-white/5 transition-colors duration-150 cursor-pointer"
                      onClick={() => {
                        resetInterface();
                        setVideoInfo(item);
                        setActiveTab('video');
                        setUrl('');
                        setTimeout(() => {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          setResultHighlight(true);
                          setTimeout(() => setResultHighlight(false), 1500);
                        }, 100);
                      }}
                    >
                      <img
                        src={`/api/proxy?url=${encodeURIComponent(item.thumbnail)}&filename=thumb.jpg&mode=inline`}
                        alt={item.title}
                        className="w-11 h-11 rounded-[10px] object-cover bg-zinc-800"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.author}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ===== Recent Downloads shortcut pill — below result card ===== */}
          {videoInfo && history.length > 0 && (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-1 mb-2 text-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="badge-pulse inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150"
                style={{
                  background: 'rgba(254, 44, 85, 0.12)',
                  color: '#FE2C55',
                  border: '1px solid rgba(254, 44, 85, 0.3)',
                }}
              >
                Recent Downloads <motion.span animate={{ y: [0, 3, 0] }} transition={{ duration: 1.2, repeat: Infinity }}><ChevronDown size={12} /></motion.span>
              </motion.button>
            </div>
          )}

          {/* ===== Banner Ad 4: Between Recent Downloads and How To Use ===== */}
          {landingAds.inlineAds.filter(a => a.placement === 'between_recent_features').length > 0 && (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 my-3">
              {landingAds.inlineAds.filter(a => a.placement === 'between_recent_features').map(ad => renderAdSlot(ad))}
            </div>
          )}

          {/* ===== How To Use Section ===== */}
          <section id="features" className="py-6 sm:py-8 px-4 sm:px-6 bg-[#0a0a0a]">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-center text-lg font-bold mb-5">How To Use</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { step: '1', title: 'Paste URL', desc: 'Copy any TikTok video link and paste it above.', icon: LinkIcon, color: '#FE2C55' },
                  { step: '2', title: 'Fetch', desc: 'We instantly retrieve the HD video and audio.', icon: Zap, color: '#38BDF8' },
                  { step: '3', title: 'Download', desc: 'Save your video or audio — no watermark, no signup.', icon: Download, color: '#4ADE80' },
                ].map((item) => (
                  <motion.div
                    key={item.step}
                    initial={false}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35 }}
                    className="feature-card text-center py-5 px-4"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${item.color}15` }}>
                      <item.icon size={20} style={{ color: item.color }} />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                    <p className="text-[#9CA3AF] text-xs leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* ===== Banner Ad 5: Between How To Use and FAQ ===== */}
          {landingAds.inlineAds.filter(a => a.placement === 'between_features_faq').length > 0 && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 my-3">
              {landingAds.inlineAds.filter(a => a.placement === 'between_features_faq').map(ad => renderAdSlot(ad))}
            </div>
          )}

          {/* ===== FAQ Section — Single floating accordion ===== */}
          <section id="faq" className="py-6 sm:py-8 px-4 sm:px-6 bg-[#121212]">
            <div className="max-w-3xl mx-auto">
              <div className="glass rounded-[14px] overflow-hidden">
                <button
                  onClick={() => setOpenFAQ(!openFAQ)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors duration-150"
                >
                  <span className="font-semibold text-sm">Frequently Asked Questions</span>
                  {openFAQ ? <ChevronUp size={16} className="text-[#FE2C55] shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                </button>
                <AnimatePresence>
                  {openFAQ && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-2">
                        {FAQ_ITEMS.map((item, index) => (
                          <details key={index} className="group glass rounded-[10px]">
                            <summary className="flex items-center justify-between p-3 text-left cursor-pointer text-sm font-medium hover:bg-white/5 transition-colors duration-150 list-none">
                              <span className="pr-4">{item.question}</span>
                              <ChevronDown size={14} className="text-gray-400 shrink-0 group-open:rotate-180 transition-transform duration-200" />
                            </summary>
                            <div className="px-3 pb-3 text-[#9CA3AF] text-sm leading-relaxed">
                              {item.answer}
                            </div>
                          </details>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>

        </div>

        {/* Right Sidebar Ad */}
        {landingAds.sidebarAds.filter(a => a.placement === 'right_sidebar').length > 0 && (
          <aside className="hidden xl:block w-[160px] flex-shrink-0 px-2 pt-8">
            {landingAds.sidebarAds.filter(a => a.placement === 'right_sidebar').map(ad => renderAdSlot(ad, 'ad-slot-sidebar'))}
          </aside>
        )}
      </div>

      {/* ===== Banner Ad 6: Above Footer ===== */}
      {landingAds.bannerAds.filter(a => a.placement === 'above_footer').length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-2">
          {landingAds.bannerAds.filter(a => a.placement === 'above_footer').map(ad => renderAdSlot(ad, 'ad-slot-banner'))}
        </div>
      )}

      {/* ===== Footer ===== */}
      <SiteFooter />

      {/* ===== Ad Interstitial Popup ===== */}
      <AnimatePresence>
        {showAdPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="glass w-full max-w-[420px] rounded-[16px] p-5 sm:p-6 text-center"
            >
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="text-[#9CA3AF] mb-1 text-xs font-medium tracking-wider uppercase">
                Sponsored
              </motion.div>
              <motion.h3 initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-base sm:text-lg font-semibold mb-4">
                {interstitialConfig.popupTitle}
              </motion.h3>

              {/* Dynamic Ad area */}
              {(() => {
                const dims = landingAds.interstitialAd?.dimensions || '300x250';
                const dw = parseInt(dims.split('x')[0]) || 300;
                const dh = parseInt(dims.split('x')[1]) || 250;
                const maxW = Math.min(dw, 380);
                const maxH = Math.min(dh, 280);
                if (landingAds.interstitialAd?.adCode) {
                  const safeInterstitialHtml = sanitizeAdHtml(landingAds.interstitialAd.adCode);
                  return (
                    <div className="mx-auto mb-4 overflow-hidden rounded-lg" style={{ maxWidth: maxW, height: maxH }} dangerouslySetInnerHTML={{ __html: safeInterstitialHtml }} />
                  );
                }
                return (
                  <div className="ad-placeholder mx-auto mb-4 flex items-center justify-center text-gray-500 text-sm overflow-hidden" style={{ maxWidth: maxW, height: maxH }}>
                    <div className="flex flex-col items-center gap-2">
                      <Globe size={18} className="text-gray-600" />
                      <span className="text-gray-400 text-xs">Advertisement</span>
                      <span className="text-[10px] text-gray-500">{dw} × {dh}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Circular countdown ring */}
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 200 }} className="flex items-center justify-center mb-2">
                <div className="relative w-14 h-14">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                    <circle cx="40" cy="40" r="36" fill="none" stroke="#FE2C55" strokeWidth="4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} style={{ transition: 'stroke-dashoffset 0.5s ease-out' }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {countdown > 0 ? (
                      <motion.span key={countdown} initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }} className="text-xl font-bold tabular-nums" style={{ animation: 'subtlePulse 1s ease-in-out infinite' }}>
                        {countdown}
                      </motion.span>
                    ) : (
                      <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300 }} className="text-[#25F4EE]">
                        <CheckCircle size={22} />
                      </motion.span>
                    )}
                  </div>
                </div>
              </motion.div>

              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-sm text-[#9CA3AF] mb-1">
                {autoProceedDone ? 'Starting download...' : interstitialConfig.popupDescription}
              </motion.p>
              <p className="text-[11px] text-gray-500">Ads keep this service free for everyone</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TikTokDownloader;
