import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Brismar Pay',
  description: 'Gateway de pagamentos B2B para empresas no Brasil.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
