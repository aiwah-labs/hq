import type { Metadata } from 'next';
import './globals.css';
import { APP_NAME, APP_ICON } from '@/config/brand';

export const metadata: Metadata = {
  title: APP_NAME,
  icons: {
    icon: APP_ICON,
    apple: APP_ICON,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
