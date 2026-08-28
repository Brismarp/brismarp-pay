'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCompanySession } from '@/lib/use-company-session';
import { apiClient, ApiError, Customer, Charge } from '@/lib/api-client';
import { Nav } from '@/components/Nav';

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken, company, loading: sessionLoading } = useCompanySession();
  const [customer, setCustomer] = useState<(Customer & { charges: Charge[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken || !company) return;
    apiClient
      .getCustomer(company.id, params.id, accessToken)
      .then((loaded) => {
        setCustomer(loaded);
        setName(loaded.name);
        setEmail(loaded.email ?? '');
        setPhone(loaded.phone ?? '');
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o cliente.'));
  }, [accessToken, company, params.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !company || !customer) return;
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await apiClient.updateCustomer(
        company.id,
        customer.id,
        { name, email: email || undefined, phone: phone || undefined },
        accessToken,
      );
      setCustomer({ ...customer, ...updated });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Não foi possível salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  if (sessionLoading || (!customer && !error)) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }

  if (error || !customer) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-brand-900 mb-1">{customer.name}</h1>
            <p className="text-sm text-brand-600">
              {customer.document} {customer.email && `· ${customer.email}`} {customer.phone && `· ${customer.phone}`}
            </p>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setName(customer.name);
                setEmail(customer.email ?? '');
                setPhone(customer.phone ?? '');
                setSaveError(null);
                setEditing(true);
              }}
              className="text-sm border border-brand-200 text-brand-800 px-3 py-1.5 rounded-lg font-medium"
            >
              Editar
            </button>
          )}
        </div>

        {editing && (
          <form onSubmit={handleSave} className="rounded-lg border border-brand-200 bg-white p-4 space-y-4 mb-8">
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
              <label className="block text-sm font-medium text-brand-800 mb-1">CPF/CNPJ</label>
              <input
                value={customer.document}
                disabled
                className="w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-600"
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
            {saveError && (
              <p className="text-sm text-red-600" role="alert">
                {saveError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="text-sm bg-brand-900 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm border border-brand-200 text-brand-800 px-4 py-2 rounded-lg font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide">
            Histórico de cobranças
          </h2>
          <Link
            href={`/charges/new?customerId=${customer.id}`}
            className="text-xs bg-brand-900 text-white px-3 py-1.5 rounded-lg font-medium"
          >
            Nova cobrança
          </Link>
        </div>

        {customer.charges.length === 0 ? (
          <div className="rounded-lg border border-brand-200 bg-white p-6 text-sm text-brand-600">
            Nenhuma cobrança para este cliente ainda.
          </div>
        ) : (
          <div className="rounded-lg border border-brand-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Método</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Valor</th>
                  <th className="text-right px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {customer.charges.map((c) => (
                  <tr key={c.id} className="border-t border-brand-100 hover:bg-brand-50">
                    <td className="px-4 py-2">
                      <Link href={`/charges/${c.id}`} className="text-brand-900 font-medium">
                        {c.method}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{c.status}</td>
                    <td className="px-4 py-2 text-right">{centsToBRL(c.amountCents)}</td>
                    <td className="px-4 py-2 text-right text-brand-600">
                      {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
