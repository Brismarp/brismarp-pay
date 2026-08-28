'use client';

import { useEffect, useState } from 'react';
import { useCompanySession } from '@/lib/use-company-session';
import {
  apiClient,
  ApiError,
  API_KEY_SCOPES,
  ApiKeyEnvironment,
  ApiKeyListItem,
  ApiKeySecretResponse,
} from '@/lib/api-client';
import { Nav } from '@/components/Nav';

export default function ApiKeysPage() {
  const { accessToken, company, error: sessionError, loading: sessionLoading } = useCompanySession();
  const [keys, setKeys] = useState<ApiKeyListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<ApiKeyEnvironment>('SANDBOX');
  const [scopes, setScopes] = useState<string[]>(['charges:read']);
  const [creating, setCreating] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<ApiKeySecretResponse | null>(null);

  function load() {
    if (!accessToken || !company) return;
    apiClient
      .listApiKeys(company.id, accessToken)
      .then(setKeys)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as API Keys.'));
  }

  useEffect(load, [accessToken, company]);

  function toggleScope(scope: string) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !company) return;
    setError(null);
    setCreating(true);
    try {
      const created = await apiClient.createApiKey(company.id, { name, environment, scopes }, accessToken);
      setRevealed(created);
      setName('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a API Key.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!accessToken || !company) return;
    if (!window.confirm('Revogar esta API Key? Integrações que a usam deixam de autenticar.')) return;
    setActionId(id);
    setError(null);
    try {
      await apiClient.revokeApiKey(company.id, id, accessToken);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível revogar a API Key.');
    } finally {
      setActionId(null);
    }
  }

  async function handleRotate(id: string) {
    if (!accessToken || !company) return;
    if (!window.confirm('Rotacionar esta API Key? A chave atual é revogada e uma nova é gerada.')) return;
    setActionId(id);
    setError(null);
    try {
      const rotated = await apiClient.rotateApiKey(company.id, id, accessToken);
      setRevealed(rotated);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível rotacionar a API Key.');
    } finally {
      setActionId(null);
    }
  }

  async function copyKey(value: string) {
    await navigator.clipboard.writeText(value);
  }

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
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-brand-900 mb-1">API Keys</h1>
        <p className="text-sm text-brand-600 mb-6">
          Estas chaves autenticam a futura API pública. Elas não substituem o login do painel.
        </p>

        {revealed && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm px-4 py-3 mb-6">
            <p className="font-medium mb-2">{revealed.warning}</p>
            <code className="block break-all bg-white border border-amber-200 rounded px-3 py-2 mb-3">{revealed.key}</code>
            <button
              type="button"
              onClick={() => copyKey(revealed.key)}
              className="text-xs border border-amber-400 px-3 py-1.5 rounded-lg font-medium"
            >
              Copiar chave
            </button>
          </div>
        )}

        <form onSubmit={handleCreate} className="rounded-lg border border-brand-200 bg-white p-4 space-y-4 mb-8">
          <h2 className="text-sm font-semibold text-brand-800">Nova chave</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-brand-800 mb-1">Nome *</label>
              <input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-800 mb-1">Ambiente</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as ApiKeyEnvironment)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              >
                <option value="SANDBOX">SANDBOX</option>
                <option value="PRODUCTION">PRODUCTION</option>
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-brand-800 mb-2">Escopos</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="text-sm text-brand-700 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  {scope}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={creating || scopes.length === 0}
            className="text-sm bg-brand-900 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60"
          >
            {creating ? 'Gerando...' : 'Gerar chave'}
          </button>
        </form>

        {error && (
          <p className="text-sm text-red-600 mb-4" role="alert">
            {error}
          </p>
        )}

        {!keys ? (
          <p className="text-sm text-brand-600">Carregando...</p>
        ) : keys.length === 0 ? (
          <div className="rounded-lg border border-brand-200 bg-white p-6 text-sm text-brand-600">
            Nenhuma API Key ainda. Gere a primeira acima.
          </div>
        ) : (
          <div className="rounded-lg border border-brand-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">Prefixo</th>
                  <th className="text-left px-4 py-2">Ambiente</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-t border-brand-100">
                    <td className="px-4 py-2 font-medium text-brand-900">{key.name}</td>
                    <td className="px-4 py-2 text-brand-600 font-mono text-xs">{key.prefix}…</td>
                    <td className="px-4 py-2">{key.environment}</td>
                    <td className="px-4 py-2">{key.revokedAt ? 'Revogada' : 'Ativa'}</td>
                    <td className="px-4 py-2 text-right space-x-2">
                      {!key.revokedAt && (
                        <>
                          <button
                            type="button"
                            disabled={actionId === key.id}
                            onClick={() => handleRotate(key.id)}
                            className="text-xs border border-brand-200 px-2 py-1 rounded disabled:opacity-60"
                          >
                            Rotacionar
                          </button>
                          <button
                            type="button"
                            disabled={actionId === key.id}
                            onClick={() => handleRevoke(key.id)}
                            className="text-xs border border-red-200 text-red-700 px-2 py-1 rounded disabled:opacity-60"
                          >
                            Revogar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
