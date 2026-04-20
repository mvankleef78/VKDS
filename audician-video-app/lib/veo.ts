/**
 * Google Veo 3.1 integration via Vertex AI.
 *
 * Veo 3.1 uses the predictLongRunning endpoint and returns an operation name
 * that must be polled until the video is ready.
 *
 * Docs: https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos
 */

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? '';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
const MODEL = 'veo-3.1-generate-preview';
const BASE_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1`;

export interface GenerateVideoParams {
  prompt: string;
  durationSeconds?: number;
  resolution?: '720p' | '1080p' | '4K';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  seed?: number;
}

export interface VeoOperation {
  name: string;
  done?: boolean;
  error?: { code: number; message: string };
  response?: {
    videos: Array<{ gcsUri: string; mimeType: string }>;
  };
}

async function getAccessToken(): Promise<string> {
  // In production use Application Default Credentials or a service account key.
  // This helper calls the metadata server when running on GCE/Cloud Run,
  // otherwise falls back to gcloud CLI token for local dev.
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2000) }
    );
    if (res.ok) {
      const data = await res.json();
      return data.access_token as string;
    }
  } catch {
    // Not on GCE — fall through to gcloud
  }

  // Local dev: use `gcloud auth print-access-token`
  const { execSync } = await import('child_process');
  try {
    return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'Could not obtain a Google Cloud access token. ' +
      'Run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS.'
    );
  }
}

export async function generateVideo(params: GenerateVideoParams): Promise<VeoOperation> {
  const token = await getAccessToken();
  const endpoint = `${BASE_URL}/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predictLongRunning`;

  const body = {
    instances: [
      {
        prompt: params.prompt,
      },
    ],
    parameters: {
      durationSeconds: params.durationSeconds ?? 5,
      aspectRatio: params.aspectRatio ?? '16:9',
      resolution: params.resolution ?? '720p',
      ...(params.seed !== undefined && { seed: params.seed }),
      outputOptions: {
        mimeType: 'video/mp4',
      },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Veo API error ${res.status}: ${err}`);
  }

  return res.json() as Promise<VeoOperation>;
}

export async function pollOperation(operationName: string): Promise<VeoOperation> {
  const token = await getAccessToken();
  // operationName is already fully qualified, e.g.:
  // projects/PROJECT/locations/LOCATION/operations/OP_ID
  const url = `${BASE_URL}/${operationName}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Poll error ${res.status}: ${err}`);
  }

  return res.json() as Promise<VeoOperation>;
}

export function gcsUriToPublicUrl(gcsUri: string, bucketName: string): string {
  // Convert gs://bucket/path -> https://storage.googleapis.com/bucket/path
  const withoutPrefix = gcsUri.replace(/^gs:\/\//, '');
  return `https://storage.googleapis.com/${withoutPrefix}`;
}
