'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = sessionStorage.getItem('bpay_access_token');
    if (!token) {
      router.replace('/login');
      return;
    }

    apiClient
      .listMyCompanies(token)
      .then((companies) => {
        router.replace(companies.length > 0 ? '/dashboard' : '/onboarding');
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <p className="text-sm text-brand-600">Carregando...</p>
    </main>
  );
}
