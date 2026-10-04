'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCompanySession } from '@/lib/use-company-session';
import { apiClient, ApiError, ChargeMethod, Customer } from '@/lib/api-client';
import { Nav } from '@/components/Nav';

const METHOD_LABEL: Record<ChargeMethod, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  BOLETO: 'Boleto',
};

export default function NewChargePage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center px-4"><p className="text-sm text-brand-600">Carregando...</p></main>}>
      <NewChargeForm />
    </Suspense>
  );
}

function NewChargeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, company, loading: sessionLoading } = useCompanySession();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '');
  const [method, setMethod] = useState<ChargeMethod>('PIX');
  const [amount, setAmount] = useState(''); // em reais, convertido para centavos no envio
  const [installments, setInstallments] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !company) return;
    apiClient
      .listCustomers(company.id, accessToken, { page: 1 })
      .then((res) => setCustomers(res.items))
      .catch(() => setError('Não foi possível carregar a lista de clientes.'));
  }, [accessToken, company]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !company) return;

    const amountCents = Math.round(parseFloat(amount.replace(',', '.')) * 100);
    if (!customerId) {
      setError('Selecione um cliente.');
      return;
    }
    if (!amountCents || amountCents < 500) {
      setError('Informe um valor válido (mínimo R$ 5,00).');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const charge = await apiClient.createCharge(
        company.id,
        {
          method,
          amountCents,
          customerId,
          installments: method === 'CREDIT_CARD' ? installments : undefined,
        },
        accessToken,
      );
      router.push(`/charges/${charge.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a cobrança.');
    } finally {
      setLoading(false);
    }
  }

  if (sessionLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-brand-600">Carregando...</p>
      </main>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-lg mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-brand-900 mb-1">Nova cobrança</h1>
        <p className="text-sm text-brand-600 mb-6">
          A Asaas exige no mínimo R$ 5,00 por cobrança.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-800 mb-1">Cliente *</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.document}
                </option>
              ))}
            </select>
            {customers.length === 0 && (
              <p className="text-xs text-brand-400 mt-1">
                Nenhum cliente cadastrado ainda.{' '}
                <a href="/customers/new" className="underline">
                  Cadastrar cliente
                </a>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-800 mb-1">Método *</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as ChargeMethod)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
            >
              {Object.entries(METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-800 mb-1">Valor (R$) *</label>
            <input
              required
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
            />
            <p className="text-xs text-brand-400 mt-1">Mínimo R$ 5,00. Abaixo disso a Asaas recusa a cobrança.</p>
          </div>

          {method === 'CREDIT_CARD' && (
            <div>
              <label className="block text-sm font-medium text-brand-800 mb-1">Parcelas</label>
              <input
                type="number"
                min={1}
                max={12}
                value={installments}
                onChange={(e) => setInstallments(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            data-testid="new-charge-submit"
            className="w-full rounded-lg bg-brand-900 text-white py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {loading ? 'Criando...' : 'Criar cobrança'}
          </button>
        </form>
      </main>
    </>
  );
}
