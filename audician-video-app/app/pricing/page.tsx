'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { PricingCard } from '@/components/PricingCard';
import { PLANS } from '@/lib/stripe';

interface UserInfo {
  name: string;
  email: string;
  subscription: string;
}

const FAQS = [
  {
    q: 'How long does it take to generate a video?',
    a: 'Veo 3.1 typically generates a 5–8 second video in 30–90 seconds, depending on complexity and server load.',
  },
  {
    q: 'Can I download and use the videos commercially?',
    a: 'Yes. All videos generated on paid plans are yours to use commercially — for patient education, marketing, social media, and more.',
  },
  {
    q: 'Does the free plan require a credit card?',
    a: 'No. The free plan includes 2 videos per month with no credit card required.',
  },
  {
    q: 'What happens if I hit my monthly video limit?',
    a: 'Video generation is paused until the next billing cycle. You can upgrade your plan at any time to instantly increase your limit.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Absolutely. Cancel anytime from the Stripe billing portal. Your plan remains active until the end of the billing period.',
  },
  {
    q: 'Is there a HIPAA-compliant option?',
    a: 'Enterprise plans include a Business Associate Agreement (BAA). Contact us at enterprise@audicianai.com for details.',
  },
];

export default function PricingPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => setUser(data));
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar user={user} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-black text-white mb-4">Simple, transparent pricing</h1>
          <p className="text-xl text-slate-400 max-w-xl mx-auto">
            Start free. Scale as your practice grows. Cancel anytime.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {PLANS.map((plan) => (
            <PricingCard
              key={plan.id}
              {...plan}
              currentPlan={user?.subscription}
              isLoggedIn={!!user}
            />
          ))}
        </div>

        {/* Free tier callout */}
        <div className="card bg-slate-900/60 border-slate-700 text-center mb-20">
          <h3 className="text-xl font-bold text-white mb-2">Not ready to commit?</h3>
          <p className="text-slate-400 mb-4">
            Start with our <strong className="text-white">free plan</strong> — 2 videos per month, no credit card required.
          </p>
          <Link href="/register" className="btn-secondary">Create free account</Link>
        </div>

        {/* Feature comparison table */}
        <div className="mb-20">
          <h2 className="text-2xl font-black text-white mb-8 text-center">Compare plans</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">Feature</th>
                  <th className="text-center py-3 px-4 text-slate-300">Free</th>
                  <th className="text-center py-3 px-4 text-slate-300">Basic</th>
                  <th className="text-center py-3 px-4 text-brand-300">Professional</th>
                  <th className="text-center py-3 px-4 text-slate-300">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {[
                  ['Videos / month', '2', '15', '60', 'Unlimited'],
                  ['Max clip duration', '5s', '5s', '8s', '8s'],
                  ['Resolution', '720p', '720p', '1080p Full HD', '4K'],
                  ['Aspect ratios', '16:9 only', 'All 3', 'All 3', 'All 3'],
                  ['Prompt templates', '✓', '✓', '✓', '✓'],
                  ['Video download', '—', '✓', '✓', '✓'],
                  ['Priority generation', '—', '—', '✓', '✓'],
                  ['Custom branding', '—', '—', '—', '✓'],
                  ['API access', '—', '—', '—', '✓'],
                  ['SSO / SAML', '—', '—', '—', '✓'],
                  ['HIPAA BAA', '—', '—', '—', '✓'],
                  ['Support', 'Community', 'Email', 'Priority', 'Dedicated AM'],
                ].map(([feat, ...vals]) => (
                  <tr key={feat} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 text-slate-300">{feat}</td>
                    {vals.map((v, i) => (
                      <td key={i} className={`py-3 px-4 text-center ${i === 2 ? 'text-brand-300 font-medium' : 'text-slate-400'}`}>
                        {v === '✓' ? <span className="text-teal-400">✓</span> : v === '—' ? <span className="text-slate-600">—</span> : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-white mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between text-left gap-4"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-white text-sm">{faq.q}</span>
                  <svg
                    className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <p className="mt-3 text-sm text-slate-400 leading-relaxed">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
