# Fase 7 — API pública e API Keys

Chaves autenticam as mesmas rotas de cobrança e clientes do painel (`/v1/companies/:companyId/...`). O painel continua só com JWT. Gestão de chaves (criar/listar/revogar/rotacionar) também é só JWT.

## Implementado

- Geração de chaves nos formatos `bpay_sandbox_<random>` e `bpay_production_<random>`.
- Persistência exclusiva do hash SHA-256; a chave em claro é retornada apenas na geração ou rotação.
- Validação dos escopos contra `AVAILABLE_SCOPES`.
- Listagem sem chave completa nem hash.
- Revogação lógica por `revokedAt`, preservando auditoria.
- Rotação transacional: revoga a chave anterior e cria outra com os mesmos escopos e ambiente.
- `JwtOrApiKeyGuard` nas rotas de cobrança e clientes: `X-Api-Key` ou `Authorization: Bearer bpay_sandbox_|bpay_production_` autentica a chave; qualquer outro Bearer segue JWT.
- Isolamento de tenant: a chave só opera na empresa em que foi gerada (`params.companyId` tem de coincidir).
- Escopos por endpoint (JWT ignora `@RequireScopes`; API Key sem o escopo recebe 403):

  | Rota | Escopo |
  |---|---|
  | `GET` customers, `GET` customers/:id | `customers:read` |
  | `POST` / `PATCH` customers | `customers:write` |
  | `GET` charges, `GET` :id, `GET` :id/status | `charges:read` |
  | `POST` charges, `PATCH` cancel, `PATCH` refund, `PATCH` simulate-confirmation | `charges:write` |

- `PATCH .../charges/:id/simulate-confirmation` com API Key só aceita `environment === SANDBOX`.
- Auditoria: `AuditLog.actorUserId` fica nulo na chamada por chave; eventos usam `apiKey:<id>`.
- Rate limiting global por IP já existente no aplicativo continua protegendo as rotas.
- Provider padrão permanece `mock`. SANDBOX vs PRODUCTION é um rótulo na chave — nenhum dos dois ativa a Getnet.

## Credencial

```bash
# Substitua COMPANY_ID e a chave revelada uma única vez no painel.
export API=http://localhost:3001/v1
export COMPANY_ID=...
export KEY=bpay_sandbox_...

curl -sS -X POST "$API/companies/$COMPANY_ID/customers" \
  -H "X-Api-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cliente API","document":"12345678900","email":"cliente@teste.com"}'

curl -sS -X POST "$API/companies/$COMPANY_ID/charges" \
  -H "X-Api-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"method":"CREDIT_CARD","amountCents":5000,"customerId":"<id-do-cliente>"}'
```

`Authorization: Bearer $KEY` também vale, desde que o valor comece com `bpay_sandbox_` ou `bpay_production_`.

Rotas que **não** aceitam API Key: `/auth/*`, `/companies` (onboarding), `/api-keys`, dashboard, ledger, admin.

## Arquivos principais

```text
apps/api/src/modules/api-keys/
├── api-keys.module.ts
├── controllers/api-keys.controller.ts
├── services/api-keys.service.ts
├── dtos/create-api-key.dto.ts
└── guards/
    ├── api-key-auth.guard.ts
    ├── api-key-credential.ts
    └── jwt-or-api-key.guard.ts
```

## Limites que permanecem

`ledger:read` e `webhooks:manage` existem na lista de escopos, mas ainda não protegem rota nenhuma. Rate limit por `apiKeyId`, logs detalhados de requisição e OpenAPI continuam pendentes.

Os webhooks de saída continuam sendo uma etapa separada. O schema já contém `Webhook` e `WebhookDelivery`, porém ainda é necessário implementar o dispatcher com assinatura, retry, backoff, entrega idempotente e painel de acompanhamento.
