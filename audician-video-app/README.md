# AudicianAI — Text-to-Video for Audiology Professionals

A full-stack Next.js 14 application that lets audiologists generate professional patient education, marketing, and clinical explainer videos using **Google Veo 3.1** via Vertex AI, with **Stripe** subscription billing.

## Features

- **Veo 3.1 video generation** — up to 8s, 4K, 16:9 / 9:16 / 1:1
- **8 audiologist categories**: patient education, hearing aid demos, audiogram explainers, tinnitus, hearing tests, balance/vestibular, marketing, general
- **20+ curated prompt templates** tailored for audiology
- **Subscription tiers**: Free (2 vids/mo), Basic $29, Professional $79, Enterprise $199
- **Stripe Checkout + Billing Portal + Webhooks**
- **JWT authentication** (HTTP-only cookie)
- **Real-time polling** for video completion status
- **Video download** in HD/4K

## Quick start

```bash
cd audician-video-app
cp .env.example .env.local
# Fill in your keys (see below)
npm install
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project with Vertex AI enabled |
| `GOOGLE_CLOUD_LOCATION` | e.g. `us-central1` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON |
| `GCS_BUCKET_NAME` | GCS bucket where Veo stores generated videos |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_…`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) |
| `STRIPE_PRICE_BASIC` | Stripe price ID for Basic plan |
| `STRIPE_PRICE_PROFESSIONAL` | Stripe price ID for Professional plan |
| `STRIPE_PRICE_ENTERPRISE` | Stripe price ID for Enterprise plan |
| `JWT_SECRET` | Random secret for JWT signing |
| `NEXT_PUBLIC_APP_URL` | e.g. `https://yourdomain.com` |

## Google Cloud setup

1. Enable Vertex AI API in your GCP project
2. Request access to Veo 3.1: `veo-3.1-generate-preview`
3. Create a GCS bucket for video output
4. Create a service account with `Vertex AI User` and `Storage Object Admin` roles
5. Download the JSON key and set `GOOGLE_APPLICATION_CREDENTIALS`

## Stripe setup

1. Create three recurring products/prices in the Stripe dashboard (Basic, Professional, Enterprise)
2. Copy the price IDs into `.env.local`
3. Set up a webhook endpoint at `/api/stripe/webhook` for events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

## Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/register` | Sign up |
| `/login` | Sign in |
| `/dashboard` | Video gallery + subscription status |
| `/generate` | Generate a new video |
| `/pricing` | Plans, comparison table, FAQ |
| `/api/auth/register` | POST — create account |
| `/api/auth/login` | POST — sign in |
| `/api/auth/logout` | POST — sign out |
| `/api/auth/me` | GET — current user |
| `/api/generate` | POST — start Veo 3.1 generation |
| `/api/video-status/[id]` | GET — poll video status |
| `/api/videos` | GET — list user videos |
| `/api/stripe/checkout` | POST — create Stripe Checkout session |
| `/api/stripe/webhook` | POST — Stripe webhook handler |
| `/api/stripe/portal` | POST — Stripe Billing Portal session |

## Architecture

```
app/
├── page.tsx              # Landing
├── login/page.tsx        # Auth
├── register/page.tsx     # Auth
├── dashboard/page.tsx    # Video gallery + stats
├── generate/page.tsx     # Video generation UI
├── pricing/page.tsx      # Plans + FAQ
└── api/
    ├── auth/             # JWT auth endpoints
    ├── generate/         # Veo 3.1 generation
    ├── video-status/     # Async polling
    ├── videos/           # Video listing
    └── stripe/           # Checkout, webhook, portal
lib/
├── db.ts                 # In-memory store (swap for Postgres/MongoDB)
├── auth.ts               # JWT helpers
├── veo.ts                # Google Veo 3.1 client
└── stripe.ts             # Stripe client + plan definitions
components/
├── Navbar.tsx
├── PricingCard.tsx
└── VideoCard.tsx
```

> **Production note:** The in-memory store in `lib/db.ts` resets on each deployment. Replace it with a persistent database (Postgres + Prisma, MongoDB, etc.) before going to production.
