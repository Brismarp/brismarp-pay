'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from './api-client';

export interface CompanySummary {
  id: string;
  legalName: string;
  tradeName: string | null;
  status: string;
  kybStatus: string;
  role: string;
}

/**
 * Centraliza a checagem que toda tela autenticada precisa fazer:
 * - existe access token? senão, /login
 * - usuário já tem empresa cadastrada? senão, /onboarding
 *
 * Evita duplicar esse boilerplate em cada página (dashboard, clientes, cobranças...).
 */
export function useCompanySession() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('bpay_access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    setAccessToken(token);

    apiClient
      .listMyCompanies(token)
      .then((companies) => {
        if (companies.length === 0) {
          router.push('/onboarding');
          return;
        }
        setCompany(companies[0]);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar sua conta.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  return { accessToken, company, error, loading };
}
