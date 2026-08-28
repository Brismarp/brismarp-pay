'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from './api-client';

/**
 * Protege toda tela sob /admin. Diferente de useCompanySession, aqui não importa
 * se o usuário tem empresa — importa exclusivamente se isPlatformAdmin é true.
 * Usuários comuns (mesmo OWNER de uma empresa) são redirecionados para fora.
 */
export function useAdminSession() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
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
      .me(token)
      .then((user) => {
        if (!user.isPlatformAdmin) {
          router.push('/dashboard');
          return;
        }
        setIsAdmin(true);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível verificar sua sessão.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  return { accessToken, isAdmin, error, loading };
}
