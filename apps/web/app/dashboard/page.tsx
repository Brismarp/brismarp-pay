'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError, DashboardSummary } from '@/lib/api-client';
import { useCompanySession } from '@/lib/use-company-session';
import { Nav } from '@/components/Nav';

const STATUS_LABEL: Record<string, string> = {
  PENDING_ONBOARDING: 'Onboarding pendente',
  PENDING_KYB: 'Aguardando análise de compliance (KYB)',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  BLOCKED: 'Bloqueada',
};

const CHARGE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  APPROVED: 'Aprovada',
  DECLINED: 'Recusada',
  FAILED: 'Falhou',
  CANCELED: 'Cancelada',
  REFUNDED: 'Estornada',
  PARTIALLY_REFUNDED: 'Estornada parcialmente',
  CHARGEBACK: 'Chargeback',
  EXPIRED: 'Expirada',
};

const PERIOD_OPTIONS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DashboardPage() {
  const { accessToken, company, error: sessionError, loading: sessionLoading } = useCompanySession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);

  useEffect(() => {
    if (!company || !accessToken) return;

    const to = new Date();
    const from = new Date(to.getTime() - periodDays * 24 * 60 * 60 * 1000);

    apiClient
      .getDashboardSummary(company.id, accessToken, {
        from: from.toISOString(),
        to: to.toISOString(),
      })
      .then(setSummary)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os indicadores.');
      });
  }, [company, accessToken, periodDays]);

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

  if (!company || !summary) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-semibold text-brand-900 mb-1">
              {company.tradeName ?? company.legalName}
            </h1>
            <p className="text-sm text-brand-600">
              Status da conta: <span className="font-medium">{STATUS_LABEL[company.status] ?? company.status}</span>
              {' · '}
              KYB: <span className="font-medium">{company.kybStatus}</span>
            </p>
          </div>

          <div className="flex gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setPeriodDays(opt.days)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  periodDays === opt.days
                    ? 'bg-brand-900 text-white border-brand-900'
                    : 'border-brand-200 text-brand-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {company.kybStatus === 'NOT_STARTED' && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm px-4 py-3 mb-6">
            A análise de compliance (KYB) da sua empresa ainda não foi iniciada. Algumas operações
            podem ficar limitadas até a aprovação.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card label="Saldo disponível" value={centsToBRL(summary.balance.availableCents)} />
          <Card
            label="Saldo pendente"
            value={centsToBRL(summary.balance.pendingCents)}
            hint={`${summary.balance.pendingCount} cobrança(s)`}
          />
          <Card label="Volume processado" value={centsToBRL(summary.volumeProcessedCents)} hint="no período" />
          <Card label="Transações" value={String(summary.transactionCount)} hint="no período" />
          <Card
            label="Taxa de aprovação"
            value={summary.approvalRate === null ? '—' : `${(summary.approvalRate * 100).toFixed(1)}%`}
          />
          <Card label="Taxas cobradas" value={centsToBRL(summary.feesChargedCents)} hint="no período" />
          <Card label="Chargebacks" value={String(summary.chargebackCount)} />
          <Card label="Estornos" value={String(summary.refundCount)} />
        </div>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
            Cobranças por status (período selecionado)
          </h2>
          {summary.statusBreakdown.length === 0 ? (
            <p className="text-sm text-brand-600">Nenhuma cobrança neste período.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {summary.statusBreakdown.map((row) => (
                <span key={row.status} className="text-xs rounded-full border border-brand-200 px-3 py-1">
                  {CHARGE_STATUS_LABEL[row.status] ?? row.status}: <strong>{row.count}</strong>
                </span>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
            Transações recentes
          </h2>
          {summary.recentCharges.length === 0 ? (
            <div className="rounded-lg border border-brand-200 p-6 bg-white text-sm text-brand-600">
              Nenhuma cobrança criada ainda.
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
                  {summary.recentCharges.map((c) => (
                    <tr key={c.id} className="border-t border-brand-100">
                      <td className="px-4 py-2">{c.customerName ?? '—'}</td>
                      <td className="px-4 py-2">{c.method}</td>
                      <td className="px-4 py-2">{CHARGE_STATUS_LABEL[c.status] ?? c.status}</td>
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
