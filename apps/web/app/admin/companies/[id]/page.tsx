'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAdminSession } from '@/lib/use-admin-session';
import { apiClient, ApiError, AdminCompanyDetail } from '@/lib/api-client';
import { AdminNav } from '@/components/AdminNav';

export default function AdminCompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken, isAdmin, loading: sessionLoading } = useAdminSession();
  const [company, setCompany] = useState<AdminCompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [kybNotes, setKybNotes] = useState('');

  function load() {
    if (!accessToken || !isAdmin) return;
    apiClient
      .adminGetCompany(params.id, accessToken)
      .then(setCompany)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a empresa.'));
  }

  useEffect(load, [accessToken, isAdmin, params.id]);

  async function handleStatusChange(status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED') {
    if (!accessToken) return;
    const reason = window.prompt(`Motivo para alterar o status para ${status}:`) ?? undefined;
    setActionError(null);
    setActionLoading(true);
    try {
      await apiClient.adminUpdateCompanyStatus(params.id, { status, reason }, accessToken);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível alterar o status.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleKybDecision(decision: 'APPROVED' | 'REJECTED') {
    if (!accessToken) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await apiClient.adminReviewKyb(params.id, { decision, notes: kybNotes || undefined }, accessToken);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível registrar a decisão de KYB.');
    } finally {
      setActionLoading(false);
    }
  }

  if (sessionLoading || (!company && !error)) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }
  if (error || !company) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );
  }

  const kybStatus = company.kyb?.status ?? 'NOT_STARTED';
  const canReviewKyb = kybStatus === 'NOT_STARTED' || kybStatus === 'IN_REVIEW';

  return (
    <>
      <AdminNav />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-brand-900 mb-1">
          {company.tradeName ?? company.legalName}
        </h1>
        <p className="text-sm text-brand-600 mb-6">
          {company.cnpj} · {company.businessEmail}
        </p>

        {actionError && <p className="text-sm text-red-600 mb-4">{actionError}</p>}

        <section className="rounded-lg border border-brand-200 bg-white p-5 mb-6">
          <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
            Status da conta: {company.status}
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button
              disabled={actionLoading || company.status === 'ACTIVE'}
              onClick={() => handleStatusChange('ACTIVE')}
              className="text-xs px-3 py-1.5 rounded-full border border-brand-200 disabled:opacity-40"
            >
              Ativar
            </button>
            <button
              type="button"
              data-testid="admin-status-suspend"
              disabled={actionLoading || company.status === 'SUSPENDED'}
              onClick={() => handleStatusChange('SUSPENDED')}
              className="text-xs px-3 py-1.5 rounded-full border border-amber-300 text-amber-800 disabled:opacity-40"
            >
              Suspender
            </button>
            <button
              disabled={actionLoading || company.status === 'BLOCKED'}
              onClick={() => handleStatusChange('BLOCKED')}
              className="text-xs px-3 py-1.5 rounded-full border border-red-300 text-red-700 disabled:opacity-40"
            >
              Bloquear
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-brand-200 bg-white p-5 mb-6">
          <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
            Compliance (KYB): {kybStatus}
          </h2>

          {canReviewKyb ? (
            <>
              <textarea
                placeholder="Notas da análise (opcional)"
                value={kybNotes}
                onChange={(e) => setKybNotes(e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm mb-3"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="admin-kyb-approve"
                  disabled={actionLoading}
                  onClick={() => handleKybDecision('APPROVED')}
                  className="text-xs px-3 py-1.5 rounded-full bg-brand-900 text-white disabled:opacity-40"
                >
                  Aprovar KYB
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => handleKybDecision('REJECTED')}
                  className="text-xs px-3 py-1.5 rounded-full border border-red-300 text-red-700 disabled:opacity-40"
                >
                  Rejeitar KYB
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-brand-600">
              Esta empresa já teve o KYB decidido ({kybStatus}). Nenhuma ação disponível.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-brand-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
            Usuários vinculados
          </h2>
          <ul className="space-y-2">
            {company.users.map((cu) => (
              <li key={cu.user.id} className="text-sm flex justify-between">
                <span>
                  {cu.user.name} <span className="text-brand-400">· {cu.user.email}</span>
                </span>
                <span className="text-brand-600">{cu.role}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
