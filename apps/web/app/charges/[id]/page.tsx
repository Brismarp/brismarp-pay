'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useCompanySession } from '@/lib/use-company-session';
import { apiClient, ApiError, Charge, ChargeCheckout, ChargeEvent } from '@/lib/api-client';
import { eventMessage, eventSourceLabel, failureText } from '@/lib/charge-events';
import { Nav } from '@/components/Nav';

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type ChargeDetail = Charge & { events: ChargeEvent[]; transactions: unknown[] };

function checkoutFromCharge(charge: ChargeDetail): ChargeCheckout | null {
  if (charge.metadata?.checkout) return charge.metadata.checkout;
  for (let i = charge.events.length - 1; i >= 0; i -= 1) {
    const checkout = charge.events[i]?.metadata?.checkout;
    if (checkout && (checkout.pixCopyPaste || checkout.pixQrCodeImage || checkout.invoiceUrl || checkout.bankSlipUrl)) {
      return checkout;
    }
  }
  return null;
}

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

  async function handleRefund() {
    if (!accessToken || !company) return;
    if (!window.confirm('Estornar o valor líquido desta cobrança? A taxa permanece lançada.')) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await apiClient.refundCharge(company.id, params.id, accessToken);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível estornar.');
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

  const checkout = checkoutFromCharge(charge);
  const failed = charge.status === 'FAILED' || charge.status === 'DECLINED';
  const latestFailure = [...charge.events].reverse().find((ev) => ev.toStatus === 'FAILED' || ev.toStatus === 'DECLINED');
  const canCancel = ['PENDING', 'PROCESSING'].includes(charge.status);
  const canSimulateConfirmation =
    (charge.providerName ?? 'mock') === 'mock' &&
    (charge.method === 'PIX' || charge.method === 'BOLETO') &&
    charge.status === 'PENDING';
  const canRefund = charge.status === 'APPROVED';

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-brand-900 mb-1">{centsToBRL(charge.amountCents)}</h1>
        <p className="text-sm text-brand-600 mb-6">
          {charge.method} · Status: <span className="font-medium">{charge.status}</span>
        </p>

        {failed && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3 mb-4">
            <p className="font-medium mb-1">A operadora recusou esta cobrança</p>
            <p>{failureText(eventMessage(latestFailure?.metadata))}</p>
          </div>
        )}

        {canSimulateConfirmation && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm px-4 py-3 mb-4">
            Esta cobrança está aguardando pagamento. O botão abaixo simula a confirmação apenas em
            ambiente de sandbox — em produção, a confirmação virá exclusivamente do webhook do
            provider real.
          </div>
        )}

        {checkout && (
          <div className="rounded-lg border border-brand-200 bg-white px-4 py-4 mb-6">
            <p className="text-sm font-medium text-brand-900 mb-3">Pagamento</p>
            {checkout.pixQrCodeImage && (
              <img
                src={`data:image/png;base64,${checkout.pixQrCodeImage}`}
                alt="QR Code PIX"
                className="w-44 h-44 mb-3 bg-white"
              />
            )}
            {checkout.pixCopyPaste && (
              <div className="mb-3">
                <p className="text-xs text-brand-500 mb-1">PIX copia e cola</p>
                <p className="text-xs font-mono break-all text-brand-800 bg-brand-50 rounded p-2">{checkout.pixCopyPaste}</p>
                <button
                  type="button"
                  className="mt-2 text-xs text-brand-700 underline"
                  onClick={() => navigator.clipboard.writeText(checkout.pixCopyPaste ?? '')}
                >
                  Copiar código PIX
                </button>
              </div>
            )}
            {checkout.invoiceUrl && (
              <a href={checkout.invoiceUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-800 underline">
                Abrir fatura
              </a>
            )}
            {checkout.bankSlipUrl && (
              <a href={checkout.bankSlipUrl} target="_blank" rel="noreferrer" className="block text-sm text-brand-800 underline mt-1">
                Baixar boleto
              </a>
            )}
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
          {canRefund && (
            <button
              type="button"
              data-testid="charge-refund"
              onClick={handleRefund}
              disabled={actionLoading}
              className="text-sm border border-red-200 text-red-700 px-4 py-2 rounded-lg font-medium disabled:opacity-60"
            >
              Estornar
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
                {eventMessage(ev.metadata) && (
                  <p className="text-brand-700">{eventMessage(ev.metadata)}</p>
                )}
                <p className="text-xs text-brand-400">
                  {new Date(ev.createdAt).toLocaleString('pt-BR')} · {eventSourceLabel(ev.source)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
