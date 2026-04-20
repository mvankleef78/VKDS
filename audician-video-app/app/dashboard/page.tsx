'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { VideoCard } from '@/components/VideoCard';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  subscription: string;
  videosUsedThisMonth: number;
  planLimits: { videosPerMonth: number; maxDuration: number; resolution: string; label: string };
}

interface Video {
  id: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  category: string;
  createdAt: string;
  duration?: number;
}

const TIER_COLORS: Record<string, string> = {
  free:         'bg-slate-500/10 text-slate-400 border-slate-500/30',
  basic:        'bg-blue-500/10 text-blue-400 border-blue-500/30',
  professional: 'bg-brand-500/10 text-brand-400 border-brand-500/30',
  enterprise:   'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

export default function DashboardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const upgraded = params.get('upgraded');

  const [user, setUser] = useState<UserInfo | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(!!upgraded);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { router.push('/login'); return; }
        setUser(data);
        setLoadingUser(false);
      });
  }, [router]);

  useEffect(() => {
    fetch('/api/videos')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setVideos(data); setLoadingVideos(false); });
  }, []);

  const checkVideoStatus = useCallback(async (videoId: string) => {
    const res = await fetch(`/api/video-status/${videoId}`);
    if (!res.ok) return;
    const data = await res.json();
    setVideos(prev => prev.map(v => v.id === videoId ? { ...v, ...data } : v));
  }, []);

  async function handleBillingPortal() {
    setPortalLoading(true);
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setPortalLoading(false);
  }

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-brand-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }
  if (!user) return null;

  const limits = user.planLimits;
  const usagePct = limits.videosPerMonth === 9999 ? 0 : Math.min((user.videosUsedThisMonth / limits.videosPerMonth) * 100, 100);
  const completed = videos.filter(v => v.status === 'completed').length;
  const processing = videos.filter(v => v.status === 'processing').length;

  return (
    <div className="min-h-screen">
      <Navbar user={user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Upgrade success banner */}
        {showUpgradeBanner && (
          <div className="mb-6 px-5 py-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <p className="text-teal-300 font-semibold">Subscription upgraded successfully! Welcome to {limits.label}.</p>
            </div>
            <button onClick={() => setShowUpgradeBanner(false)} className="text-teal-500 hover:text-teal-300 text-xl">×</button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Dashboard</h1>
            <p className="text-slate-400 mt-1">Welcome back, {user.name.split(' ')[0]}</p>
          </div>
          <Link href="/generate" className="btn-primary self-start sm:self-auto">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New video
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Videos', value: videos.length, icon: '🎬' },
            { label: 'Completed', value: completed, icon: '✅' },
            { label: 'Processing', value: processing, icon: '⚙️' },
            {
              label: 'This Month',
              value: `${user.videosUsedThisMonth} / ${limits.videosPerMonth === 9999 ? '∞' : limits.videosPerMonth}`,
              icon: '📅',
            },
          ].map((stat) => (
            <div key={stat.label} className="card">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">{stat.icon}</span>
                <p className="text-2xl font-black text-white">{stat.value}</p>
              </div>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video grid */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Your Videos</h2>
              {videos.length > 0 && (
                <Link href="/generate" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
                  + Generate more
                </Link>
              )}
            </div>

            {loadingVideos ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="aspect-video rounded-xl bg-slate-800 mb-4" />
                    <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : videos.length === 0 ? (
              <div className="card text-center py-16">
                <span className="text-5xl mb-4 block">🎬</span>
                <h3 className="text-lg font-bold text-white mb-2">No videos yet</h3>
                <p className="text-slate-400 text-sm mb-6">Generate your first audiology video with Veo 3.1</p>
                <Link href="/generate" className="btn-primary">Generate your first video</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {videos.map((video) => (
                  <VideoCard key={video.id} video={video} onStatusCheck={checkVideoStatus} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Subscription card */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white">Subscription</h3>
                <span className={`badge border capitalize ${TIER_COLORS[user.subscription] ?? TIER_COLORS.free}`}>
                  {limits.label}
                </span>
              </div>

              <div className="space-y-2 text-sm text-slate-400 mb-4">
                <div className="flex justify-between">
                  <span>Max duration</span>
                  <span className="text-slate-200 font-medium">{limits.maxDuration}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Resolution</span>
                  <span className="text-slate-200 font-medium">{limits.resolution}</span>
                </div>
                <div className="flex justify-between">
                  <span>Videos / month</span>
                  <span className="text-slate-200 font-medium">
                    {limits.videosPerMonth === 9999 ? 'Unlimited' : limits.videosPerMonth}
                  </span>
                </div>
              </div>

              {/* Usage bar */}
              {limits.videosPerMonth !== 9999 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Usage this month</span>
                    <span>{user.videosUsedThisMonth} / {limits.videosPerMonth}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-yellow-500' : 'bg-brand-500'}`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {user.subscription !== 'enterprise' && (
                  <Link href="/pricing" className="btn-primary w-full text-center text-sm">
                    Upgrade plan
                  </Link>
                )}
                {user.subscription !== 'free' && (
                  <button
                    onClick={handleBillingPortal}
                    disabled={portalLoading}
                    className="btn-secondary w-full text-sm"
                  >
                    {portalLoading ? 'Redirecting…' : 'Manage billing'}
                  </button>
                )}
              </div>
            </div>

            {/* Quick tips */}
            <div className="card bg-brand-600/5 border-brand-500/20">
              <h4 className="font-semibold text-white mb-3 text-sm">💡 Quick tips</h4>
              <ul className="space-y-2 text-xs text-slate-400">
                <li>• Use our <Link href="/generate" className="text-brand-400 hover:text-brand-300">prompt templates</Link> to get started quickly</li>
                <li>• For sharper results, specify visual style (animation, cinematic, documentary)</li>
                <li>• Add a color palette to match your clinic branding</li>
                <li>• 9:16 portrait videos perform best on Instagram and Reels</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
