'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminSession } from '@/lib/use-admin-session';
import { apiClient, ApiError, AdminCompanyListItem, PaginatedResult } from '@/lib/api-client';
import { AdminNav } from '@/components/AdminNav';

const STATUS_OPTIONS = ['PENDING_ONBOARDING', 'PENDING_KYB', 'ACTIVE', 'SUSPENDED', 'BLOCKED'];

export default function AdminCompaniesPage() {
  const { accessToken, isAdmin, error: sessionError, loading: sessionLoading } = useAdminSession();
  const [result, setResult] = useState<PaginatedResult<AdminCompanyListItem> | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    apiClient
      .adminListCompanies(accessToken, { search: search || undefined, status: status || undefined, page })
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as empresas.'));
  }, [accessToken, isAdmin, search, status, page]);

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
      <AdminNav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-brand-900 mb-6">Empresas</h1>

        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Buscar por razão social, nome fantasia ou CNPJ..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="flex-1 max-w-sm rounded-lg border border-brand-200 px-3 py-2 text-sm"
          />
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
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!result ? (
          <p className="text-sm text-brand-600">Carregando...</p>
        ) : result.items.length === 0 ? (
          <div className="rounded-lg border border-brand-200 bg-white p-6 text-sm text-brand-600">
            Nenhuma empresa encontrada.
          </div>
        ) : (
          <div className="rounded-lg border border-brand-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-4 py-2">CNPJ</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">KYB</th>
                  <th className="text-right px-4 py-2">Clientes</th>
                  <th className="text-right px-4 py-2">Cobranças</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((c) => (
                  <tr key={c.id} className="border-t border-brand-100 hover:bg-brand-50">
                    <td className="px-4 py-2">
                      <Link href={`/admin/companies/${c.id}`} className="text-brand-900 font-medium">
                        {c.tradeName ?? c.legalName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-brand-600">{c.cnpj}</td>
                    <td className="px-4 py-2">{c.status}</td>
                    <td className="px-4 py-2">{c.kyb?.status ?? 'NOT_STARTED'}</td>
                    <td className="px-4 py-2 text-right">{c._count.customers}</td>
                    <td className="px-4 py-2 text-right">{c._count.charges}</td>
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
