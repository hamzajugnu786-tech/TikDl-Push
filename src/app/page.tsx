'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, X, Play, Music, Image as ImageIcon,
  Clock, User, Heart, RefreshCw, ClipboardPaste,
  ChevronDown, ChevronUp, Shield, Zap, Infinity,
  Smartphone, Globe, CheckCircle, ExternalLink,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { sanitizeAdHtml } from '@/lib/sanitize';

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

const FEATURES = [
  {
    icon: Shield,
    title: 'No Watermark',
    description: 'Download TikTok videos completely free of watermarks. Get clean, original-quality content every time without any branding overlay.',
    color: '#FE2C55',
  },
  {
    icon: Zap,
    title: 'Instant Speed',
    description: 'Our servers process your request in seconds. No waiting, no queues — paste your link and get your download link almost immediately.',
    color: '#FE2C55',
  },
  {
    icon: Infinity,
    title: 'Unlimited Downloads',
    description: 'No daily caps, no signup walls, no paywalls. Download as many TikTok videos as you need, completely free and unlimited.',
    color: '#FE2C55',
  },
  {
    icon: Smartphone,
    title: 'Mobile Friendly',
    description: 'Works perfectly on any device — phone, tablet, or desktop. Our responsive design ensures a smooth experience everywhere.',
    color: '#25F4EE',
  },
  {
    icon: Globe,
    title: 'All Formats',
    description: 'Save videos in HD MP4, extract audio as MP3, or grab cover images. Choose exactly what you need from every TikTok video.',
    color: '#25F4EE',
  },
  {
    icon: CheckCircle,
    title: 'Safe & Private',
    description: 'We never store your data or downloads. Your privacy is fully respected — no tracking, no cookies, no personal information collected.',
    color: '#4ADE80',
  },
];

// Platform architecture kept internally for future NovaDL integration — not shown to users

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How do I download a TikTok video without watermark?',
    answer: 'Simply paste the TikTok video URL into the input field above, click Download, wait for the short ad timer, then click "Continue to Download." The video information will appear with download options for HD video without watermark, audio, and cover image. Click your preferred option and the file will start downloading immediately.',
  },
  {
    question: 'Is this TikTok downloader free to use?',
    answer: 'Yes, completely free with no limitations. You can download as many TikTok videos as you want without any signup, subscription, or hidden fees. We sustain the service through minimal ad support during the download process.',
  },
  {
    question: 'What video quality can I download?',
    answer: 'You can download TikTok videos in their original HD quality without watermark. The resolution matches what was uploaded by the creator — typically 1080p or higher. We never compress or reduce the video quality during the download process.',
  },
  {
    question: 'Can I download TikTok audio or music separately?',
    answer: 'Absolutely! Along with the video download, we provide an MP3 audio extraction option. This lets you save just the music or sound from any TikTok video as a standalone audio file, perfect for creating your own content or enjoying the sound offline.',
  },
  {
    question: 'Does this work on mobile phones?',
    answer: 'Yes, our downloader is fully responsive and works on any device — iPhone, Android, tablets, and desktop computers. Simply open the website in your mobile browser, paste the TikTok link, and download directly to your device. No app installation required.',
  },
  {
    question: 'Where can I find the TikTok video URL?',
    answer: 'Open the TikTok app, find the video you want to download, tap the Share button (arrow icon), and select "Copy Link." The URL will look like "https://vt.tiktok.com/..." or "https://www.tiktok.com/@user/video/...". Paste this URL into our downloader.',
  },
  {
    question: 'Is it legal to download TikTok videos?',
    answer: "Downloading videos for personal offline viewing is generally acceptable. However, re-uploading or redistributing someone else's content without permission may violate copyright laws and TikTok's terms of service. Always respect creators' rights and use downloaded content responsibly.",
  },
  {
    question: 'Why is there a waiting timer before downloading?',
    answer: 'The brief countdown timer supports our free service through ad revenue. This allows us to keep the downloader completely free and unlimited for everyone. Your download will start automatically after the timer completes.',
  },
];

const TikTokDownloader = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<VideoInfo[]>([]);
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'cover'>('video');
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [pendingUrl, setPendingUrl] = useState('');
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
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

  // Fetch interstitial config + landing ads on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config/ads');
        const data = await res.json();
        if (data.success) {
          if (data.interstitial) {
            setInterstitialConfig(data.interstitial);
          }
          setLandingAds({
            interstitial: data.interstitial || interstitialConfig,
            interstitialAd: data.interstitialAd || null,
            sidebarAds: data.sidebarAds || [],
            bannerAds: data.bannerAds || [],
            inlineAds: data.inlineAds || [],
          });
        }
      } catch {
        // Use default config on fetch failure
      }
    };
    fetchConfig();
  }, []);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tiktokHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch (e) {
      console.warn('Failed to load history:', e);
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tiktokHistory', JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save history:', e);
    }
  }, [history]);

  const isValidTikTokUrl = (inputUrl: string): boolean => {
    const regex = /^https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/.+/i;
    return regex.test(inputUrl.trim());
  };

  const startAdTimer = useCallback((videoUrl: string) => {
    const duration = interstitialConfig.countdownDuration || 5;
    setCountdown(duration);
    setAutoProceedDone(false);
    autoProceedRef.current = false;
    setShowAdPopup(true);
    setPendingUrl(videoUrl);
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

  const proceedAfterAd = useCallback(async () => {
    setShowAdPopup(false);

    const videoUrl = pendingUrl;
    if (!videoUrl) return;

    setIsLoading(true);
    setError('');
    setVideoInfo(null);

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
      });

      const result = await response.json();

      // ──── STAGE E: Frontend fetch() response ────
      console.log('[TRACE-E] Frontend received result.success:', result.success);
      console.log('[TRACE-E] Frontend received result.provider:', result.provider);
      console.log('[TRACE-E] typeof result.data:', typeof result.data);
      if (result.data) {
        console.log('[TRACE-E] result.data keys:', Object.keys(result.data));
        console.log('[TRACE-E] result.data.title:', result.data.title);
        console.log('[TRACE-E] result.data.author:', result.data.author);
        console.log('[TRACE-E] result.data.avatar:', result.data.avatar);
        console.log('[TRACE-E] result.data.thumbnail:', result.data.thumbnail);
        console.log('[TRACE-E] result.data.duration:', result.data.duration);
        console.log('[TRACE-E] result.data.views:', result.data.views);
        console.log('[TRACE-E] result.data.likes:', result.data.likes);
        console.log('[TRACE-E] result.data.noWatermarkUrl:', result.data.noWatermarkUrl);
        console.log('[TRACE-E] result.data.withWatermarkUrl:', result.data.withWatermarkUrl);
        console.log('[TRACE-E] result.data.audioUrl:', result.data.audioUrl);
        console.log('[TRACE-E] result.data.cover:', result.data.cover);
      } else {
        console.log('[TRACE-E] result.data is NULL/UNDEFINED — full result:', JSON.stringify(result).slice(0, 500));
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch video info');
      }

      const data: VideoInfo = result.data;
      setVideoInfo(data);
      setHistory(prev => [data, ...prev.slice(0, 4)]);

      toast.success('Video ready!', {
        description: `Fetched via ${result.provider} in ${result.duration}ms`,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to process this video. Try again.';
      console.error('Download error:', err);
      setError(errorMessage);
      toast.error('Fetch failed', { description: errorMessage });
    } finally {
      setIsLoading(false);
      setPendingUrl('');
    }
  }, [pendingUrl]);

  // Auto-proceed when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && showAdPopup && interstitialConfig.autoDownload && !autoProceedRef.current) {
      autoProceedRef.current = true;
      setAutoProceedDone(true);
      const timeout = setTimeout(() => {
        proceedAfterAd();
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [countdown, showAdPopup, interstitialConfig.autoDownload, proceedAfterAd]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error('Enter a TikTok URL');
      return;
    }
    if (!isValidTikTokUrl(trimmed)) {
      setError('Invalid TikTok URL format. Please use a valid TikTok link.');
      toast.error('Please use a valid TikTok link');
      return;
    }
    setError('');
    startAdTimer(trimmed);
  }, [url, startAdTimer]);

  const handleDownload = useCallback((downloadUrl: string, filename: string) => {
    if (!downloadUrl || downloadUrl.startsWith('#')) {
      toast.error('Download URL not available for this video.');
      return;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast.success(`Downloading ${filename}`, {
      description: 'Your file download has started.',
    });
  }, []);

  const getDownloadFilename = useCallback((type: 'video' | 'audio' | 'cover', info: VideoInfo): string => {
    const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const baseName = sanitizeName(info.title || info.id);
    switch (type) {
      case 'video': return `tiktok_${baseName}_no_watermark.mp4`;
      case 'audio': return `tiktok_${baseName}_audio.mp3`;
      case 'cover': return `tiktok_${baseName}_cover.jpg`;
    }
  }, []);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied!`);
    }).catch(() => {
      toast.error('Failed to copy');
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('tiktokHistory');
    toast.success('History cleared');
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (adTimerRef.current) clearInterval(adTimerRef.current);
    };
  }, []);

  // Handle paste from clipboard — auto-hide keyboard
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError('');
      toast.success('Link pasted from clipboard');
      // Auto-hide mobile keyboard
      inputRef.current?.blur();
    } catch {
      toast.error('Cannot read clipboard — please paste manually');
    }
  }, []);

  // Handle clear input
  const handleClearInput = useCallback(() => {
    setUrl('');
    setError('');
    inputRef.current?.focus();
  }, []);

  // Countdown ring calculation
  const circumference = 2 * Math.PI * 36;
  const progress = interstitialConfig.countdownDuration > 0
    ? (interstitialConfig.countdownDuration - countdown) / interstitialConfig.countdownDuration
    : 1;
  const strokeDashoffset = circumference * (1 - progress);

  // Helper: render ad slot — sanitized to prevent XSS
  const renderAdSlot = (ad: LandingAdSlot, className?: string) => {
    if (ad.adCode) {
      const safeHtml = sanitizeAdHtml(ad.adCode);
      return (
        <div key={ad.id} className={className || 'ad-slot-inline'}>
          <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </div>
      );
    }
    // Placeholder
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

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <Toaster position="top-center" richColors closeButton />

      {/* ===== Navbar ===== */}
      <nav className="sticky top-0 z-50 glass border-b border-white/10 bg-black/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#FE2C55] rounded-lg flex items-center justify-center text-base font-bold">♪</div>
            <span className="font-bold text-lg tracking-tighter">TikDL</span>
            <button
              onClick={() => window.location.reload()}
              className="ml-1 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150"
              title="Refresh page"
            >
              <RefreshCw size={14} className="text-gray-400 hover:text-white transition-colors" />
            </button>
          </div>
          <div className="hidden md:flex gap-6 text-sm font-medium text-gray-400">
            <a href="#features" className="hover:text-[#FE2C55] transition-colors duration-150">Features</a>
            <a href="#faq" className="hover:text-[#FE2C55] transition-colors duration-150">FAQ</a>
            <a href="#history" className="hover:text-[#FE2C55] transition-colors duration-150">History</a>
          </div>
        </div>
      </nav>

      {/* ===== Header Banner Ad ===== */}
      {landingAds.bannerAds.filter(a => a.placement === 'header_banner').length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-2">
          {landingAds.bannerAds.filter(a => a.placement === 'header_banner').map(ad => renderAdSlot(ad, 'ad-slot-banner'))}
        </div>
      )}

      {/* ===== Main Content with Sidebar Ads ===== */}
      <div className="flex-1 flex">
        {/* Left Sidebar Ad (desktop only) */}
        {landingAds.sidebarAds.filter(a => a.placement === 'left_sidebar').length > 0 && (
          <aside className="hidden xl:block w-[160px] flex-shrink-0 px-2 pt-8">
            {landingAds.sidebarAds.filter(a => a.placement === 'left_sidebar').map(ad => renderAdSlot(ad, 'ad-slot-sidebar'))}
          </aside>
        )}

        {/* ===== Center Content ===== */}
        <div className="flex-1 min-w-0">

          {/* ===== Hero Section ===== */}
          <section className="pt-8 sm:pt-10 pb-6 sm:pb-8 px-4 sm:px-6">
            <div className="max-w-xl mx-auto text-center">
              {/* Badge — soft sky blue background, white text, light blue border */}
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="badge-pulse inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-6 mt-4"
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#ffffff',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                }}
              >
                Free and Unlimited
              </motion.div>

              {/* Hero heading — reduced "Without Watermark" size */}
              <motion.h1
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-[clamp(32px,4.5vw,46px)] font-extrabold tracking-tight leading-[1.1] mb-5"
              >
                <span className="text-white">TikTok Video</span>
                <br />
                <span className="text-[clamp(24px,3vw,34px)] text-[#FE2C55]">Without Watermark</span>
              </motion.h1>

              {/* Description */}
              <motion.p
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="text-sm text-[#9CA3AF] leading-relaxed max-w-[400px] mx-auto mb-8"
              >
                The fastest and most reliable way to download TikTok videos in HD quality, completely free, with no watermarks, no signup, and no limits.
              </motion.p>



              {/* Input + Button */}
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25 }}
              >
                {/* Standalone input field */}
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(''); }}
                    placeholder="Paste TikTok link here..."
                    className="w-full h-12 bg-[#1a1a1a] border border-[#333] rounded-[12px] pl-4 pr-10 text-sm placeholder:text-[#666] outline-none input-focus-ring disabled:opacity-50"
                    disabled={isLoading || showAdPopup}
                  />
                  {/* Paste/Clear toggle button */}
                  {url ? (
                    <button
                      type="button"
                      onClick={handleClearInput}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150"
                      title="Clear input"
                      disabled={isLoading || showAdPopup}
                    >
                      <X size={14} className="text-[#888] hover:text-red-400 transition-colors" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150"
                      title="Paste from clipboard"
                      disabled={isLoading || showAdPopup}
                    >
                      <ClipboardPaste size={14} className="text-[#888] hover:text-white transition-colors" />
                    </button>
                  )}
                </div>

                {/* Download button */}
                <form onSubmit={handleSubmit} className="mt-2.5">
                  <motion.button
                    type="submit"
                    disabled={isLoading || showAdPopup}
                    whileHover={!isLoading && !showAdPopup ? { scale: 1.02, y: -1 } : {}}
                    whileTap={!isLoading && !showAdPopup ? { scale: 0.98 } : {}}
                    className="w-full h-12 bg-[#FE2C55] hover:bg-[#FE2C55]/95 rounded-[12px] font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60 transition-colors duration-150 shadow-[0_4px_16px_rgba(254,44,85,0.25)]"
                  >
                    {isLoading ? (
                      <RefreshCw className="animate-spin" size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    <span>{isLoading ? 'Processing...' : 'Download'}</span>
                  </motion.button>
                </form>
              </motion.div>

              {/* Error message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-3 max-w-xl mx-auto text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-[12px] px-4 py-2.5"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Feature tags — colored: Red, Sky Blue, Green (slightly smaller, reduced opacity) */}
              <motion.div
                initial={false}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-5 flex flex-wrap justify-center gap-4"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium opacity-75">
                  <Play size={13} className="text-[#FE2C55]" />
                  <span className="text-[#FE2C55]">MP4 HD</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium opacity-75">
                  <Music size={13} className="text-[#38BDF8]" />
                  <span className="text-[#38BDF8]">MP3 Audio</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium opacity-75">
                  <ImageIcon size={13} className="text-[#4ADE80]" />
                  <span className="text-[#4ADE80]">Cover Image</span>
                </span>
              </motion.div>
            </div>
          </section>

          {/* Inline Ad: Between URL Box & Download Button */}
          {landingAds.inlineAds.filter(a => a.placement === 'between_url_download').length > 0 && (
            <div className="max-w-xl mx-auto px-4 sm:px-6 my-2">
              {landingAds.inlineAds.filter(a => a.placement === 'between_url_download').map(ad => renderAdSlot(ad))}
            </div>
          )}

          {/* ===== Video Result Section ===== */}
          <AnimatePresence>
            {videoInfo && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="max-w-4xl mx-auto px-4 sm:px-6 py-6"
              >
                <div className="glass rounded-[16px] p-4 sm:p-6">
                  {/* Tab selector */}
                  <div className="flex gap-2 mb-5">
                    {(['video', 'audio', 'cover'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-colors duration-150 ${
                          activeTab === tab
                            ? 'bg-[#FE2C55] text-white'
                            : 'bg-white/10 text-gray-400 hover:bg-white/15'
                        }`}
                      >
                        {tab === 'video' && <Play size={14} className="inline mr-1" />}
                        {tab === 'audio' && <Music size={14} className="inline mr-1" />}
                        {tab === 'cover' && <ImageIcon size={14} className="inline mr-1" />}
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col lg:flex-row gap-5">
                    {/* Preview */}
                    <div className="lg:flex-1">
                      {activeTab === 'video' && (
                        <div className="relative rounded-[12px] overflow-hidden bg-zinc-900">
                          <img
                            src={videoInfo.thumbnail}
                            alt={videoInfo.title}
                            className="w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/public/icon-512.png'; }}
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
                      {activeTab === 'cover' && (
                        <div className="rounded-[12px] overflow-hidden">
                          <img
                            src={videoInfo.cover || videoInfo.thumbnail}
                            alt="Cover image"
                            className="w-full object-cover"
                          />
                        </div>
                      )}
                    </div>

                    {/* Info + download buttons */}
                    <div className="lg:flex-1 space-y-4">
                      <h3 className="text-base sm:text-lg font-semibold line-clamp-2">{videoInfo.title}</h3>
                      <div className="flex items-center gap-3">
                        {videoInfo.avatar && (
                          <img
                            src={videoInfo.avatar}
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
                        {activeTab === 'video' && (
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
                                onClick={() => handleDownload(videoInfo.withWatermarkUrl, `tiktok_${videoInfo.id}_with_watermark.mp4`)}
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
                            <Music size={16} /> Download MP3 Audio
                          </motion.button>
                        )}
                        {activeTab === 'cover' && (
                          <button
                            onClick={() => handleDownload(videoInfo.cover || videoInfo.thumbnail, getDownloadFilename('cover', videoInfo))}
                            className="w-full bg-[#4ADE80]/15 hover:bg-[#4ADE80]/25 text-[#4ADE80] py-2.5 rounded-[12px] font-medium text-[14px] flex items-center justify-center gap-2 transition-colors duration-150 border border-[#4ADE80]/20"
                            disabled={!videoInfo.cover}
                          >
                            <ImageIcon size={16} /> Download Cover Image
                          </button>
                        )}
                      </div>

                      {/* Copy URL */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(videoInfo.noWatermarkUrl, 'Video URL')}
                          className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-[10px] text-sm flex items-center justify-center gap-1 transition-colors duration-150"
                        >
                          <ExternalLink size={14} /> Copy URL
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Inline Ad: Between Download Section & Features */}
          {landingAds.inlineAds.filter(a => a.placement === 'between_url_download').length > 0 && videoInfo && (
            <div className="max-w-xl mx-auto px-4 sm:px-6 my-3">
              {landingAds.inlineAds.filter(a => a.placement === 'between_url_download').map(ad => renderAdSlot(ad))}
            </div>
          )}

          {/* ===== Features Section ===== */}
          <section id="features" className="py-10 sm:py-14 px-4 sm:px-6 bg-[#0a0a0a]">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="text-center mb-8"
              >
                <h2 className="text-xl sm:text-[24px] font-bold tracking-tight mb-2">
                  Why Choose <span className="text-[#FE2C55]">TikDL</span>
                </h2>
                <p className="text-[#9CA3AF] text-sm max-w-lg mx-auto">
                  The fastest and most reliable TikTok downloader with premium features — completely free.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {FEATURES.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={false}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: index * 0.08 }}
                    className="feature-card"
                  >
                    {/* Icon + Title on same row */}
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-transform group-hover:scale-105"
                        style={{ backgroundColor: `${feature.color}15` }}
                      >
                        <feature.icon size={18} style={{ color: feature.color }} />
                      </div>
                      <h3 className="text-[15px] font-semibold">{feature.title}</h3>
                    </div>
                    <p className="text-[#9CA3AF] text-sm leading-[1.55]">{feature.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Inline Ad: Between Features & FAQ */}
          {landingAds.inlineAds.filter(a => a.placement === 'between_features_faq').length > 0 && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 my-3">
              {landingAds.inlineAds.filter(a => a.placement === 'between_features_faq').map(ad => renderAdSlot(ad))}
            </div>
          )}

          {/* ===== FAQ Section ===== */}
          <section id="faq" className="py-10 sm:py-14 px-4 sm:px-6 bg-[#121212]">
            <div className="max-w-3xl mx-auto">
              <motion.div
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="text-center mb-8"
              >
                <h2 className="text-xl sm:text-[24px] font-bold tracking-tight mb-2">
                  Frequently Asked Questions
                </h2>
                <p className="text-[#9CA3AF] text-sm">
                  Everything you need to know about using TikDL
                </p>
              </motion.div>

              <div className="space-y-2.5">
                {FAQ_ITEMS.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={false}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="glass rounded-[12px] overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                      className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 transition-colors duration-150"
                      aria-expanded={openFAQ === index}
                    >
                      <span className="font-medium text-sm pr-4">{item.question}</span>
                      {openFAQ === index ? (
                        <ChevronUp size={16} className="text-[#FE2C55] shrink-0" />
                      ) : (
                        <ChevronDown size={16} className="text-gray-400 shrink-0" />
                      )}
                    </button>
                    <AnimatePresence>
                      {openFAQ === index && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3.5 pb-3.5 text-[#9CA3AF] text-sm leading-relaxed">
                            {item.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* ===== History Section ===== */}
          {history.length > 0 && (
            <section id="history" className="py-6 sm:py-8 px-4 sm:px-6 bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold">Recent Downloads</h2>
                  <button
                    onClick={clearHistory}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors duration-150"
                  >
                    Clear history
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="glass rounded-[12px] p-3 flex items-center gap-3 hover:bg-white/5 transition-colors duration-150 cursor-pointer"
                      onClick={() => {
                        setVideoInfo(item);
                        setActiveTab('video');
                      }}
                    >
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-12 h-12 rounded-[10px] object-cover bg-zinc-800"
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
        </div>

        {/* Right Sidebar Ad (desktop only) */}
        {landingAds.sidebarAds.filter(a => a.placement === 'right_sidebar').length > 0 && (
          <aside className="hidden xl:block w-[160px] flex-shrink-0 px-2 pt-8">
            {landingAds.sidebarAds.filter(a => a.placement === 'right_sidebar').map(ad => renderAdSlot(ad, 'ad-slot-sidebar'))}
          </aside>
        )}
      </div>

      {/* ===== Footer Banner Ad ===== */}
      {landingAds.bannerAds.filter(a => a.placement === 'above_footer').length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-2">
          {landingAds.bannerAds.filter(a => a.placement === 'above_footer').map(ad => renderAdSlot(ad, 'ad-slot-banner'))}
        </div>
      )}

      {/* ===== Footer ===== */}
      <footer className="py-6 px-4 sm:px-6 bg-[#0a0a0a] border-t border-white/10 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#FE2C55] rounded-lg flex items-center justify-center text-sm font-bold">♪</div>
            <span className="font-bold text-base tracking-tighter">TikDL</span>
          </div>
          <div className="flex gap-5 text-sm text-gray-500">
            <a href="#features" className="hover:text-[#FE2C55] transition-colors duration-150">Features</a>
            <a href="#faq" className="hover:text-[#FE2C55] transition-colors duration-150">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-600">
              TikDL is not affiliated with TikTok. For personal use only.
            </p>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-4 pt-3 border-t border-white/5 text-center">
          <p className="text-xs text-gray-500">
            Powered by{' '}
            <a
              href="https://silbren.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9CA3AF] hover:text-white transition-colors duration-150 font-medium"
            >
              Silbren.com
            </a>
          </p>
        </div>
      </footer>

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
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 }}
                className="text-[#9CA3AF] mb-1 text-xs font-medium tracking-wider uppercase"
              >
                Sponsored
              </motion.div>
              <motion.h3
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-base sm:text-lg font-semibold mb-4"
              >
                {interstitialConfig.popupTitle}
              </motion.h3>

              {/* Dynamic Ad area — dimensions based on config */}
              {(() => {
                const dims = landingAds.interstitialAd?.dimensions || '300x250';
                const dw = parseInt(dims.split('x')[0]) || 300;
                const dh = parseInt(dims.split('x')[1]) || 250;
                const maxW = Math.min(dw, 380);
                const maxH = Math.min(dh, 280);
                if (landingAds.interstitialAd?.adCode) {
                  const safeInterstitialHtml = sanitizeAdHtml(landingAds.interstitialAd.adCode);
                  return (
                    <div
                      className="mx-auto mb-4 overflow-hidden rounded-lg"
                      style={{ maxWidth: maxW, height: maxH }}
                      dangerouslySetInnerHTML={{ __html: safeInterstitialHtml }}
                    />
                  );
                }
                return (
                  <div
                    className="ad-placeholder mx-auto mb-4 flex items-center justify-center text-gray-500 text-sm overflow-hidden"
                    style={{ maxWidth: maxW, height: maxH }}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Globe size={18} className="text-gray-600" />
                      <span className="text-gray-400 text-xs">Advertisement</span>
                      <span className="text-[10px] text-gray-500">{dw} × {dh}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Circular countdown ring */}
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                className="flex items-center justify-center mb-2"
              >
                <div className="relative w-14 h-14">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      fill="none"
                      stroke="#FE2C55"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {countdown > 0 ? (
                      <motion.span
                        key={countdown}
                        initial={{ scale: 1.2, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className="text-xl font-bold tabular-nums"
                        style={{ animation: 'subtlePulse 1s ease-in-out infinite' }}
                      >
                        {countdown}
                      </motion.span>
                    ) : (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                        className="text-[#25F4EE]"
                      >
                        <CheckCircle size={22} />
                      </motion.span>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Auto-start message */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-sm text-[#9CA3AF] mb-1"
              >
                {autoProceedDone
                  ? 'Starting download...'
                  : interstitialConfig.popupDescription}
              </motion.p>

              <p className="text-[11px] text-gray-500">
                Ads keep this service free for everyone
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TikTokDownloader;
