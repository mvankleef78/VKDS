'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PricingCardProps {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  highlighted: boolean;
  currentPlan?: string;
  isLoggedIn?: boolean;
}

export function PricingCard({ id, name, price, description, features, highlighted, currentPlan, isLoggedIn }: PricingCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isCurrent = currentPlan === id;

  async function handleSubscribe() {
    if (!isLoggedIn) { router.push('/register'); return; }
    if (isCurrent) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`relative rounded-2xl p-8 flex flex-col gap-6 transition-all duration-300 ${
      highlighted
        ? 'bg-brand-600/10 border-2 border-brand-500 shadow-lg shadow-brand-500/10'
        : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
    }`}>
      {highlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-brand-600 text-white text-xs font-bold px-4 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}

      <div>
        <h3 className="text-xl font-bold text-white">{name}</h3>
        <p className="text-slate-400 text-sm mt-1">{description}</p>
      </div>

      <div className="flex items-end gap-1">
        <span className="text-4xl font-black text-white">${price}</span>
        <span className="text-slate-400 mb-1">/month</span>
      </div>

      <ul className="flex flex-col gap-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
            <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={handleSubscribe}
        disabled={loading || isCurrent}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${
          isCurrent
            ? 'bg-teal-600/20 text-teal-400 border border-teal-600/40'
            : highlighted
            ? 'bg-brand-600 hover:bg-brand-700 text-white'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
        }`}
      >
        {loading ? 'Redirecting...' : isCurrent ? 'Current Plan' : 'Get started'}
      </button>
    </div>
  );
}
