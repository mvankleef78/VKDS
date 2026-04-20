import Stripe from 'stripe';
import type { SubscriptionTier } from './db';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2024-06-20',
});

export const PRICE_IDS: Record<Exclude<SubscriptionTier, 'free'>, string> = {
  basic:        process.env.STRIPE_PRICE_BASIC        ?? 'price_basic',
  professional: process.env.STRIPE_PRICE_PROFESSIONAL ?? 'price_professional',
  enterprise:   process.env.STRIPE_PRICE_ENTERPRISE   ?? 'price_enterprise',
};

export const PRICE_TO_TIER: Record<string, SubscriptionTier> = {
  [PRICE_IDS.basic]:        'basic',
  [PRICE_IDS.professional]: 'professional',
  [PRICE_IDS.enterprise]:   'enterprise',
};

export const PLANS = [
  {
    id: 'basic' as const,
    name: 'Basic',
    price: 29,
    description: 'Perfect for solo practitioners',
    features: [
      '15 videos / month',
      '5-second clips',
      '720p resolution',
      '20+ audiologist prompt templates',
      'Email support',
    ],
    highlighted: false,
  },
  {
    id: 'professional' as const,
    name: 'Professional',
    price: 79,
    description: 'Ideal for busy clinics',
    features: [
      '60 videos / month',
      '8-second clips',
      '1080p Full HD resolution',
      'All prompt templates',
      'Priority support',
      'Video download & sharing',
    ],
    highlighted: true,
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: 199,
    description: 'For audiology networks & hospitals',
    features: [
      'Unlimited videos',
      '8-second clips',
      '4K resolution',
      'Custom branding',
      'Dedicated account manager',
      'API access',
      'SSO / SAML',
    ],
    highlighted: false,
  },
];
