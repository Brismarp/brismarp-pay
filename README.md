# Brismar Pay

Gateway de pagamentos B2B — fundação da plataforma (Fases 1–3 do plano de execução).
Consulte `docs/ARCHITECTURE.md` para as decisões de arquitetura.

## Stack

- **Frontend**: Next.js 15 + React + TypeScript + Tailwind (`apps/web`)
- **Backend**: NestJS + TypeScript (`apps/api`)
- **Banco**: PostgreSQL via Prisma (`packages/database/schema.prisma`)
- **Cache/Filas**: Redis + BullMQ, com worker de recuperação/conciliação separado (`apps/api/src/workers/payment-recovery.worker.ts`)

## O que está implementado nesta entrega

- Monorepo estruturado (`apps/web`, `apps/api`, `packages/database`)
- Schema de banco completo (todas as entidades do escopo: empresas, usuários, RBAC, clientes, cobranças, ledger, API keys, webhooks, auditoria)
- Autenticação real: registro, login, JWT (access + refresh rotativo), logout, proteção contra brute-force (lockout de conta + rate limiting), hash de senha com bcrypt
- Guards de autorização: `JwtAuthGuard`, `CompanyRolesGuard` (isolamento de tenant), `PlatformAdminGuard`
- **Onboarding de empresa completo**: cadastro com validação real de CNPJ (algoritmo de dígito verificador), endereço, dados bancários opcionais, aceite obrigatório de termos/privacidade, criação de registro de KYB com status `NOT_STARTED` (nenhuma aprovação automática), vínculo do usuário como `OWNER` — tudo em transação atômica
- Endpoints `POST /companies`, `GET /companies/me`, `GET /companies/:id` (protegidos, com verificação real de vínculo usuário↔empresa)
- **Clientes**: CRUD com busca (nome/documento/email) e paginação, escopado por empresa
- **Cobranças (PIX/Cartão/Débito/Boleto)** via `MockPaymentProvider`: criação com idempotência real (replay retorna a cobrança existente em vez de duplicar), timeline de eventos (`ChargeEvent`), listagem com filtros (status/método/cliente) + paginação + ordenação, cancelamento, e um endpoint sandbox-only para simular confirmação de PIX/boleto (não existe equivalente em produção — lá a confirmação vem do webhook real)
- **Ledger financeiro real**: toda cobrança aprovada gera `Transaction` + lançamentos `LedgerEntry` (crédito líquido + taxa), calculados dentro de transação `Serializable` para evitar corrida de saldo; saldo nunca é um campo editável — é sempre derivado do último lançamento
- Endpoints de saldo/extrato: `GET /companies/:id/ledger/balance`, `GET /companies/:id/ledger/entries`
- **Dashboard real** (`GET /companies/:id/dashboard/summary?from=&to=`): saldo disponível e pendente, volume processado, quantidade de transações, taxa de aprovação, taxas cobradas, chargebacks, estornos, breakdown por status e transações recentes — tudo calculado por agregação direta no banco, sem nenhum número fixo. Frontend com período selecionável (7/30/90 dias)
- Abstração `PaymentProvider` com `MockPaymentProvider` funcional e adaptador estrutural da Getnet — nenhuma chamada real à Getnet
- Health checks (`GET /v1/health` e `GET /v1/health/queues`) validando banco e métricas básicas da fila
- Docker Compose para ambiente de desenvolvimento (Postgres + Redis + API + worker + Web)
- Frontend com login, registro, onboarding de empresa e **dashboard com dados reais** funcionais, conectados de ponta a ponta à API
- **Telas de Clientes e Cobranças no frontend**: listagem com busca/filtros/paginação, cadastro de cliente, criação de cobrança (PIX/cartão/débito/boleto), detalhe do cliente com histórico, detalhe da cobrança com timeline de eventos, cancelamento e o botão de simulação de confirmação (sandbox) — tudo consumindo os mesmos endpoints da API, nenhuma tela isolada sem integração
- **API Keys no painel e nas rotas de negócio**: criar/revogar/rotacionar chaves (JWT). Clientes e cobranças também aceitam `X-Api-Key` com escopos; ver `docs/FASE_7_API_TODO.md`
- Navegação compartilhada (`components/Nav.tsx`) e hook de sessão/empresa compartilhado (`lib/use-company-session.ts`) — evita duplicar a lógica de "usuário logado + empresa carregada" em cada página
- **Painel administrativo** (`/admin/*`, backend em `modules/admin/`): dashboard consolidado cross-tenant (volume, taxas, clientes, empresas por status, KYB pendente), listagem/detalhe de empresas com busca e filtro, **ações administrativas reais** (ativar/suspender/bloquear empresa, aprovar/rejeitar KYB — aprovação ativa a empresa automaticamente, rejeição não altera nada sozinha), e consulta de auditoria com filtro por ação. Protegido por `PlatformAdminGuard`, completamente separado das rotas de empresa — usuário comum (mesmo `OWNER`) é redirecionado para fora se tentar acessar
- **Testes automatizados**: 53 testes unitários (8 suítes, incluindo Redis, OAuth Getnet, idempotência, webhook, recuperação, ledger, auth, isolamento de tenant e ações administrativas). Suíte E2E com os fluxos críticos contra PostgreSQL + Redis reais, executada quando `TEST_DATABASE_URL` e `TEST_REDIS_URL` estão definidas. Ver `## Como executar os testes` abaixo

## O que NÃO está implementado (próximas fases)

Aprovação real de KYB por provedor externo, remoção de clientes, estornos parciais, sistema de webhooks de saída, gestão avançada de incidentes/APM, notificações, promoção de usuários a admin pela própria interface e integração real com a Getnet. O webhook de entrada permanece preparado, mas sua autenticidade depende da implementação oficial do provider Getnet.

**API Keys:** geração, listagem, revogação e rotação no painel (JWT). As mesmas rotas de clientes e cobranças aceitam `X-Api-Key` (ou Bearer `bpay_*`) com conferência de empresa e de escopo. Ledger, dashboard, admin e CRUD de chaves continuam só JWT. Ver `docs/FASE_7_API_TODO.md`.

A operação assíncrona está documentada em `docs/OPERACAO_ASYNC.md`, e o checklist auditado está em `docs/IMPLEMENTACAO_REDIS_GETNET_CHECKLIST.md`.

**Importante sobre a taxa aplicada no ledger:** o código usa uma taxa fixa de 2,5% como placeholder determinístico (`PLACEHOLDER_FEE_BPS` em `charges.service.ts`) apenas para o ledger ter uma regra testável. Isso não reflete nenhuma tabela comercial real — a definição de taxas por empresa/plano é uma decisão de negócio pendente, não técnica.

## Como instalar e executar

```bash
git clone <repositorio>
cd brismar-pay
make setup    # .env, Postgres, Redis, deps, schema
make dev      # API + web + worker
```

Acesse `http://localhost:3000` (redireciona para login, onboarding ou dashboard). `make help` lista os outros alvos (`api`, `web`, `worker`, `test`, `test-e2e`, `test-ui`, `docker`).

Dependências ficam em `apps/api` e `apps/web` — não há `package.json` na raiz.

## Como executar com Docker

```bash
docker compose up --build
```

- API: `http://localhost:3001/v1/health`
- Web: `http://localhost:3000`

## Como criar um usuário administrador da plataforma

Não existe mais só a via manual — agora que o painel admin está implementado, a
**primeira** promoção ainda precisa ser manual (não existe endpoint para um usuário
se auto-promover, isso seria uma falha de segurança grave):

```sql
UPDATE "User" SET "isPlatformAdmin" = true WHERE email = 'seu-email@empresa.com';
```

Depois disso, esse usuário acessa `/admin` no frontend e usa `GET/PATCH
/admin/companies`, `/admin/companies/:id/status`, `/admin/companies/:id/kyb` e
`GET /admin/audit-logs` normalmente — não há hoje uma tela para promover outros
usuários a admin pela própria interface (ficaria natural adicionar em
`AdminCompaniesController`/um novo `AdminUsersController` futuramente).

## Variáveis de ambiente

Ver `.env.example` — todas as variáveis necessárias estão documentadas ali, incluindo os placeholders reservados (não preenchidos) para a futura integração Getnet.

## Como executar os testes

Três camadas. `make test` continua só nos unitários da API.

### 1. Unitários (Prisma e Redis mockados)

Não precisam de Postgres nem Redis.

```bash
make test
# equivalente: JWT_SECRET=qualquer-valor npm test --prefix apps/api
```

### 2. HTTP e2e / integração (Nest + Postgres + Redis)

Supertest contra a API real. Exigem `TEST_DATABASE_URL` e `TEST_REDIS_URL` (sem elas a suíte é pulada, não falha). O alvo `test-e2e` reutiliza `DATABASE_URL` / `REDIS_URL` do `.env` se `TEST_*` não existirem.

```bash
make infra
make prisma
make test-e2e
```

### 3. Playwright (console do lojista e painel `/admin`, Chromium)

Sobe API + Next (ou reutiliza `make dev` se já estiverem no ar). Mesmo Postgres/Redis da camada 2. Sem Firefox/WebKit no CI.

```bash
cd apps/web && npx playwright install chromium
make test-ui
```

`PAYMENT_PROVIDER` permanece `mock`. O walk de `/admin` promove o usuário via Prisma (`isPlatformAdmin`); não existe auto-promote na API. Sem chamadas Getnet.

**Executado nesta entrega, de verdade** (não apenas escrito): `npm install`, `prisma
generate`, os 53 testes unitários (8 suítes, todas verdes), a suíte E2E confirmando
que o skip funciona sem Postgres/Redis, e o build de produção (`nest build`) sem erros. A validação do Docker Compose não pôde ser executada neste ambiente porque o binário `docker` não está instalado.

## O que os testes cobrem

- **`cnpj.validator.spec.ts`**: algoritmo de dígito verificador (válido, inválido, dígitos repetidos, tamanho incorreto)
- **`auth.service.spec.ts`**: registro com senha hasheada, anti-enumeração de e-mail (mesma mensagem de erro para "usuário não existe" e "senha errada"), lockout após 5 tentativas, exigência de 2FA, rotação de refresh token
- **`ledger.service.spec.ts`**: cálculo de saldo (CREDIT soma, DEBIT/FEE subtraem), saldo inicial zero, escopo sempre por `companyId`
- **`charges.service.spec.ts`**: rejeição de cliente de outra empresa, **idempotência real** (replay não duplica, chave de outra empresa é rejeitada), cache de status, deduplicação de webhook, recuperação, expiração, geração de `Transaction`+`LedgerEntry` só quando aprovada, PIX pendente sem lançamento e cancelamento bloqueado para cobrança aprovada
- **`company-roles.guard.spec.ts`**: isolamento de tenant (sem vínculo → bloqueado, papel fora da lista → bloqueado, papel válido → contexto de empresa anexado ao request)
- **`redis.service.spec.ts`**: JSON com TTL, `SET NX`, release seguro do lock e encerramento da conexão.
- **`getnet-auth.service.spec.ts`**: OAuth client-credentials, Basic Auth, cache e renovação antecipada do token.
- **`critical-flows.e2e-spec.ts`**: fluxos ponta a ponta contra Postgres + Redis reais — cadastro, login, onboarding, cliente (criação e edição), cobrança aprovada, estorno, PIX com simulação de confirmação, refresh/logout, dashboard, idempotência, Redis, cancelamento bloqueado e isolamento de tenant; é pulado sem as duas URLs de teste.
- **`admin-flows.e2e-spec.ts`**: lojista comum recebe 403 em `/admin`; usuário promovido via Prisma aprova KYB e a empresa fica `ACTIVE`.
- **`apps/web/e2e/merchant-console.spec.ts`**: Playwright (Chromium) no console do lojista — onboarding, cliente, cobrança de cartão, estorno, API Key sandbox e logout.
- **`apps/web/e2e/admin-console.spec.ts`**: Playwright do painel `/admin` — lojista redirecionado, admin promovido via Prisma, aprovação de KYB, suspensão e auditoria.

## Segurança implementada nesta fase

- Senhas com bcrypt (12 rounds)
- Refresh token armazenado como hash (SHA-256), nunca em claro
- Cookie de refresh token: `HttpOnly`, `Secure` (produção), `SameSite=Strict`
- Rate limiting global (100 req/min) + limites específicos em `/auth/login` e `/auth/register`
- Lockout de conta após 5 tentativas de login falhas (15 minutos)
- Validação de entrada estrita (`whitelist` + `forbidNonWhitelisted` em todos os DTOs)
- Headers de segurança via Helmet
- Isolamento de tenant reforçado no `CompanyRolesGuard` (nunca confia em `companyId` vindo do corpo da requisição sem cruzar com o vínculo real no banco)

## Processo futuro de integração com a Getnet

1. Consultar a documentação oficial vigente da Getnet no momento da implementação.
2. Confirmar: autenticação, endpoints, ambientes (sandbox/produção), formato de webhook, métodos suportados.
3. Criar `GetnetPaymentProvider implements PaymentProvider` em `apps/api/src/integrations/payment-providers/`.
4. Nenhum código de domínio (use-cases, controllers, ledger) deve ser alterado nesse processo — é exatamente o propósito da interface `PaymentProvider`.
5. Criar testes de contrato comparando `MockPaymentProvider` e `GetnetPaymentProvider`.


## Atualização Redis / Arquitetura Assíncrona

Foi adicionada uma camada Redis para estado de pagamentos, idempotência, locks e deduplicação de webhooks, além de uma fila BullMQ para recuperação. Consulte `docs/IMPLEMENTACAO_REDIS_GETNET_CHECKLIST.md`.
