'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useCompanySession } from '@/lib/use-company-session';
import { apiClient, ApiError, Charge, ChargeEvent } from '@/lib/api-client';
import { Nav } from '@/components/Nav';

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type ChargeDetail = Charge & { events: ChargeEvent[]; transactions: unknown[] };

export default function ChargeDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken, company, loading: sessionLoading } = useCompanySession();
  const [charge, setCharge] = useState<ChargeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    if (!accessToken || !company) return;
    apiClient
      .getCharge(company.id, params.id, accessToken)
      .then(setCharge)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a cobrança.'));
  }

  useEffect(load, [accessToken, company, params.id]);

  async function handleCancel() {
    if (!accessToken || !company) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await apiClient.cancelCharge(company.id, params.id, accessToken);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível cancelar.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSimulateConfirmation() {
    if (!accessToken || !company) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await apiClient.simulateChargeConfirmation(company.id, params.id, accessToken);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível simular a confirmação.');
    } finally {
      setActionLoading(false);
    }
  }

  if (sessionLoading || (!charge && !error)) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }

  if (error || !charge) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );
  }

  const canCancel = ['PENDING', 'PROCESSING'].includes(charge.status);
  const canSimulateConfirmation =
    (charge.method === 'PIX' || charge.method === 'BOLETO') && charge.status === 'PENDING';

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-brand-900 mb-1">{centsToBRL(charge.amountCents)}</h1>
        <p className="text-sm text-brand-600 mb-6">
          {charge.method} · Status: <span className="font-medium">{charge.status}</span>
        </p>

        {canSimulateConfirmation && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm px-4 py-3 mb-4">
            Esta cobrança está aguardando pagamento. O botão abaixo simula a confirmação apenas em
            ambiente de sandbox — em produção, a confirmação virá exclusivamente do webhook do
            provider real.
          </div>
        )}

        {actionError && <p className="text-sm text-red-600 mb-4">{actionError}</p>}

        <div className="flex gap-3 mb-8">
          {canSimulateConfirmation && (
            <button
              onClick={handleSimulateConfirmation}
              disabled={actionLoading}
              className="text-sm bg-brand-900 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60"
            >
              Simular confirmação (sandbox)
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="text-sm border border-brand-200 text-brand-800 px-4 py-2 rounded-lg font-medium disabled:opacity-60"
            >
              Cancelar cobrança
            </button>
          )}
        </div>

        <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide mb-3">
          Linha do tempo
        </h2>
        <ol className="space-y-3">
          {charge.events.map((ev) => (
            <li key={ev.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-900 shrink-0" />
              <div>
                <p className="text-brand-900">
                  {ev.fromStatus ? `${ev.fromStatus} → ${ev.toStatus}` : `Criada como ${ev.toStatus}`}
                </p>
                <p className="text-xs text-brand-400">
                  {new Date(ev.createdAt).toLocaleString('pt-BR')} · origem: {ev.source}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
