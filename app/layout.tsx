import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Golfcoach R10',
  description: 'Starter Next.js app for ingesting Garmin R10 CSV range sessions.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
