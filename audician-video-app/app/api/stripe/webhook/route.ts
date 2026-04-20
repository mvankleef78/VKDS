import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRICE_TO_TIER } from '@/lib/stripe';
import { db } from '@/lib/db';
import type Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id;
      const tier = priceId ? (PRICE_TO_TIER[priceId] ?? 'free') : 'free';
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

      if (sub.status === 'active' || sub.status === 'trialing') {
        db.users.updateByStripeCustomerId(customerId, {
          subscription: tier,
          stripeSubscriptionId: sub.id,
        });
      } else {
        // Cancelled / past_due / unpaid → downgrade to free
        db.users.updateByStripeCustomerId(customerId, { subscription: 'free' });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      db.users.updateByStripeCustomerId(customerId, { subscription: 'free' });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        db.users.updateByStripeCustomerId(customerId, { subscription: 'free' });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
