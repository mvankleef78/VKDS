'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  subscription: string;
  videosUsedThisMonth: number;
  planLimits: { videosPerMonth: number; maxDuration: number; resolution: string };
}

interface GeneratedVideo {
  videoId: string;
  status: string;
  videoUrl?: string;
  prompt: string;
}

const CATEGORIES = [
  { id: 'patient-education', label: '👂 Patient Education' },
  { id: 'hearing-aid',       label: '🔊 Hearing Aid Demo' },
  { id: 'audiogram',         label: '📊 Audiogram Explainer' },
  { id: 'tinnitus',          label: '🔔 Tinnitus Awareness' },
  { id: 'hearing-test',      label: '🩺 Hearing Test Prep' },
  { id: 'balance',           label: '⚖️ Balance / Vestibular' },
  { id: 'marketing',         label: '📣 Clinic Marketing' },
  { id: 'general',           label: '🎬 General' },
];

const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9 — Landscape (YouTube/Website)' },
  { id: '9:16', label: '9:16 — Portrait (Reels/TikTok)' },
  { id: '1:1',  label: '1:1 — Square (Instagram)' },
];

const PROMPT_TEMPLATES: Record<string, string[]> = {
  'patient-education': [
    'A calm, professional medical animation showing sound waves traveling through the outer ear, down the ear canal, vibrating the eardrum, and activating the cochlea. Clean clinic aesthetic, soothing blue palette.',
    'A warm, reassuring video for first-time hearing aid patients showing daily life improvements: enjoying family conversations, hearing birdsong, and participating in meetings with confidence.',
    'Educational animation explaining the anatomy of the inner ear — cochlea, semicircular canals, and auditory nerve — with clear labels and soft background music.',
  ],
  'hearing-aid': [
    'Elegant close-up of a behind-the-ear hearing aid being placed, adjusted, and worn by a smiling elderly patient in a bright, modern audiology clinic.',
    'Step-by-step tutorial showing how to change a hearing aid battery: clean hands, open battery door, remove old battery, insert new one, click shut. Crisp macro photography style.',
    'Split-screen comparison: life without hearing aids (muffled, isolated) vs. with hearing aids (clear, connected, joyful). Professional medical video aesthetic.',
  ],
  'audiogram': [
    'Animated audiogram being drawn on screen as a knowledgeable audiologist explains each frequency threshold. Clean clinical whiteboard style with medical blue accents.',
    'Visual demonstration of mild, moderate, and severe hearing loss on an audiogram chart, with corresponding real-world sound simulations. Professional educational style.',
  ],
  'tinnitus': [
    'A soothing animated video showing neural pathways associated with tinnitus, transitioning to sound therapy techniques and relaxation. Calming purple and blue tones.',
    'Patient testimonial-style video of a person managing tinnitus with white noise therapy, mindfulness, and audiologist support. Hopeful, warm atmosphere.',
  ],
  'hearing-test': [
    'A step-by-step walkthrough of a standard pure-tone audiometry test: patient in a soundproof booth, pressing a button when tones are heard. Professional but approachable tone.',
    'Reassuring pre-appointment video showing a friendly audiologist greeting a patient, reviewing the test process, and answering common questions about hearing evaluations.',
  ],
  'marketing': [
    'Cinematic 8-second clinic overview: modern audiology suite, state-of-the-art equipment, smiling staff, and happy patients. Professional brand video feel.',
    'Eye-catching social media reel showing the transformation from hearing loss to reconnected life through hearing healthcare. Uplifting music, vibrant colors.',
  ],
  'general': [
    'A professional, cinematic introduction to modern audiology: what audiologists do, who they help, and why hearing health matters. Documentary style.',
  ],
};

export default function GeneratePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('patient-education');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratedVideo | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUser(data); setLoadingUser(false); });
  }, []);

  const checkStatus = useCallback(async (videoId: string) => {
    const res = await fetch(`/api/video-status/${videoId}`);
    if (!res.ok) return;
    const data = await res.json();
    setResult(prev => prev ? { ...prev, status: data.status, videoUrl: data.videoUrl } : null);
    return data.status;
  }, []);

  useEffect(() => {
    if (!result || result.status === 'completed' || result.status === 'failed') {
      setPolling(false);
      return;
    }
    setPolling(true);
    const interval = setInterval(async () => {
      const status = await checkStatus(result.videoId);
      if (status === 'completed' || status === 'failed') {
        setPolling(false);
        clearInterval(interval);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [result, checkStatus]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) { setError('Please enter a prompt'); return; }
    setError('');
    setResult(null);
    setGenerating(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), category, aspectRatio, durationSeconds: duration }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult({ videoId: data.videoId, status: 'processing', prompt: prompt.trim() });
    } catch {
      setError('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function useTemplate(t: string) {
    setPrompt(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold text-white">Sign in to generate videos</h1>
        <Link href="/login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const limits = user.planLimits;
  const atLimit = user.videosUsedThisMonth >= limits.videosPerMonth;
  const maxDuration = limits.maxDuration;

  return (
    <div className="min-h-screen">
      <Navbar user={user} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">Generate Video</h1>
          <p className="text-slate-400 mt-1">Describe your audiology video and Veo 3.1 will bring it to life.</p>
        </div>

        {/* Usage bar */}
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Monthly usage</span>
            <span className="text-sm font-semibold text-slate-200">
              {user.videosUsedThisMonth} / {limits.videosPerMonth === 9999 ? '∞' : limits.videosPerMonth} videos
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${atLimit ? 'bg-red-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.min((user.videosUsedThisMonth / limits.videosPerMonth) * 100, 100)}%` }}
            />
          </div>
          {atLimit && (
            <p className="text-xs text-red-400 mt-2">
              Monthly limit reached.{' '}
              <Link href="/pricing" className="underline hover:text-red-300">Upgrade your plan</Link> for more videos.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleGenerate} className="card space-y-6">
              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="label">Prompt *</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  placeholder="Describe your video... e.g. 'A professional medical animation showing how cochlear implants work, with clear anatomical labels and a calm, educational voiceover.'"
                  className="input resize-none"
                  maxLength={1000}
                />
                <p className="text-xs text-slate-500 mt-1 text-right">{prompt.length}/1000</p>
              </div>

              <div>
                <label className="label">Category</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 text-left ${
                        category === c.id
                          ? 'bg-brand-600/20 border border-brand-500/40 text-brand-300'
                          : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Aspect Ratio</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="input"
                  >
                    {ASPECT_RATIOS.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">
                    Duration: <span className="text-brand-400">{duration}s</span>
                    {' '}<span className="text-slate-500 text-xs">(max {maxDuration}s on your plan)</span>
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={maxDuration}
                    step={1}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full accent-brand-500 mt-2"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>3s</span><span>{maxDuration}s</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Resolution: <span className="text-slate-300">{limits.resolution}</span>
                </p>
                <button
                  type="submit"
                  disabled={generating || atLimit || !prompt.trim()}
                  className="btn-primary"
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Submitting…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.13a1 1 0 01-1.447.897L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                      </svg>
                      Generate with Veo 3.1
                    </span>
                  )}
                </button>
              </div>
            </form>

            {/* Result */}
            {result && (
              <div className="card mt-6">
                <h2 className="font-bold text-white mb-4">Generated Video</h2>

                {result.status === 'processing' && (
                  <div className="aspect-video rounded-xl bg-slate-800 flex flex-col items-center justify-center gap-4">
                    <div className="relative w-16 h-16">
                      <svg className="w-16 h-16 animate-spin-slow text-brand-500/30" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"/>
                      </svg>
                      <svg className="absolute inset-0 w-16 h-16 animate-spin text-brand-400" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="70 212" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-semibold">Veo 3.1 is generating your video…</p>
                      <p className="text-slate-400 text-sm mt-1">
                        {polling ? 'Auto-checking every 6 seconds' : 'This usually takes 30–90 seconds'}
                      </p>
                    </div>
                  </div>
                )}

                {result.status === 'completed' && result.videoUrl && (
                  <div className="space-y-4">
                    <div className="aspect-video rounded-xl overflow-hidden bg-slate-800">
                      <video src={result.videoUrl} controls autoPlay className="w-full h-full object-contain" />
                    </div>
                    <div className="flex gap-3">
                      <a href={result.videoUrl} download target="_blank" rel="noopener noreferrer" className="btn-primary">
                        Download video
                      </a>
                      <button onClick={() => setResult(null)} className="btn-secondary">Generate another</button>
                    </div>
                  </div>
                )}

                {result.status === 'failed' && (
                  <div className="aspect-video rounded-xl bg-red-500/5 border border-red-500/20 flex flex-col items-center justify-center gap-3">
                    <span className="text-3xl">❌</span>
                    <p className="text-red-400 font-medium">Generation failed</p>
                    <button onClick={() => setResult(null)} className="btn-secondary text-sm">Try again</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Templates sidebar */}
          <div>
            <div className="card">
              <h3 className="font-bold text-white mb-4">
                Prompt templates
                <span className="ml-2 text-xs text-slate-500 font-normal">{(PROMPT_TEMPLATES[category] ?? PROMPT_TEMPLATES.general).length} for this category</span>
              </h3>
              <div className="space-y-3">
                {(PROMPT_TEMPLATES[category] ?? PROMPT_TEMPLATES.general).map((t, i) => (
                  <button
                    key={i}
                    onClick={() => useTemplate(t)}
                    className="w-full text-left px-3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition-all duration-200 group"
                  >
                    <p className="text-xs text-slate-300 group-hover:text-white transition-colors line-clamp-3 leading-relaxed">
                      {t}
                    </p>
                    <span className="text-xs text-brand-400 mt-1.5 inline-block">Use template →</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card mt-4 bg-brand-600/5 border-brand-500/20">
              <h4 className="font-semibold text-white mb-2 text-sm">💡 Prompt tips</h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li>• Mention the visual style (animation, live-action, cinematic)</li>
                <li>• Describe the mood (calm, professional, uplifting)</li>
                <li>• Specify the setting (clinic, home, 3D model)</li>
                <li>• Include the target audience (patient, student, professional)</li>
                <li>• Add color palette hints for brand consistency</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
