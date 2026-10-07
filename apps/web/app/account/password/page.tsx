'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { Nav } from '@/components/Nav';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem('bpay_access_token')) {
      router.push('/login');
      return;
    }
    setReady(true);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = sessionStorage.getItem('bpay_access_token');
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      await apiClient.changePassword(currentPassword, newPassword, token);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-lg mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-brand-900 mb-1">Alterar senha</h1>
        <p className="text-sm text-brand-600 mb-6">
          A senha atual confirma que é você. Depois enviamos um aviso para o seu e-mail.
        </p>
        {done ? (
          <p className="text-sm text-brand-800">Senha alterada. Se não foi você, use Esqueci a senha.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-800 mb-1">Senha atual</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-800 mb-1">Senha nova</label>
              <input
                type="password"
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
              />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="text-sm bg-brand-900 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60"
            >
              {loading ? 'Salvando...' : 'Salvar senha'}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
