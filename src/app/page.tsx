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
  /** Additional metadata for richer display */
  comments?: string;
  shares?: string;
  followers?: string;
  /** Timestamp for history expiry */
  _timestamp?: number;
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

  const adTimerRef = useRef<number | null>(null);
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
  // Slide carousel swipe state (separate from tab swipe)
  const [slideTouchStart, setSlideTouchStart] = useState<number | null>(null);
  const [slideTouchCurrent, setSlideTouchCurrent] = useState<number>(0);
  // Slide carousel index
  const [currentSlide, setCurrentSlide] = useState(0);

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

  // Load history from localStorage (with 24h expiry)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tiktokHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          const DAY = 24 * 60 * 60 * 1000;
          // Filter out entries older than 24h
          const fresh = parsed.filter((item: any) => {
            if (!item._timestamp) return true; // keep legacy entries without timestamp
            return (now - item._timestamp) < DAY;
          });
          setHistory(fresh.slice(0, 10));
        }
      }
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

      // Handle non-200 responses — NEVER expose backend/internal status codes or messages
      if (!response.ok && response.status !== 200) {
        // Try to parse JSON for errorCode, but NEVER leak the raw error message
        let parsedResult: any = null;
        try { parsedResult = await response.json(); } catch { /* non-JSON response (e.g. Vercel 502 HTML page) */ }

        // Check for content-level error codes from our API
        if (parsedResult?.errorCode) {
          const unavailableCodes = ['PRIVATE_CONTENT', 'DELETED_CONTENT', 'AGE_RESTRICTED', 'GEO_BLOCKED'];
          if (unavailableCodes.includes(parsedResult.errorCode)) {
            setIsUnavailable(true);
            setUnavailableReason('This video is unavailable. It was removed by the creator or is no longer available on TikTok.');
            setVideoInfo(null);
            toast.error('This TikTok isn\'t available');
            return;
          }
        }

        // ALL other non-200 responses (429, 502, 500, 503, etc.) —
        // NEVER expose "Too many requests", "Server returned 502", rate limit, or any backend message.
        // Always show "Video unavailable" to the user.
        throw new Error('Video unavailable');
      }

      const result = await response.json();

      if (!result.success) {
        // Determine user-facing message — NEVER expose provider/API/quota/backend errors
        const unavailableCodes = ['PRIVATE_CONTENT', 'DELETED_CONTENT', 'AGE_RESTRICTED', 'GEO_BLOCKED'];
        const isUnavail = unavailableCodes.some(c => result.errorCode === c);

        if (isUnavail) {
          setIsUnavailable(true);
          setUnavailableReason('This video is unavailable. It was removed by the creator or is no longer available on TikTok.');
          setVideoInfo(null);
          toast.error('This TikTok isn\'t available');
          return;
        }

        // ALL other errors — never leak backend details. Show only "Video unavailable".
        throw new Error('Video unavailable');
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
        setCurrentSlide(0);
      } else {
        setImagePostMode('video');
        setSelectedImages(new Set());
      }
      setActiveTab('video');
      setHistory(prev => [{ ...data, _timestamp: Date.now() }, ...prev.slice(0, 9)]);
      toast.success('Video ready!');

      // Scroll to result card after fetch — use requestAnimationFrame for reliable timing
      // This ensures the DOM has committed the new videoInfo state before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resultCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    } catch (err: unknown) {
      let errorMessage = err instanceof Error ? err.message : 'Video unavailable';
      // NEVER show provider/API/quota/backend errors to users
      // If the message contains any internal/technical keywords, replace with generic message
      const internalKeywords = ['quota', 'tikhub', 'rapidapi', 'provider', 'spi ', 'rate limit', 'offline', 'circuit', 'fallback', 'timeout', 'retry', 'v1 ', 'v2 ', 'v3 ', 'ssstik', 'musicaldown', 'tikcdn', 'error code', 'status:', 'http', 'api key', 'unauthorized', 'forbidden', 'internal', '502', '500', '503', '429', 'server returned', 'failed to fetch', 'network'];
      const isInternalError = internalKeywords.some(k => errorMessage.toLowerCase().includes(k));
      if (isInternalError) {
        errorMessage = 'Video unavailable';
      }
      setError(errorMessage);
      toast.error(errorMessage);
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

  // Ad popup timer — smooth animation using requestAnimationFrame
  const startAdTimer = useCallback((downloadUrl: string, filename: string) => {
    const duration = interstitialConfig.countdownDuration || 5;
    setCountdown(duration);
    setAutoProceedDone(false);
    autoProceedRef.current = false;
    setShowAdPopup(true);
    setPendingDownload({ url: downloadUrl, filename });
    countdownRef.current = duration;
    if (adTimerRef.current) cancelAnimationFrame(adTimerRef.current);
    const targetTime = Date.now() + duration * 1000;
    const tick = () => {
      const remaining = Math.max(0, (targetTime - Date.now()) / 1000);
      countdownRef.current = remaining;
      setCountdown(remaining);
      if (remaining <= 0) {
        adTimerRef.current = null;
        return;
      }
      adTimerRef.current = requestAnimationFrame(tick);
    };
    adTimerRef.current = requestAnimationFrame(tick);
  }, [interstitialConfig.countdownDuration]);

  // ──── STREAMING DOWNLOAD: Direct <a> link to proxy ────
  // The proxy streams the file from CDN → browser. No server-side buffering.
  // The browser starts downloading from byte 0 immediately.
  // Progress is visible in the browser's download UI.
  //
  // The <a> link triggers the download immediately. If the proxy returns
  // an error (403/404), the browser will show a failed download — but since
  // we use Content-Type: text/plain for errors, it won't create a .json file.
  // We do a background HEAD check only to show a toast on error.
  const triggerProxyDownload = useCallback((downloadUrl: string, filename: string) => {
    if (!downloadUrl || downloadUrl.startsWith('#')) {
      toast.error('Download URL not available');
      return;
    }

    const proxyUrl = `/api/proxy?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}`;

    // Trigger the download IMMEDIATELY via <a> link — no waiting for HEAD check
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    // Keep the <a> in the DOM for 100ms before removing — removing it immediately
    // after click() can cancel the download in Safari and some mobile browsers.
    setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
    toast.success(`Downloading ${filename}`);

    // Background HEAD check — if it fails, show a generic warning
    // NEVER expose the HTTP status code (502, 403, etc.) to the user
    fetch(proxyUrl, { method: 'HEAD' }).then(headRes => {
      if (!headRes.ok) {
        toast.error('Download may have failed', { description: 'The file could not be downloaded. Please try again.' });
      }
    }).catch(() => {
      // Network error — download might still work, don't show error
    });
  }, []);

  const proceedAfterAd = useCallback(() => {
    setShowAdPopup(false);
    if (pendingDownload) {
      triggerProxyDownload(pendingDownload.url, pendingDownload.filename);
      setPendingDownload(null);
    }
  }, [pendingDownload, triggerProxyDownload]);

  useEffect(() => {
    if (countdown <= 0 && showAdPopup && interstitialConfig.autoDownload && !autoProceedRef.current) {
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
    // Remove hashtags — Unicode-aware: # followed by any word characters (including Arabic, CJK, etc.)
    let safe = name.replace(/#[\p{L}\p{N}_]+/gu, '');
    // Remove emojis and non-ASCII characters
    safe = safe.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
    // Remove remaining # characters (orphaned hash symbols)
    safe = safe.replace(/#/g, '');
    // Remove invalid filename characters (but keep Unicode letters for international titles)
    safe = safe.replace(/[\\/:*?"<>|\x00-\x1f]/g, '');
    // Collapse multiple spaces into one
    safe = safe.replace(/\s+/g, ' ').trim();
    // Remove leading/trailing dots
    safe = safe.replace(/^[.]+|[.]+$/g, '');
    // Limit length
    if (safe.length > 80) safe = safe.slice(0, 80).trim();
    if (!safe) safe = 'TikTok_Video';
    return safe;
  }, []);

  const getDownloadFilename = useCallback((type: 'video' | 'audio' | 'image', info: VideoInfo, idx?: number, audioExt?: string): string => {
    // Format: VideoTitle-@username-tikdl.extension
    // For slides: VideoTitle-@username-tikdl-slide01.jpg
    const author = sanitizeFilename((info.author || 'tiktok').replace(/^@/, ''));
    const rawTitle = info.title || info.id;
    const cleanTitle = sanitizeFilename(rawTitle);
    const base = `${cleanTitle}-@${author}-tikdl`;
    switch (type) {
      case 'video': return `${base}.mp4`;
      case 'audio': return `${base}.${audioExt || 'm4a'}`;
      case 'image': return `${base}-slide${String((idx ?? 0) + 1).padStart(2, '0')}.jpg`;
    }
  }, [sanitizeFilename]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('tiktokHistory');
    toast.success('History cleared');
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (adTimerRef.current) cancelAnimationFrame(adTimerRef.current); };
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

  // Slide carousel swipe handlers — separate from tab swipe
  const handleSlideTouchStart = useCallback((e: React.TouchEvent) => {
    setSlideTouchStart(e.touches[0].clientX);
    setSlideTouchCurrent(e.touches[0].clientX);
  }, []);

  const handleSlideTouchMove = useCallback((e: React.TouchEvent) => {
    setSlideTouchCurrent(e.touches[0].clientX);
  }, []);

  const handleSlideTouchEnd = useCallback((e: React.TouchEvent) => {
    if (slideTouchStart === null) return;
    const diff = slideTouchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        // Swipe left → next slide (clamped to max)
        setCurrentSlide(prev => {
          const max = (videoInfo?.slideImages?.length ?? 1) - 1;
          return Math.min(prev + 1, max);
        });
      } else {
        // Swipe right → prev slide (clamped to 0)
        setCurrentSlide(prev => Math.max(prev - 1, 0));
      }
    }
    setSlideTouchStart(null);
    setSlideTouchCurrent(0);
  }, [slideTouchStart, videoInfo?.slideImages?.length]);

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
      <SiteNavbar isHome currentPage="home" />

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

          {/* ===== Hero Section Ad ===== */}
          {landingAds.inlineAds.filter(a => a.placement === 'hero_section').length > 0 && (
            <div className="max-w-xl mx-auto px-4 sm:px-6 mb-2">
              {landingAds.inlineAds.filter(a => a.placement === 'hero_section').map(ad => renderAdSlot(ad))}
            </div>
          )}

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
                  {/* Tab selector — swipeable (only show for non-photo posts or audio) */}
                  {videoInfo.postType !== 'images' && (
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
                  )}

                  <div className="flex flex-col lg:flex-row gap-5">
                    {/* Preview */}
                    <div className="lg:flex-1">
                      {/* Photo/slide post: Preview Slider + Download controls */}
                      {videoInfo.postType === 'images' && videoInfo.slideImages && videoInfo.slideImages.length > 0 && (
                        <div className="space-y-3">
                          {/* Carousel container — swipeable with touch + mouse drag */}
                          <div
                            className="relative rounded-[12px] overflow-hidden bg-zinc-900 aspect-[3/4] touch-pan-y select-none"
                            onTouchStart={handleSlideTouchStart}
                            onTouchMove={handleSlideTouchMove}
                            onTouchEnd={handleSlideTouchEnd}
                            onMouseDown={(e) => setSlideTouchStart(e.clientX)}
                            onMouseMove={(e) => { if (slideTouchStart !== null) setSlideTouchCurrent(e.clientX); }}
                            onMouseUp={(e) => {
                              if (slideTouchStart === null) return;
                              const diff = slideTouchStart - e.clientX;
                              if (Math.abs(diff) > 40) {
                                if (diff > 0) {
                                  setCurrentSlide(prev => Math.min(prev + 1, videoInfo.slideImages!.length - 1));
                                } else {
                                  setCurrentSlide(prev => Math.max(prev - 1, 0));
                                }
                              }
                              setSlideTouchStart(null);
                              setSlideTouchCurrent(0);
                            }}
                            onMouseLeave={() => { setSlideTouchStart(null); setSlideTouchCurrent(0); }}
                          >
                            <AnimatePresence mode="wait">
                              <motion.img
                                key={currentSlide}
                                src={`/api/proxy?url=${encodeURIComponent(videoInfo.slideImages[currentSlide])}&filename=image_${currentSlide + 1}.jpg&mode=inline`}
                                alt={`Slide ${currentSlide + 1}`}
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -30 }}
                                transition={{ duration: 0.2 }}
                                className="w-full h-full object-contain pointer-events-none"
                                draggable={false}
                                onError={(e) => { const img = e.target as HTMLImageElement; img.style.opacity = '0.3'; }}
                              />
                            </AnimatePresence>
                            {/* Nav arrows */}
                            {currentSlide > 0 && (
                              <button onClick={() => setCurrentSlide(i => Math.max(i - 1, 0))} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors">
                                <ChevronDown size={16} className="text-white rotate-90" />
                              </button>
                            )}
                            {currentSlide < videoInfo.slideImages.length - 1 && (
                              <button onClick={() => setCurrentSlide(i => Math.min(i + 1, videoInfo.slideImages!.length - 1))} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors">
                                <ChevronDown size={16} className="text-white -rotate-90" />
                              </button>
                            )}
                            {/* Counter */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full text-xs text-white font-medium">
                              {currentSlide + 1} / {videoInfo.slideImages.length}
                            </div>
                            {/* Checkbox overlay on current slide */}
                            <div className="absolute top-2 left-2">
                              <input
                                type="checkbox"
                                checked={selectedImages.has(currentSlide)}
                                onChange={() => {
                                  setSelectedImages(prev => {
                                    const next = new Set(prev);
                                    if (next.has(currentSlide)) next.delete(currentSlide); else next.add(currentSlide);
                                    return next;
                                  });
                                }}
                                className="accent-[#FE2C55] w-4 h-4"
                              />
                            </div>
                          </div>
                          {/* Select All + count */}
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
                                className="accent-[#FE2C55]"
                              />
                              Select All
                            </label>
                            <span className="text-xs text-gray-500">{selectedImages.size} of {videoInfo.slideImages.length} selected</span>
                          </div>
                          {/* Download Slides (selected) + Download As Video */}
                          <div className="space-y-2">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                if (selectedImages.size === 0) {
                                  toast.error('Select at least one slide to download');
                                  return;
                                }
                                const imgs = videoInfo.slideImages!;
                                const indices = Array.from(selectedImages).sort((a, b) => a - b);
                                if (interstitialConfig.enabled) {
                                  const downloads = indices.map(idx => ({
                                    url: imgs[idx],
                                    filename: getDownloadFilename('image', videoInfo, idx),
                                  }));
                                  setPendingDownload(downloads[0]);
                                  startAdTimer(downloads[0].url, downloads[0].filename);
                                  downloads.slice(1).forEach((dl, i) => {
                                    setTimeout(() => triggerProxyDownload(dl.url, dl.filename), (i + 1) * 500);
                                  });
                                } else {
                                  indices.forEach((idx, i) => {
                                    setTimeout(() => triggerProxyDownload(imgs[idx], getDownloadFilename('image', videoInfo, idx)), i * 300);
                                  });
                                }
                              }}
                              disabled={selectedImages.size === 0}
                              className="w-full bg-[#FE2C55] hover:bg-[#FE2C55]/90 text-white py-2.5 rounded-[12px] font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors duration-150 shadow-[0_4px_16px_rgba(254,44,85,0.25)] disabled:opacity-50"
                            >
                              <Download size={16} /> Download Slides ({selectedImages.size})
                            </motion.button>
                            {videoInfo.noWatermarkUrl && !videoInfo.noWatermarkUrl.startsWith('#') && (
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleDownload(videoInfo.noWatermarkUrl, getDownloadFilename('video', videoInfo))}
                                className="w-full bg-white/10 hover:bg-white/15 text-white py-2.5 rounded-[12px] font-medium text-[14px] flex items-center justify-center gap-2 transition-colors duration-150"
                              >
                                <Play size={16} /> Download As Video
                              </motion.button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Normal video preview */}
                      {videoInfo.postType !== 'images' && activeTab === 'video' && (
                        <div className="relative rounded-[12px] overflow-hidden bg-zinc-900 aspect-[9/16]">
                          {videoInfo.thumbnail ? (
                            <img
                              src={`/api/proxy?url=${encodeURIComponent(videoInfo.thumbnail)}&filename=thumbnail.jpg&mode=inline`}
                              alt={videoInfo.title}
                              className="w-full h-full object-cover"
                              onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                              <Play size={48} className="text-zinc-600" />
                            </div>
                          )}
                          {videoInfo.duration && (
                            <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                              <Clock size={12} /> {videoInfo.duration}
                            </div>
                          )}
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
                          <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
                            {videoInfo.views && <span className="flex items-center gap-1"><User size={12} /> {videoInfo.views} views</span>}
                            {videoInfo.likes && <span className="flex items-center gap-1"><Heart size={12} /> {videoInfo.likes}</span>}
                            {videoInfo.comments && <span className="flex items-center gap-1">💬 {videoInfo.comments}</span>}
                            {videoInfo.shares && <span className="flex items-center gap-1">↗ {videoInfo.shares}</span>}
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
                              className="w-full bg-[#FE2C55] hover:bg-[#FE2C55]/95 py-2.5 rounded-[12px] font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors duration-150 shadow-[0_4px_16px_rgba(254,44,85,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!videoInfo.noWatermarkUrl || videoInfo.noWatermarkUrl.startsWith('#')}
                            >
                              <Download size={16} /> No Watermark HD
                            </motion.button>
                          </>
                        )}
                        {activeTab === 'audio' && (
                          <motion.button
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleDownload(videoInfo.audioUrl, getDownloadFilename('audio', videoInfo))}
                            className="w-full bg-[#38BDF8] hover:bg-[#38BDF8]/90 text-black py-2.5 rounded-[12px] font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors duration-150 shadow-[0_4px_16px_rgba(56,189,248,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* ===== Native Content Ad ===== */}
          {landingAds.inlineAds.filter(a => a.placement === 'native_content').length > 0 && (
            <div className="max-w-xl mx-auto px-4 sm:px-6 my-3">
              {landingAds.inlineAds.filter(a => a.placement === 'native_content').map(ad => renderAdSlot(ad))}
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
                      key={item.id + (item._timestamp || 0)}
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
                      {item.thumbnail ? (
                        <img
                          src={`/api/proxy?url=${encodeURIComponent(item.thumbnail)}&filename=thumb.jpg&mode=inline`}
                          alt={item.title}
                          className="w-11 h-11 rounded-[10px] object-cover bg-zinc-800 flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-[10px] bg-zinc-800 flex-shrink-0 flex items-center justify-center">
                          <Play size={14} className="text-zinc-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">{item.author?.startsWith('@') ? item.author : `@${item.author}`}</p>
                        {item._timestamp && (
                          <p className="text-[10px] text-gray-600 mt-0.5">{new Date(item._timestamp).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ===== Recent Downloads shortcut pill — REMOVED (Issue #13: misplaced below Recent section) ===== */}

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
                  { step: '3', title: 'Download', desc: 'Save your video or audio — no watermark, no signup.', icon: Download, color: '#25F4EE' },
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
                    <circle cx="40" cy="40" r="36" fill="none" stroke="#FE2C55" strokeWidth="4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {countdown > 0 ? (
                      <span className="text-xl font-bold tabular-nums">
                        {Math.ceil(countdown)}
                      </span>
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
