import type { Metadata } from 'next';
import { SandboxBanner } from '@/components/SandboxBanner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Brismarp Pay',
  description: 'Gateway de pagamentos B2B para empresas no Brasil.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <SandboxBanner />
        {children}
      </body>
    </html>
  );
}
