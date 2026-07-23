'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, X, Play, Music, Image as ImageIcon,
  Clock, User, Heart, RefreshCw, ClipboardPaste,
  ChevronDown, ChevronUp, Shield, Zap, Infinity,
  Smartphone, Globe, CheckCircle, ExternalLink
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

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
    color: '#25F4EE',
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
    color: '#FE2C55',
  },
  {
    icon: CheckCircle,
    title: 'Safe & Private',
    description: 'We never store your data or downloads. Your privacy is fully respected — no tracking, no cookies, no personal information collected.',
    color: '#25F4EE',
  },
];

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
    answer: 'Downloading videos for personal offline viewing is generally acceptable. However, re-uploading or redistributing someone else\'s content without permission may violate copyright laws and TikTok\'s terms of service. Always respect creators\' rights and use downloaded content responsibly.',
  },
  {
    question: 'Why is there a waiting timer before downloading?',
    answer: 'The brief countdown timer supports our free service through ad revenue. This allows us to keep the downloader completely free and unlimited for everyone. The wait is only a few seconds, and you can skip it once the timer completes.',
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
  const [isAdComplete, setIsAdComplete] = useState(false);
  const [pendingUrl, setPendingUrl] = useState('');
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const adTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number>(5);
  const isAdCompleteRef = useRef(false);

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
    // Reset state
    setCountdown(5);
    setIsAdComplete(false);
    setShowAdPopup(true);
    setPendingUrl(videoUrl);
    countdownRef.current = 5;
    isAdCompleteRef.current = false;

    // Start countdown
    if (adTimerRef.current) clearInterval(adTimerRef.current);

    adTimerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);

      if (countdownRef.current <= 0) {
        if (adTimerRef.current) clearInterval(adTimerRef.current);
        adTimerRef.current = null;
        setIsAdComplete(true);
        isAdCompleteRef.current = true;
      }
    }, 1000);
  }, []);

  const skipAd = useCallback(() => {
    if (adTimerRef.current) {
      clearInterval(adTimerRef.current);
      adTimerRef.current = null;
    }
    setIsAdComplete(true);
    isAdCompleteRef.current = true;
    setCountdown(0);
  }, []);

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

    // Use a hidden anchor to trigger the actual download
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

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <Toaster position="top-center" richColors closeButton />

      {/* ===== Navbar ===== */}
      <nav className="sticky top-0 z-50 glass border-b border-white/10 bg-black/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#FE2C55] rounded-xl flex items-center justify-center text-xl font-bold">♪</div>
            <span className="font-bold text-2xl sm:text-3xl tracking-tighter">TikDL</span>
          </div>
          <div className="hidden md:flex gap-8 text-sm font-medium">
            <a href="#features" className="hover:text-[#FE2C55] transition-colors">Features</a>
            <a href="#faq" className="hover:text-[#FE2C55] transition-colors">FAQ</a>
            <a href="#history" className="hover:text-[#FE2C55] transition-colors">History</a>
          </div>
        </div>
      </nav>

      {/* ===== Hero Section ===== */}
      <section className="pt-16 sm:pt-20 pb-10 sm:pb-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter mb-4 sm:mb-6"
          >
            TikTok Without Watermark
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg sm:text-xl text-gray-400 mb-8 sm:mb-10"
          >
            Fast, unlimited, high-quality downloads. No signup required.
          </motion.p>

          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass p-2 rounded-3xl flex flex-col sm:flex-row gap-3 max-w-xl mx-auto"
          >
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(''); }}
              placeholder="Paste TikTok link here..."
              className="flex-1 bg-transparent px-4 sm:px-6 py-4 sm:py-5 outline-none text-base sm:text-lg placeholder:text-gray-500"
              disabled={isLoading || showAdPopup}
            />
            <div className="flex gap-2 px-2 pb-2 sm:pb-0">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    setUrl(text);
                    setError('');
                    toast.success('Link pasted from clipboard');
                  } catch {
                    toast.error('Cannot read clipboard — please paste manually');
                  }
                }}
                className="px-4 sm:px-6 py-4 sm:py-5 rounded-2xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
                title="Paste from clipboard"
                disabled={isLoading || showAdPopup}
              >
                <ClipboardPaste size={20} />
              </button>
              <button
                type="submit"
                disabled={isLoading || showAdPopup}
                className="px-8 sm:px-10 py-4 sm:py-5 bg-[#FE2C55] hover:bg-[#FE2C55]/90 rounded-2xl font-semibold flex items-center gap-2 disabled:opacity-60 transition-colors"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <Download size={20} />}
                <span>{isLoading ? 'Processing...' : 'Download'}</span>
              </button>
            </div>
          </motion.form>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 max-w-xl mx-auto text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Supported formats hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-6 flex flex-wrap justify-center gap-3 text-xs text-gray-500"
          >
            <span className="flex items-center gap-1"><Play size={14} /> MP4 HD</span>
            <span className="flex items-center gap-1"><Music size={14} /> MP3 Audio</span>
            <span className="flex items-center gap-1"><ImageIcon size={14} /> Cover Image</span>
          </motion.div>
        </div>
      </section>

      {/* ===== Video Result Section ===== */}
      <AnimatePresence>
        {videoInfo && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8"
          >
            <div className="glass rounded-3xl p-4 sm:p-8">
              {/* Tab selector */}
              <div className="flex gap-2 mb-6">
                {(['video', 'audio', 'cover'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-[#FE2C55] text-white'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                    }`}
                  >
                    {tab === 'video' && <Play size={16} className="inline mr-1" />}
                    {tab === 'audio' && <Music size={16} className="inline mr-1" />}
                    {tab === 'cover' && <ImageIcon size={16} className="inline mr-1" />}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
                {/* Preview */}
                <div className="lg:flex-1">
                  {activeTab === 'video' && (
                    <div className="relative rounded-2xl overflow-hidden bg-zinc-900">
                      <img
                        src={videoInfo.thumbnail}
                        alt={videoInfo.title}
                        className="w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/public/icon-512.png'; }}
                      />
                      <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                        <Clock size={12} /> {videoInfo.duration}
                      </div>
                    </div>
                  )}
                  {activeTab === 'audio' && (
                    <div className="rounded-2xl bg-zinc-900 p-6 flex flex-col items-center justify-center min-h-[200px]">
                      <Music size={48} className="text-[#25F4EE] mb-4" />
                      <p className="text-gray-400 text-sm">Audio Preview</p>
                      <p className="text-lg font-semibold mt-2">{videoInfo.title}</p>
                    </div>
                  )}
                  {activeTab === 'cover' && (
                    <div className="rounded-2xl overflow-hidden">
                      <img
                        src={videoInfo.cover || videoInfo.thumbnail}
                        alt="Cover image"
                        className="w-full object-cover"
                      />
                    </div>
                  )}
                </div>

                {/* Info + download buttons */}
                <div className="lg:flex-1 space-y-4 sm:space-y-6">
                  <h3 className="text-xl sm:text-2xl font-semibold line-clamp-2">{videoInfo.title}</h3>

                  <div className="flex items-center gap-3">
                    {videoInfo.avatar && (
                      <img
                        src={videoInfo.avatar}
                        alt={videoInfo.author}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover bg-zinc-800"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div>
                      <div className="font-medium">{videoInfo.author}</div>
                      <div className="text-sm text-gray-500 flex items-center gap-3">
                        {videoInfo.views && <span className="flex items-center gap-1"><User size={14} /> {videoInfo.views}</span>}
                        {videoInfo.likes && <span className="flex items-center gap-1"><Heart size={14} /> {videoInfo.likes}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Download actions */}
                  <div className="space-y-3">
                    {activeTab === 'video' && (
                      <>
                        <button
                          onClick={() => handleDownload(videoInfo.noWatermarkUrl, getDownloadFilename('video', videoInfo))}
                          className="w-full bg-[#FE2C55] hover:bg-[#FE2C55]/90 py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors"
                          disabled={!videoInfo.noWatermarkUrl || videoInfo.noWatermarkUrl.startsWith('#')}
                        >
                          <Download size={20} /> No Watermark HD
                        </button>
                        {videoInfo.withWatermarkUrl && !videoInfo.withWatermarkUrl.startsWith('#') && (
                          <button
                            onClick={() => handleDownload(videoInfo.withWatermarkUrl, `tiktok_${videoInfo.id}_with_watermark.mp4`)}
                            className="w-full bg-white/10 hover:bg-white/20 py-3 rounded-2xl font-medium flex items-center justify-center gap-2 transition-colors"
                          >
                            <Download size={18} /> With Watermark
                          </button>
                        )}
                      </>
                    )}
                    {activeTab === 'audio' && (
                      <button
                        onClick={() => handleDownload(videoInfo.audioUrl, getDownloadFilename('audio', videoInfo))}
                        className="w-full bg-[#25F4EE] hover:bg-[#25F4EE]/90 text-black py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors"
                        disabled={!videoInfo.audioUrl || videoInfo.audioUrl.startsWith('#')}
                      >
                        <Music size={20} /> Download MP3 Audio
                      </button>
                    )}
                    {activeTab === 'cover' && (
                      <button
                        onClick={() => handleDownload(videoInfo.cover || videoInfo.thumbnail, getDownloadFilename('cover', videoInfo))}
                        className="w-full bg-white/10 hover:bg-white/20 py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors"
                        disabled={!videoInfo.cover}
                      >
                        <ImageIcon size={20} /> Download Cover Image
                      </button>
                    )}
                  </div>

                  {/* Copy URL */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(videoInfo.noWatermarkUrl, 'Video URL')}
                      className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-xl text-sm flex items-center justify-center gap-1 transition-colors"
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

      {/* ===== Ad Interstitial Popup ===== */}
      <AnimatePresence>
        {showAdPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 sm:p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass max-w-md w-full rounded-3xl p-6 sm:p-10 text-center"
            >
              <div className="text-[#25F4EE] mb-3 text-sm font-medium tracking-wider uppercase">Sponsored</div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">Support free downloads</h3>

              {/* Ad space */}
              <div className="h-36 sm:h-48 bg-zinc-900 rounded-2xl mb-6 sm:mb-8 flex items-center justify-center border border-dashed border-white/20 text-gray-500 text-sm">
                {/* Insert your ad provider code here (e.g., Adsterra, Google Ad) */}
                Ad Space — Insert Ad Code
              </div>

              {/* Countdown */}
              <div className="text-4xl sm:text-5xl font-mono mb-6 sm:mb-8 tabular-nums font-bold">
                {countdown > 0 ? countdown : <span className="text-[#25F4EE]">✓</span>}
              </div>

              {/* Continue button */}
              <button
                onClick={isAdComplete ? proceedAfterAd : skipAd}
                disabled={countdown > 0 && !isAdComplete}
                className="w-full py-4 bg-[#FE2C55] hover:bg-[#FE2C55]/90 text-white font-semibold rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {countdown > 0 ? `Continue in ${countdown}s` : 'Continue to Download'}
              </button>

              <p className="text-xs text-gray-500 mt-4">
                Ads keep this service free for everyone
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Features Section ===== */}
      <section id="features" className="py-16 sm:py-20 px-4 sm:px-6 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Why Choose <span className="text-[#FE2C55]">TikDL</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              The fastest and most reliable TikTok downloader with premium features — completely free.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="glass rounded-2xl p-6 hover:bg-white/5 transition-colors group"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${feature.color}20` }}
                >
                  <feature.icon size={24} style={{ color: feature.color }} />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ Section ===== */}
      <section id="faq" className="py-16 sm:py-20 px-4 sm:px-6 bg-[#121212]">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-gray-400">
              Everything you need to know about using TikDL
            </p>
          </motion.div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="glass rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                  className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-white/5 transition-colors"
                  aria-expanded={openFAQ === index}
                >
                  <span className="font-medium pr-4">{item.question}</span>
                  {openFAQ === index ? (
                    <ChevronUp size={20} className="text-[#FE2C55] shrink-0" />
                  ) : (
                    <ChevronDown size={20} className="text-gray-400 shrink-0" />
                  )}
                </button>
                <AnimatePresence>
                  {openFAQ === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-gray-400 text-sm leading-relaxed">
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
        <section id="history" className="py-10 sm:py-12 px-4 sm:px-6 bg-[#0a0a0a]">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Recent Downloads</h2>
              <button
                onClick={clearHistory}
                className="text-sm text-gray-500 hover:text-red-400 transition-colors"
              >
                Clear history
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => {
                    setVideoInfo(item);
                    setActiveTab('video');
                  }}
                >
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-16 h-16 rounded-xl object-cover bg-zinc-800"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title}</p>
                    <p className="text-sm text-gray-500">{item.author}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== Footer ===== */}
      <footer className="py-8 sm:py-10 px-4 sm:px-6 bg-[#0a0a0a] border-t border-white/10 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-[#FE2C55] rounded-lg flex items-center justify-center text-sm font-bold">♪</div>
            <span className="font-bold text-lg tracking-tighter">TikDL</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#features" className="hover:text-[#FE2C55] transition-colors">Features</a>
            <a href="#faq" className="hover:text-[#FE2C55] transition-colors">FAQ</a>
          </div>
          <p className="text-xs text-gray-600">
            TikDL is not affiliated with TikTok. For personal use only.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default TikTokDownloader;
