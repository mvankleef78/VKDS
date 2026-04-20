import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { PLAN_LIMITS } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    subscription: user.subscription,
    videosUsedThisMonth: user.videosUsedThisMonth,
    planLimits: PLAN_LIMITS[user.subscription],
  });
}
