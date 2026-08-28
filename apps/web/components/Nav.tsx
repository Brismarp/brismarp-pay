'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/customers', label: 'Clientes' },
  { href: '/charges', label: 'Cobranças' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

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
        <button
          type="button"
          onClick={handleLogout}
          className="ml-auto text-sm text-brand-600 hover:text-brand-900"
        >
          Sair
        </button>
      </div>
    </nav>
  );
}
