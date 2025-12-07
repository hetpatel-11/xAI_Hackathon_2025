import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'GrokGuard Dashboard',
  description: 'AI-powered content moderation for X.com',
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: '#000000' }}>
      <body style={{ background: '#000000', margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
