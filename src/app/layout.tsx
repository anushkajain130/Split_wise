import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';

export const metadata: Metadata = {
  title: 'SplitEase — Split Expenses Effortlessly',
  description: 'A modern expense-splitting app for groups. Track shared expenses, split bills, and settle debts with friends, roommates, and travel companions.',
  keywords: 'split expenses, bill splitter, group expenses, debt tracker, splitwise alternative',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
