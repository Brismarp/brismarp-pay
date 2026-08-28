'use client';

import { useEffect, useState } from 'react';
import { useAdminSession } from '@/lib/use-admin-session';
import { apiClient, ApiError, AdminAuditLog, PaginatedResult } from '@/lib/api-client';
import { AdminNav } from '@/components/AdminNav';

export default function AdminAuditLogsPage() {
  const { accessToken, isAdmin, error: sessionError, loading: sessionLoading } = useAdminSession();
  const [result, setResult] = useState<PaginatedResult<AdminAuditLog> | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    apiClient
      .adminListAuditLogs(accessToken, { action: actionFilter || undefined, page })
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a auditoria.'));
  }, [accessToken, isAdmin, actionFilter, page]);

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
        <h1 className="text-xl font-semibold text-brand-900 mb-6">Auditoria</h1>

        <input
          type="text"
          placeholder="Filtrar por ação (ex: company.status_change, charge.create)..."
          value={actionFilter}
          onChange={(e) => {
            setPage(1);
            setActionFilter(e.target.value);
          }}
          className="w-full max-w-md rounded-lg border border-brand-200 px-3 py-2 text-sm mb-6"
        />

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!result ? (
          <p className="text-sm text-brand-600">Carregando...</p>
        ) : result.items.length === 0 ? (
          <div className="rounded-lg border border-brand-200 bg-white p-6 text-sm text-brand-600">
            Nenhum registro de auditoria encontrado.
          </div>
        ) : (
          <div className="rounded-lg border border-brand-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Ação</th>
                  <th className="text-left px-4 py-2">Ator</th>
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-right px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((log) => (
                  <tr key={log.id} className="border-t border-brand-100">
                    <td className="px-4 py-2 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-2 text-brand-600">
                      {log.actorUser ? `${log.actorUser.name} (${log.actorUser.email})` : 'sistema'}
                    </td>
                    <td className="px-4 py-2 text-brand-600">{log.company?.legalName ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-brand-600">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
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
