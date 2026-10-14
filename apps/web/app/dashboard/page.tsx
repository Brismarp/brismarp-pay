"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient, ApiError, DashboardSummary } from "@/lib/api-client";
import { useCompanySession } from "@/lib/use-company-session";
import { Nav } from "@/components/Nav";
import { EmptyState } from "@/components/EmptyState";

const STATUS_LABEL: Record<string, string> = {
  PENDING_ONBOARDING: "Onboarding pendente",
  PENDING_KYB: "Aguardando verificação da empresa",
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
  BLOCKED: "Bloqueada",
};

const VERIFICATION_LABEL: Record<string, string> = {
  NOT_STARTED: "Não iniciada",
  IN_REVIEW: "Em análise",
  APPROVED: "Aprovada",
  REJECTED: "Recusada",
};

function verificationNotice(
  status: string,
): { title: string; body: string } | null {
  if (status === "APPROVED") return null;
  if (status === "IN_REVIEW") {
    return {
      title: "Verificação em análise",
      body: "Os dados da empresa já estão em conferência. O painel e as cobranças de teste continuam disponíveis. Quando a análise terminar, a conta passa a aprovada ou recusada.",
    };
  }
  if (status === "REJECTED") {
    return {
      title: "Verificação recusada",
      body: "A conferência dos dados da empresa não foi aprovada. O painel continua acessível. Fale com a Brismar para enviar os dados novamente.",
    };
  }
  return {
    title: "Verificação dos dados da empresa",
    body: "A Brismar confere os dados enviados no cadastro antes de considerar a conta aprovada. O painel e as cobranças de teste continuam disponíveis. A conta fica pendente até alguém aprovar no console de administração.",
  };
}

const CHARGE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSING: "Processando",
  APPROVED: "Aprovada",
  DECLINED: "Recusada",
  FAILED: "Falhou",
  CANCELED: "Cancelada",
  REFUNDED: "Estornada",
  PARTIALLY_REFUNDED: "Estornada parcialmente",
  CHARGEBACK: "Chargeback",
  EXPIRED: "Expirada",
};

const PERIOD_OPTIONS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function DashboardPage() {
  const {
    accessToken,
    company,
    error: sessionError,
    loading: sessionLoading,
  } = useCompanySession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [previousSummary, setPreviousSummary] =
    useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);

  useEffect(() => {
    if (!company || !accessToken) return;

    let active = true;

    const to = new Date();
    const from = new Date(to.getTime() - periodDays * 24 * 60 * 60 * 1000);

    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(
      previousTo.getTime() - periodDays * 24 * 60 * 60 * 1000,
    );

    setError(null);
    Promise.all([
      apiClient.getDashboardSummary(company.id, accessToken, {
        from: from.toISOString(),
        to: to.toISOString(),
      }),
      apiClient.getDashboardSummary(company.id, accessToken, {
        from: previousFrom.toISOString(),
        to: previousTo.toISOString(),
      }),
    ])
      .then(([current, previous]) => {
        if (!active) return;
        setSummary(current);
        setPreviousSummary(previous);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Não foi possível carregar os indicadores.",
        );
      });

    return () => {
      active = false;
    };
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

  const notice = verificationNotice(company.kybStatus);

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-10 merchant-dashboard">
        <div className="dashboard-heading">
          <div className="dashboard-heading-copy">
            <p className="dashboard-eyebrow">PAINEL DA EMPRESA</p>
            <h1 className="text-xl font-semibold text-brand-900 mb-1">
              {company.tradeName ?? company.legalName}
            </h1>
            <div className="dashboard-account-status">
              <span>
                <i
                  className={`account-status-dot ${company.status === "ACTIVE" ? "is-active" : ""}`}
                />
                {STATUS_LABEL[company.status] ?? company.status}
              </span>
              <span className="status-divider" aria-hidden="true" />
              <span>
                Verificação{" "}
                {VERIFICATION_LABEL[company.kybStatus] ?? company.kybStatus}
              </span>
            </div>
          </div>

          <div className="dashboard-heading-actions">
            <div
              className="period-selector"
              aria-label="Período dos indicadores"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setPeriodDays(opt.days)}
                  aria-pressed={periodDays === opt.days}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    periodDays === opt.days
                      ? "bg-brand-900 text-white border-brand-900"
                      : "border-brand-200 text-brand-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Link href="/charges/new" className="dashboard-primary-action">
              <span aria-hidden="true">＋</span> Nova cobrança
            </Link>
          </div>
        </div>

        {notice && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm px-4 py-3 mb-6">
            <p className="font-medium mb-1">{notice.title}</p>
            <p>{notice.body}</p>
          </div>
        )}

        <section
          className="dashboard-section"
          aria-labelledby="overview-heading"
        >
          <div className="dashboard-section-heading">
            <div>
              <p className="dashboard-eyebrow">RESUMO FINANCEIRO</p>
              <h2 id="overview-heading">Sua operação em números</h2>
            </div>
            <span className="dashboard-period-note">
              Últimos {periodDays} dias · comparação com o período anterior
            </span>
          </div>
          <div className="dashboard-metrics-grid">
            <Card
              label="Saldo disponível"
              value={centsToBRL(summary.balance.availableCents)}
              icon="◈"
            />
            <Card
              label="Saldo pendente"
              value={centsToBRL(summary.balance.pendingCents)}
              hint={`${summary.balance.pendingCount} cobrança(s)`}
              icon="◷"
            />
            <Card
              label="Volume processado"
              value={centsToBRL(summary.volumeProcessedCents)}
              comparison={
                previousSummary
                  ? compareMoney(
                      summary.volumeProcessedCents,
                      previousSummary.volumeProcessedCents,
                    )
                  : undefined
              }
              icon="↗"
            />
            <Card
              label="Transações"
              value={String(summary.transactionCount)}
              hint="no período"
              comparison={
                previousSummary
                  ? compareNumber(
                      summary.transactionCount,
                      previousSummary.transactionCount,
                    )
                  : undefined
              }
              icon="#"
            />
            <Card
              label="Taxa de aprovação"
              value={
                summary.approvalRate === null
                  ? "—"
                  : `${(summary.approvalRate * 100).toFixed(1)}%`
              }
              comparison={compareRate(
                summary.approvalRate,
                previousSummary?.approvalRate ?? null,
              )}
              icon="✓"
            />
            <Card
              label="Taxas cobradas"
              value={centsToBRL(summary.feesChargedCents)}
              hint="no período"
              icon="%"
            />
            <Card
              label="Chargebacks"
              value={String(summary.chargebackCount)}
              hint="no período"
              icon="!"
            />
            <Card
              label="Estornos"
              value={String(summary.refundCount)}
              hint="no período"
              icon="↶"
            />
          </div>
        </section>

        <section
          className="dashboard-breakdown"
          aria-labelledby="status-heading"
        >
          <div className="dashboard-section-heading">
            <div>
              <p className="dashboard-eyebrow">ACOMPANHAMENTO</p>
              <h2 id="status-heading">Cobranças por status</h2>
            </div>
            <span className="dashboard-period-note">
              No período selecionado
            </span>
          </div>
          {summary.statusBreakdown.length === 0 ? (
            <div className="dashboard-chart-empty">
              <span aria-hidden="true">◷</span>
              <p>Nenhuma cobrança neste período.</p>
              <Link href="/charges/new">Criar a primeira cobrança ↗</Link>
            </div>
          ) : (
            <div className="dashboard-status-chart">
              {summary.statusBreakdown.map((row) => {
                const total = summary.statusBreakdown.reduce(
                  (sum, item) => sum + item.count,
                  0,
                );
                const percentage = total ? (row.count / total) * 100 : 0;
                return (
                  <div className="status-chart-row" key={row.status}>
                    <div className="status-chart-label">
                      <span>
                        {CHARGE_STATUS_LABEL[row.status] ?? row.status}
                      </span>
                      <strong>{row.count}</strong>
                    </div>
                    <div className="status-chart-track">
                      <span
                        className={`status-chart-bar status-${row.status.toLowerCase().replaceAll("_", "-")}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="dashboard-transactions">
          <div className="dashboard-section-heading">
            <div>
              <p className="dashboard-eyebrow">ÚLTIMA ATIVIDADE</p>
              <h2>Transações recentes</h2>
            </div>
            <Link href="/charges" className="dashboard-view-all">
              Ver todas as cobranças ↗
            </Link>
          </div>
          {summary.recentCharges.length === 0 ? (
            <EmptyState
              message="Nenhuma cobrança criada ainda."
              actionHref="/charges/new"
              actionLabel="Nova cobrança"
            />
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
                      <td className="px-4 py-2">{c.customerName ?? "—"}</td>
                      <td className="px-4 py-2">{c.method}</td>
                      <td className="px-4 py-2">
                        {CHARGE_STATUS_LABEL[c.status] ?? c.status}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {centsToBRL(c.amountCents)}
                      </td>
                      <td className="px-4 py-2 text-right text-brand-600">
                        {new Date(c.createdAt).toLocaleDateString("pt-BR")}
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

function compareMoney(current: number, previous: number) {
  return compareNumber(current, previous);
}

function compareNumber(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Sem variação" : "Novo no período";
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}% vs. anterior`;
}

function compareRate(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "Sem dados para comparar";
  const points = (current - previous) * 100;
  const sign = points > 0 ? "+" : "";
  return `${sign}${points.toFixed(1)} p.p. vs. anterior`;
}

function Card({
  label,
  value,
  hint,
  comparison,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  comparison?: string;
  icon: string;
}) {
  return (
    <div className="dashboard-metric-card">
      <div className="dashboard-metric-top">
        <p>{label}</p>
        <span aria-hidden="true">{icon}</span>
      </div>
      <p className="dashboard-metric-value">{value}</p>
      <div className="dashboard-metric-foot">
        <span>{comparison ?? hint ?? "Acumulado atual"}</span>
        {comparison && <i aria-hidden="true">↗</i>}
      </div>
    </div>
  );
}
