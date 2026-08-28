'use client';

import { useEffect, useState } from 'react';
import { useAdminSession } from '@/lib/use-admin-session';
import { apiClient, ApiError, AdminDashboardSummary } from '@/lib/api-client';
import { AdminNav } from '@/components/AdminNav';

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdminDashboardPage() {
  const { accessToken, isAdmin, error: sessionError, loading: sessionLoading } = useAdminSession();
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    apiClient
      .adminGetDashboardSummary(accessToken)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o dashboard.'));
  }, [accessToken, isAdmin]);

  if (sessionLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }
  if (sessionError || error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{sessionError ?? error}</p>
      </main>
    );
  }
  if (!summary) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }

  return (
    <>
      <AdminNav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-brand-900 mb-6">Visão geral da plataforma</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card label="Volume processado" value={centsToBRL(summary.volumeProcessedCents)} hint="últimos 30 dias" />
          <Card label="Taxas arrecadadas" value={centsToBRL(summary.feesCollectedCents)} hint="últimos 30 dias" />
          <Card label="Clientes cadastrados" value={String(summary.totalCustomers)} hint="em toda a plataforma" />
          <Card label="KYB pendente" value={String(summary.pendingKybCount)} hint="empresas aguardando análise" />
        </div>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
            Empresas por status
          </h2>
          <div className="flex flex-wrap gap-2">
            {summary.companiesByStatus.map((row) => (
              <span key={row.status} className="text-xs rounded-full border border-brand-200 px-3 py-1 bg-white">
                {row.status}: <strong>{row.count}</strong>
              </span>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
            Cobranças por status (últimos 30 dias)
          </h2>
          <div className="flex flex-wrap gap-2">
            {summary.chargeStatusBreakdown.length === 0 ? (
              <p className="text-sm text-brand-600">Nenhuma cobrança no período.</p>
            ) : (
              summary.chargeStatusBreakdown.map((row) => (
                <span key={row.status} className="text-xs rounded-full border border-brand-200 px-3 py-1 bg-white">
                  {row.status}: <strong>{row.count}</strong>
                </span>
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-brand-200 bg-white p-4">
      <p className="text-xs text-brand-600 mb-1">{label}</p>
      <p className="text-lg font-semibold text-brand-900">{value}</p>
      {hint && <p className="text-xs text-brand-400 mt-0.5">{hint}</p>}
    </div>
  );
}
