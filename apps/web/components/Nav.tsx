'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/customers', label: 'Clientes' },
  { href: '/charges', label: 'Cobranças' },
];

export function Nav() {
  const pathname = usePathname();

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
      </div>
    </nav>
  );
}
