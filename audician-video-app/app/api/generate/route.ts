import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { db, PLAN_LIMITS } from '@/lib/db';
import { generateVideo } from '@/lib/veo';

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limits = PLAN_LIMITS[user.subscription];

  // Reset monthly counter if needed
  if (new Date() >= new Date(user.monthResetAt)) {
    db.users.update(user.id, {
      videosUsedThisMonth: 0,
      monthResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
    });
    user.videosUsedThisMonth = 0;
  }

  if (user.videosUsedThisMonth >= limits.videosPerMonth) {
    return NextResponse.json(
      { error: `Monthly video limit reached (${limits.videosPerMonth}). Please upgrade your plan.` },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { prompt, category, aspectRatio, durationSeconds } = body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return NextResponse.json({ error: 'Prompt is required (min 5 characters)' }, { status: 400 });
  }

  const clampedDuration = Math.min(durationSeconds ?? limits.maxDuration, limits.maxDuration);

  const resolutionMap: Record<string, '720p' | '1080p' | '4K'> = {
    free:         '720p',
    basic:        '720p',
    professional: '1080p',
    enterprise:   '4K',
  };

  try {
    const operation = await generateVideo({
      prompt: prompt.trim(),
      durationSeconds: clampedDuration,
      resolution: resolutionMap[user.subscription],
      aspectRatio: aspectRatio ?? '16:9',
    });

    const video = db.videos.create({
      userId: user.id,
      prompt: prompt.trim(),
      operationName: operation.name,
      status: 'processing',
      category: category ?? 'general',
    });

    db.users.update(user.id, { videosUsedThisMonth: user.videosUsedThisMonth + 1 });

    return NextResponse.json({ videoId: video.id, operationName: operation.name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Video generation failed: ${message}` }, { status: 500 });
  }
}
