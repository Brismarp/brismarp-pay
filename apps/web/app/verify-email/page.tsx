'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';

function VerifyEmailForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function confirm() {
    setError(null);
    setLoading(true);
    try {
      await apiClient.verifyEmail(token);
      setMessage('E-mail confirmado. Você já pode seguir no painel.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível confirmar o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-brand-900 mb-1">Confirmar e-mail</h1>
        <p className="text-brand-600 mb-8 text-sm">Este link confirma que o endereço da conta é seu.</p>
        {message && <p className="text-sm text-brand-800 mb-4">{message}</p>}
        {error && <p className="text-sm text-red-600 mb-4" role="alert">{error}</p>}
        {!message && (
          <button
            type="button"
            onClick={confirm}
            disabled={loading || token.length < 20}
            className="w-full rounded-lg bg-brand-900 text-white py-2 text-sm font-medium disabled:opacity-60"
          >
            {loading ? 'Confirmando...' : 'Confirmar e-mail'}
          </button>
        )}
        <p className="text-sm text-brand-600 mt-6">
          <a href="/login" className="text-brand-900 font-medium underline">Ir para o login</a>
        </p>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center px-4"><p className="text-sm text-brand-600">Carregando...</p></main>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
