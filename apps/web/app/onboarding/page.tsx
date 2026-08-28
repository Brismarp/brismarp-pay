'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    legalName: '',
    tradeName: '',
    cnpj: '',
    businessEmail: '',
    phone: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    termsAccepted: false,
    privacyAccepted: false,
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const accessToken = sessionStorage.getItem('bpay_access_token');
    if (!accessToken) {
      router.push('/login');
      return;
    }

    setLoading(true);
    try {
      await apiClient.createCompany(
        {
          legalName: form.legalName,
          tradeName: form.tradeName || undefined,
          cnpj: form.cnpj,
          businessEmail: form.businessEmail,
          phone: form.phone || undefined,
          address: {
            zipCode: form.zipCode,
            street: form.street,
            number: form.number,
            complement: form.complement || undefined,
            district: form.district,
            city: form.city,
            state: form.state,
          },
          termsAccepted: form.termsAccepted,
          privacyAccepted: form.privacyAccepted,
        },
        accessToken,
      );
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o cadastro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-brand-900 mb-1">Cadastre sua empresa</h1>
        <p className="text-brand-600 mb-8 text-sm">
          Estas informações são necessárias para habilitar sua conta. A análise de compliance
          (KYB) acontece após o envio — sua conta ficará com status "Pendente" até a aprovação.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide">Dados da empresa</h2>
            <Field label="Razão social" required value={form.legalName} onChange={(v) => update('legalName', v)} />
            <Field label="Nome fantasia" value={form.tradeName} onChange={(v) => update('tradeName', v)} />
            <Field
              label="CNPJ"
              required
              value={form.cnpj}
              onChange={(v) => update('cnpj', v)}
              placeholder="00.000.000/0000-00"
            />
            <Field
              label="E-mail empresarial"
              required
              type="email"
              value={form.businessEmail}
              onChange={(v) => update('businessEmail', v)}
            />
            <Field label="Telefone" value={form.phone} onChange={(v) => update('phone', v)} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-brand-800 uppercase tracking-wide">Endereço</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CEP" required value={form.zipCode} onChange={(v) => update('zipCode', v)} />
              <Field label="Número" required value={form.number} onChange={(v) => update('number', v)} />
            </div>
            <Field label="Logradouro" required value={form.street} onChange={(v) => update('street', v)} />
            <Field label="Complemento" value={form.complement} onChange={(v) => update('complement', v)} />
            <div className="grid grid-cols-3 gap-4">
              <Field label="Bairro" required value={form.district} onChange={(v) => update('district', v)} />
              <Field label="Cidade" required value={form.city} onChange={(v) => update('city', v)} />
              <Field label="UF" required value={form.state} onChange={(v) => update('state', v)} />
            </div>
          </section>

          <section className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-brand-800">
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={(e) => update('termsAccepted', e.target.checked)}
                className="mt-1"
              />
              Li e aceito os Termos de Uso.
            </label>
            <label className="flex items-start gap-2 text-sm text-brand-800">
              <input
                type="checkbox"
                checked={form.privacyAccepted}
                onChange={(e) => update('privacyAccepted', e.target.checked)}
                className="mt-1"
              />
              Li e aceito a Política de Privacidade.
            </label>
          </section>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-900 text-white py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {loading ? 'Enviando...' : 'Concluir cadastro da empresa'}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-brand-800 mb-1">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
      />
    </div>
  );
}
