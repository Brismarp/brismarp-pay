'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanySession } from '@/lib/use-company-session';
import { apiClient, ApiError } from '@/lib/api-client';
import { Nav } from '@/components/Nav';

export default function NewCustomerPage() {
  const router = useRouter();
  const { accessToken, company, loading: sessionLoading } = useCompanySession();
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !company) return;
    setError(null);
    setLoading(true);
    try {
      const customer = await apiClient.createCustomer(
        company.id,
        { name, document, email: email || undefined, phone: phone || undefined },
        accessToken,
      );
      router.push(`/customers/${customer.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o cliente.');
    } finally {
      setLoading(false);
    }
  }

  if (sessionLoading) {
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
        <h1 className="text-xl font-semibold text-brand-900 mb-6">Novo cliente</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-800 mb-1">Nome *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-800 mb-1">CPF/CNPJ *</label>
            <input
              required
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-800 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-800 mb-1">Telefone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
            />
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-900 text-white py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {loading ? 'Salvando...' : 'Salvar cliente'}
          </button>
        </form>
      </main>
    </>
  );
}
