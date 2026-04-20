import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { pollOperation, gcsUriToPublicUrl } from '@/lib/veo';

export async function GET(req: NextRequest, { params }: { params: { videoId: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const video = db.videos.findById(params.videoId);
  if (!video || video.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (video.status === 'completed' || video.status === 'failed') {
    return NextResponse.json(video);
  }

  try {
    const operation = await pollOperation(video.operationName);

    if (operation.done) {
      if (operation.error) {
        const updated = db.videos.update(video.id, {
          status: 'failed',
          errorMessage: operation.error.message,
          completedAt: new Date().toISOString(),
        });
        return NextResponse.json(updated);
      }

      const gcsUri = operation.response?.videos?.[0]?.gcsUri;
      const videoUrl = gcsUri
        ? gcsUriToPublicUrl(gcsUri, process.env.GCS_BUCKET_NAME ?? '')
        : undefined;

      const updated = db.videos.update(video.id, {
        status: 'completed',
        videoUrl,
        completedAt: new Date().toISOString(),
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ ...video, status: 'processing' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
