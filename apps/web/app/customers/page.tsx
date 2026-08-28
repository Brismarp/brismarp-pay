'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCompanySession } from '@/lib/use-company-session';
import { apiClient, ApiError, Customer, PaginatedResult } from '@/lib/api-client';
import { Nav } from '@/components/Nav';

export default function CustomersPage() {
  const { accessToken, company, error: sessionError, loading: sessionLoading } = useCompanySession();
  const [result, setResult] = useState<PaginatedResult<Customer> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !company) return;
    apiClient
      .listCustomers(company.id, accessToken, { search: search || undefined, page })
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os clientes.'));
  }, [accessToken, company, search, page]);

  if (sessionLoading) return <PageState message="Carregando..." />;
  if (sessionError) return <PageState message={sessionError} isError />;

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-brand-900">Clientes</h1>
          <Link
            href="/customers/new"
            className="text-sm bg-brand-900 text-white px-4 py-2 rounded-lg font-medium"
          >
            Novo cliente
          </Link>
        </div>

        <input
          type="text"
          placeholder="Buscar por nome, documento ou e-mail..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="w-full max-w-sm rounded-lg border border-brand-200 px-3 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-brand-800"
        />

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!result ? (
          <p className="text-sm text-brand-600">Carregando...</p>
        ) : result.items.length === 0 ? (
          <div className="rounded-lg border border-brand-200 bg-white p-6 text-sm text-brand-600">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div className="rounded-lg border border-brand-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">Documento</th>
                  <th className="text-left px-4 py-2">E-mail</th>
                  <th className="text-left px-4 py-2">Cadastrado em</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((c) => (
                  <tr key={c.id} className="border-t border-brand-100 hover:bg-brand-50">
                    <td className="px-4 py-2">
                      <Link href={`/customers/${c.id}`} className="text-brand-900 font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-brand-600">{c.document}</td>
                    <td className="px-4 py-2 text-brand-600">{c.email ?? '—'}</td>
                    <td className="px-4 py-2 text-brand-600">
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

function PageState({ message, isError }: { message: string; isError?: boolean }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <p className={`text-sm ${isError ? 'text-red-600' : 'text-brand-600'}`}>{message}</p>
    </main>
  );
}
