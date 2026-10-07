'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiClient.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-brand-900 mb-1">Esqueci a senha</h1>
        <p className="text-brand-600 mb-8 text-sm">
          Se existir uma conta com este e-mail, enviamos um link para criar uma senha nova.
        </p>
        {sent ? (
          <p className="text-sm text-brand-800">Olhe a caixa de entrada. O link vale 1 hora.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-800 mb-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
              />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-900 text-white py-2 text-sm font-medium disabled:opacity-60"
            >
              {loading ? 'Enviando...' : 'Enviar link'}
            </button>
          </form>
        )}
        <p className="text-sm text-brand-600 mt-6">
          <a href="/login" className="text-brand-900 font-medium underline">Voltar ao login</a>
        </p>
      </div>
    </main>
  );
}
