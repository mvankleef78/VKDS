import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { PricingCard } from '@/components/PricingCard';
import { PLANS } from '@/lib/stripe';

const FEATURES = [
  {
    icon: '👂',
    title: 'Patient Education',
    desc: 'Generate clear, professional videos explaining hearing conditions, treatment options, and hearing aid care to patients.',
  },
  {
    icon: '📊',
    title: 'Audiogram Explainers',
    desc: 'Turn complex audiogram data into visually engaging short videos that help patients understand their hearing profile.',
  },
  {
    icon: '🔊',
    title: 'Hearing Aid Demos',
    desc: 'Showcase hearing aid features, insertion techniques, and maintenance with lifelike AI-generated video content.',
  },
  {
    icon: '🔔',
    title: 'Tinnitus Awareness',
    desc: 'Create empathetic, informative videos on tinnitus management, sound therapy, and coping strategies.',
  },
  {
    icon: '🩺',
    title: 'Pre-Appointment Prep',
    desc: 'Help patients prepare for their first hearing evaluation with guided, reassuring short-form video content.',
  },
  {
    icon: '📣',
    title: 'Clinic Marketing',
    desc: 'Produce eye-catching social media and website videos that showcase your clinic's expertise and attract new patients.',
  },
];

const STATS = [
  { label: 'Audiology Professionals', value: '2,400+' },
  { label: 'Videos Generated', value: '180K+' },
  { label: 'Avg. Generation Time', value: '< 90s' },
  { label: 'Patient Satisfaction Lift', value: '37%' },
];

const TEMPLATES = [
  'A warm, professional animated video explaining how sound travels through the ear canal to the cochlea for a new patient.',
  'Short animated explainer showing the difference between conductive and sensorineural hearing loss with clear medical diagrams.',
  'A reassuring video walkthrough of a standard hearing test for adult patients experiencing their first audiological evaluation.',
  'Cinematic close-up of a behind-the-ear hearing aid being fitted, with smooth motions and calm clinical background music.',
  'Educational animation of tinnitus neural pathways, ending with a message about sound therapy and relaxation techniques.',
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 sm:px-6 lg:px-8 pt-20 pb-32">
        {/* Background glow */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-teal-600/8 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-600/10 border border-brand-500/20 text-brand-400 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse-slow" />
            Powered by Google Veo 3.1
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.05] mb-6">
            AI Video Generation
            <br />
            <span className="bg-gradient-to-r from-brand-400 via-teal-400 to-brand-300 bg-clip-text text-transparent">
              built for Audicians
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Transform your audiology practice with professional AI-generated videos.
            Educate patients, explain diagnoses, and market your clinic — all from a simple text prompt.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="btn-primary text-base px-8 py-4">
              Start free — 2 videos included
            </Link>
            <Link href="/pricing" className="btn-secondary text-base px-8 py-4">
              View plans
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-20">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-black text-white">{s.value}</div>
                <div className="text-sm text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo prompt section */}
      <section className="px-4 sm:px-6 lg:px-8 pb-24 max-w-4xl mx-auto">
        <div className="card border-slate-700 bg-slate-900/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
            <span className="ml-2 text-xs text-slate-500 font-mono">audician-ai-prompt</span>
          </div>
          <p className="text-slate-500 text-sm mb-3 font-mono">// Example prompts</p>
          {TEMPLATES.slice(0, 3).map((t, i) => (
            <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
              <span className="text-brand-400 font-mono text-sm shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <p className="text-slate-300 text-sm font-mono leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-4 sm:px-6 lg:px-8 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-black text-white mb-4">Everything an audiologist needs</h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Purpose-built for hearing care professionals, not generic content creators.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="card hover:border-slate-700 transition-colors group">
              <div className="w-12 h-12 rounded-2xl bg-brand-600/10 flex items-center justify-center text-2xl mb-4 group-hover:bg-brand-600/20 transition-colors">
                {f.icon}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 sm:px-6 lg:px-8 py-24 bg-slate-900/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-white mb-4">Create a video in 3 steps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { n: '01', title: 'Write your prompt', desc: 'Describe the video you need in plain English. Use our audiologist-specific templates or write your own.' },
              { n: '02', title: 'Veo 3.1 generates', desc: 'Google\'s Veo 3.1 model renders a photorealistic, up to 8-second video with synchronized audio.' },
              { n: '03', title: 'Download & share', desc: 'Your video is ready in under 90 seconds. Download in HD/4K or share directly with patients.' },
            ].map((step) => (
              <div key={step.n} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/20 flex items-center justify-center text-brand-400 font-black text-lg mx-auto mb-4">
                  {step.n}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing section */}
      <section id="pricing" className="px-4 sm:px-6 lg:px-8 py-24 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-black text-white mb-4">Simple, transparent pricing</h2>
          <p className="text-slate-400 text-lg">Start free, scale as your practice grows.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PLANS.map((plan) => (
            <PricingCard key={plan.id} {...plan} isLoggedIn={false} />
          ))}
        </div>
        <p className="text-center text-slate-500 text-sm mt-8">
          All plans include a 14-day free trial. No credit card required to start.
        </p>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 lg:px-8 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="card bg-gradient-to-br from-brand-900/40 via-brand-800/20 to-slate-900 border-brand-500/20">
            <h2 className="text-4xl font-black text-white mb-4">
              Ready to elevate your practice?
            </h2>
            <p className="text-slate-400 text-lg mb-8">
              Join 2,400+ audiologists using AudicianAI to educate patients and grow their clinics.
            </p>
            <Link href="/register" className="btn-primary text-base px-8 py-4">
              Start for free today
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white font-bold">
            <span className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-xs font-black">AI</span>
            <span>AudicianAI</span>
          </div>
          <p className="text-slate-600 text-sm">© {new Date().getFullYear()} AudicianAI. Built for hearing care professionals.</p>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Link href="/pricing" className="hover:text-slate-300 transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-slate-300 transition-colors">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
