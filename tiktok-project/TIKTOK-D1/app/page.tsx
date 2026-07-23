'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Copy, ClipboardPaste, X, Play, Music, Image as ImageIcon, Clock, User, Heart, RefreshCw } from 'lucide-react';
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

const TikTokDownloader = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<VideoInfo[]>([]);
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'cover'>('video');
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isAdSkipped, setIsAdSkipped] = useState(false);

  // Load history
  useEffect(() => {
    const saved = localStorage.getItem('tiktokHistory');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('tiktokHistory', JSON.stringify(history));
  }, [history]);

  const isValidTikTokUrl = (inputUrl: string): boolean => {
    const regex = /https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/.+/i;
    return regex.test(inputUrl.trim());
  };

  const fetchVideoInfo = async (videoUrl: string) => {
    // Show ad interstitial before fetching
    setShowAdPopup(true);
    setCountdown(5);
    setIsAdSkipped(false);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Wait for countdown or skip
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (countdown <= 0 || isAdSkipped) {
          clearInterval(check);
          resolve(true);
        }
      }, 300);
    });

    setShowAdPopup(false);

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
        throw new Error(result.error || 'Failed to fetch video');
      }

      const data = result.data;
      setVideoInfo(data);
      setHistory(prev => [data, ...prev.slice(0, 4)]);
      
      toast.success('Video ready!', { 
        description: `Fetched via ${result.provider} in ${result.duration}ms` 
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setError(err.message || 'Unable to process this video. Try again.');
      toast.error('Fetch failed', { description: err.message || 'Check URL or connection' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Enter a TikTok URL");
      return;
    }
    if (!isValidTikTokUrl(trimmed)) {
      setError("Invalid TikTok URL format.");
      toast.error("Please use a valid TikTok link");
      return;
    }
    fetchVideoInfo(trimmed);
  };

  const handleDownload = (downloadType: string) => {
    toast.success(`Starting ${downloadType} download...`, {
      description: 'Your file will download shortly (demo mode).',
    });
    // Real impl would use the URLs
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  // Ad popup close handler
  const skipAd = () => {
    setIsAdSkipped(true);
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <Toaster position="top-center" richColors closeButton />

      {/* Navbar - unchanged for brevity */}
      <nav className="sticky top-0 z-50 glass border-b border-white/10 bg-black/80">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#FE2C55] rounded-xl flex items-center justify-center text-xl">♬</div>
            <span className="font-bold text-3xl tracking-tighter">TikDL</span>
          </div>
          <div className="hidden md:flex gap-8 text-sm">
            <a href="#features" className="hover:text-[#FE2C55]">Features</a>
            <a href="#faq" className="hover:text-[#FE2C55]">FAQ</a>
          </div>
        </div>
      </nav>

      {/* Hero and main UI - similar to previous with improvements */}
      <section className="pt-20 pb-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-6xl font-bold tracking-tighter mb-6">TikTok Without Watermark</h1>
          <p className="text-xl text-gray-400 mb-10">Fast, unlimited, high-quality downloads.</p>

          <form onSubmit={handleSubmit} className="glass p-2 rounded-3xl flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste TikTok link here..."
              className="flex-1 bg-transparent px-6 py-5 outline-none text-lg"
            />
            <div className="flex gap-2 px-2 pb-2 sm:pb-0">
              <button type="button" onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setUrl(text);
                } catch {}
              }} className="px-6 py-5 rounded-2xl bg-white/10 hover:bg-white/20">
                <ClipboardPaste size={20} />
              </button>
              <button type="submit" disabled={isLoading} className="px-10 py-5 bg-[#FE2C55] rounded-2xl font-medium flex items-center gap-2 disabled:opacity-70">
                {isLoading ? <RefreshCw className="animate-spin" /> : 'Download'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Results, features etc. - abbreviated for space, extend as needed */}
      <AnimatePresence>
        {videoInfo && (
          <div className="max-w-4xl mx-auto px-6 py-8">
            {/* Video card with download buttons */}
            <div className="glass rounded-3xl p-8">
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="lg:flex-1">
                  <img src={videoInfo.thumbnail} alt="" className="rounded-2xl w-full" />
                </div>
                <div className="lg:flex-1 space-y-6">
                  <h3 className="text-2xl font-semibold">{videoInfo.title}</h3>
                  <div className="flex items-center gap-3">
                    <img src={videoInfo.avatar} alt="" className="w-12 h-12 rounded-full" />
                    <div>{videoInfo.author}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => handleDownload('No Watermark HD')} className="bg-[#FE2C55] py-4 rounded-2xl font-semibold">No Watermark HD</button>
                    <button onClick={() => handleDownload('Audio')} className="bg-white/10 py-4 rounded-2xl">MP3 Audio</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Ad Interstitial Popup */}
      <AnimatePresence>
        {showAdPopup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass max-w-md w-full rounded-3xl p-10 text-center"
            >
              <div className="text-[#25F4EE] mb-4">Sponsored</div>
              <h3 className="text-2xl font-semibold mb-6">Support free downloads</h3>
              <div className="h-48 bg-zinc-900 rounded-2xl mb-8 flex items-center justify-center border border-dashed border-white/20">
                Ad Placeholder - Insert Adsterra code here
              </div>
              <div className="text-5xl font-mono mb-8 tabular-nums">{countdown}</div>
              <button 
                onClick={skipAd}
                disabled={countdown > 0}
                className="w-full py-4 bg-white text-black font-semibold rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {countdown > 0 ? `Continue in ${countdown}s` : 'Continue to Download'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FAQ, Features etc. placeholders */}
      <section id="faq" className="py-20 px-6 bg-[#121212]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          {/* FAQ items */}
        </div>
      </section>
    </div>
  );
};

export default TikTokDownloader;
