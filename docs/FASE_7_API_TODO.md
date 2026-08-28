# Fase 7 — API pública e API Keys

A fundação de API Keys foi implementada nesta rodada. O módulo está registrado no `app.module.ts`, as rotas administrativas estão protegidas por JWT/RBAC e o segredo completo nunca é persistido.

## Implementado

- Geração de chaves nos formatos `bpay_sandbox_<random>` e `bpay_production_<random>`.
- Persistência exclusiva do hash SHA-256; a chave em claro é retornada apenas na geração ou rotação.
- Validação dos escopos contra `AVAILABLE_SCOPES`.
- Listagem sem chave completa nem hash.
- Revogação lógica por `revokedAt`, preservando auditoria.
- Rotação transacional: revoga a chave anterior e cria outra com os mesmos escopos e ambiente.
- `ApiKeyAuthGuard` com `X-Api-Key` ou `Authorization: Bearer`, busca por hash, rejeição de revogadas e atualização assíncrona de `lastUsedAt`.
- Contexto de empresa anexado à requisição como `companyContext`, com papel `API_KEY`.
- Rate limiting global por IP já existente no aplicativo continua protegendo as rotas.
- Provider padrão permanece `mock`; nenhuma chave sandbox pode, por si só, ativar a Getnet.

## Arquivos principais

```text
apps/api/src/modules/api-keys/
├── api-keys.module.ts
├── controllers/api-keys.controller.ts
├── services/api-keys.service.ts
├── dtos/create-api-key.dto.ts
└── guards/api-key-auth.guard.ts
```

## Limites que permanecem

A autenticação de API Key está pronta para ser usada por uma API pública, mas ainda é necessário definir e implementar as rotas públicas específicas, seus escopos obrigatórios e o contrato de ambiente para cada operação. Também permanecem recomendáveis o rate limit específico por `apiKeyId`, logs detalhados de requisição, documentação OpenAPI e uma matriz formal de permissões por endpoint.

Os webhooks de saída continuam sendo uma etapa separada. O schema já contém `Webhook` e `WebhookDelivery`, porém ainda é necessário implementar o dispatcher com assinatura, retry, backoff, entrega idempotente e painel de acompanhamento.
