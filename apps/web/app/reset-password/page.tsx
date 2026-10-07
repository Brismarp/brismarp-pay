'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiClient.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-brand-900 mb-1">Nova senha</h1>
        <p className="text-brand-600 mb-8 text-sm">Mínimo de 10 caracteres, com letras e números.</p>
        {done ? (
          <p className="text-sm text-brand-800">Senha atualizada. Entre com a senha nova.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-800 mb-1">Senha nova</label>
              <input
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
              />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={loading || token.length < 20}
              className="w-full rounded-lg bg-brand-900 text-white py-2 text-sm font-medium disabled:opacity-60"
            >
              {loading ? 'Salvando...' : 'Salvar senha'}
            </button>
          </form>
        )}
        <p className="text-sm text-brand-600 mt-6">
          <a href="/login" className="text-brand-900 font-medium underline">Ir para o login</a>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center px-4"><p className="text-sm text-brand-600">Carregando...</p></main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
