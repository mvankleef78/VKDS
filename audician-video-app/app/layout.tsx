import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AudicianAI — Text-to-Video for Audiology Professionals',
  description:
    'Generate professional audiologist-grade patient education and marketing videos in seconds using Veo 3.1 AI.',
  keywords: ['audiology', 'text-to-video', 'AI', 'patient education', 'hearing care'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
