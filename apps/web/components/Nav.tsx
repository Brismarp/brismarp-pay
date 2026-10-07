'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/customers', label: 'Clientes' },
  { href: '/charges', label: 'Cobranças' },
  { href: '/api-keys', label: 'API Keys' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem('bpay_access_token');
    if (!token) return;
    apiClient
      .me(token)
      .then((me) => setNeedsVerification(!me.emailVerifiedAt))
      .catch(() => setNeedsVerification(false));
  }, []);

  async function resend() {
    const token = sessionStorage.getItem('bpay_access_token');
    if (!token) return;
    await apiClient.resendVerification(token);
    setResent(true);
  }

  async function handleLogout() {
    try {
      await apiClient.logout();
    } catch {
      // still drop the local session if the cookie is already gone
    }
    sessionStorage.removeItem('bpay_access_token');
    router.push('/login');
  }

  return (
    <nav className="border-b border-brand-200 bg-white">
      {needsVerification && (
        <div className="bg-amber-50 border-b border-amber-300 text-amber-900 text-sm px-6 py-2 text-center">
          Confirme o e-mail da sua conta.
          {resent ? (
            <span className="ml-2">Enviamos outro link.</span>
          ) : (
            <button type="button" onClick={resend} className="ml-2 underline font-medium">
              Reenviar
            </button>
          )}
        </div>
      )}
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-6">
        <span className="font-semibold text-brand-900 text-sm">Brismar Pay</span>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm ${
              pathname?.startsWith(link.href) ? 'text-brand-900 font-medium' : 'text-brand-600'
            }`}
          >
            {link.label}
          </Link>
        ))}
        <Link href="/account/password" className="ml-auto text-sm text-brand-600 hover:text-brand-900">
          Senha
        </Link>
        <button
          type="button"
          data-testid="nav-logout"
          onClick={handleLogout}
          className="text-sm text-brand-600 hover:text-brand-900"
        >
          Sair
        </button>
      </div>
    </nav>
  );
}
