import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { AppToaster } from '@/components/ui/toaster';
import './globals.css';
import './public.css';
import './portal.css';

const inter = localFont({
  src: './fonts/Inter-Latin.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-sans'
});

const poppins = localFont({ src: './fonts/Poppins-Bold.ttf', weight: '700', display: 'swap', variable: '--font-brand' });

export const metadata: Metadata = {
  title: 'FLUID',
  description: 'Intelligent blood donation platform',
  icons: {
    icon: { url: '/favicon.svg', type: 'image/svg+xml' },
    apple: '/favicon.svg'
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${poppins.variable} antialiased`}>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
