'use client';

interface Video {
  id: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  category: string;
  createdAt: string;
  duration?: number;
}

interface VideoCardProps {
  video: Video;
  onStatusCheck?: (id: string) => void;
}

const STATUS_COLORS = {
  pending:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  processing: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  completed:  'bg-teal-500/10 text-teal-400 border-teal-500/30',
  failed:     'bg-red-500/10 text-red-400 border-red-500/30',
};

const CATEGORY_ICONS: Record<string, string> = {
  'patient-education': '👂',
  'hearing-aid':       '🔊',
  'tinnitus':          '🔔',
  'audiogram':         '📊',
  'hearing-test':      '🩺',
  'balance':           '⚖️',
  'marketing':         '📣',
  'general':           '🎬',
};

export function VideoCard({ video, onStatusCheck }: VideoCardProps) {
  const icon = CATEGORY_ICONS[video.category] ?? '🎬';

  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="aspect-video rounded-xl overflow-hidden bg-slate-800 mb-4 relative group">
        {video.status === 'completed' && video.videoUrl ? (
          <video
            src={video.videoUrl}
            className="w-full h-full object-cover"
            controls
            preload="metadata"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="text-4xl">{icon}</span>
            {video.status === 'processing' && (
              <div className="flex items-center gap-2 text-sm text-blue-400">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Generating…
              </div>
            )}
            {video.status === 'failed' && (
              <p className="text-sm text-red-400">Generation failed</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm text-slate-200 font-medium line-clamp-2">{video.prompt}</p>
        <span className={`badge border shrink-0 ${STATUS_COLORS[video.status]}`}>
          {video.status}
        </span>
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-slate-500">
          {new Date(video.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        {(video.status === 'processing' || video.status === 'pending') && onStatusCheck && (
          <button
            onClick={() => onStatusCheck(video.id)}
            className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
          >
            Check status
          </button>
        )}
        {video.status === 'completed' && video.videoUrl && (
          <a
            href={video.videoUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-teal-400 hover:text-teal-300 font-medium transition-colors"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}
