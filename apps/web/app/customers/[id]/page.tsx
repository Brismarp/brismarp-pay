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

  useEffect(() => {
    if (!accessToken || !company) return;
    apiClient
      .getCustomer(company.id, params.id, accessToken)
      .then(setCustomer)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o cliente.'));
  }, [accessToken, company, params.id]);

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
        <h1 className="text-xl font-semibold text-brand-900 mb-1">{customer.name}</h1>
        <p className="text-sm text-brand-600 mb-6">
          {customer.document} {customer.email && `· ${customer.email}`} {customer.phone && `· ${customer.phone}`}
        </p>

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
