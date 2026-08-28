'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCompanySession } from '@/lib/use-company-session';
import { apiClient, ApiError, Charge, PaginatedResult } from '@/lib/api-client';
import { Nav } from '@/components/Nav';

const STATUS_OPTIONS = [
  'PENDING',
  'PROCESSING',
  'APPROVED',
  'DECLINED',
  'FAILED',
  'CANCELED',
  'REFUNDED',
  'CHARGEBACK',
  'EXPIRED',
];

const METHOD_OPTIONS = ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO'];

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type ChargeWithCustomer = Charge & { customer: { id: string; name: string; document: string } | null };

export default function ChargesPage() {
  const { accessToken, company, error: sessionError, loading: sessionLoading } = useCompanySession();
  const [result, setResult] = useState<PaginatedResult<ChargeWithCustomer> | null>(null);
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !company) return;
    apiClient
      .listCharges(company.id, accessToken, {
        status: status || undefined,
        method: method || undefined,
        page,
      })
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as cobranças.'));
  }, [accessToken, company, status, method, page]);

  if (sessionLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }
  if (sessionError) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{sessionError}</p>
      </main>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-brand-900">Cobranças</h1>
          <Link href="/charges/new" className="text-sm bg-brand-900 text-white px-4 py-2 rounded-lg font-medium">
            Nova cobrança
          </Link>
        </div>

        <div className="flex gap-3 mb-6">
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="text-sm rounded-lg border border-brand-200 px-3 py-2"
          >
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={method}
            onChange={(e) => {
              setPage(1);
              setMethod(e.target.value);
            }}
            className="text-sm rounded-lg border border-brand-200 px-3 py-2"
          >
            <option value="">Todos os métodos</option>
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!result ? (
          <p className="text-sm text-brand-600">Carregando...</p>
        ) : result.items.length === 0 ? (
          <div className="rounded-lg border border-brand-200 bg-white p-6 text-sm text-brand-600">
            Nenhuma cobrança encontrada com estes filtros.
          </div>
        ) : (
          <div className="rounded-lg border border-brand-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Método</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Valor</th>
                  <th className="text-right px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((c) => (
                  <tr key={c.id} className="border-t border-brand-100 hover:bg-brand-50">
                    <td className="px-4 py-2">
                      <Link href={`/charges/${c.id}`} className="text-brand-900 font-medium">
                        {c.customer?.name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{c.method}</td>
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

        {result && result.totalPages > 1 && (
          <div className="flex gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="text-xs px-3 py-1.5 rounded-full border border-brand-200 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-brand-600 self-center">
              Página {result.page} de {result.totalPages}
            </span>
            <button
              disabled={page >= result.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs px-3 py-1.5 rounded-full border border-brand-200 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        )}
      </main>
    </>
  );
}
