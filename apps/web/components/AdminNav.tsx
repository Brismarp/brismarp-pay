'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/companies', label: 'Empresas' },
  { href: '/admin/audit-logs', label: 'Auditoria' },
];

export function AdminNav() {
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
    <nav className="border-b border-brand-900 bg-brand-900">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-6">
        <span className="font-semibold text-white text-sm">Brismar Pay · Admin</span>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm ${
              pathname === link.href ? 'text-white font-medium' : 'text-brand-200'
            }`}
          >
            {link.label}
          </Link>
        ))}
        <Link href="/dashboard" className="text-sm text-brand-200 ml-auto">
          Sair do admin
        </Link>
        <button
          type="button"
          data-testid="admin-nav-logout"
          onClick={handleLogout}
          className="text-sm text-brand-200 hover:text-white"
        >
          Sair
        </button>
      </div>
    </nav>
  );
}
