# Brismar Pay — Documento de Arquitetura (Fase 2)

## 1. Decisão de Stack: Next.js único vs. Frontend + Backend separados

**Decisão: separar Frontend (Next.js) e Backend (NestJS) em aplicações distintas dentro de um monorepo.**

### Por que não usar Next.js com API Routes/Server Actions como backend único

Para uma aplicação de conteúdo/CRUD simples, Next.js full-stack seria suficiente e mais simples operacionalmente. Para um **gateway de pagamentos**, os seguintes requisitos pesam contra isso:

| Requisito | Por que exige backend dedicado |
|---|---|
| **Processamento assíncrono de webhooks** (retry, dead-letter, backoff) | Precisa de workers de fila (BullMQ) rodando continuamente, não apenas em resposta a requisição HTTP — Next.js serverless/edge não sustenta workers de longa duração |
| **Isolamento de domínio financeiro** | Regras de ledger, idempotência e RBAC precisam de um núcleo testável isoladamente de UI, sem acoplamento a componentes React |
| **Escalonamento independente** | Em pico de tráfego, o dashboard (leitura) e a API de cobrança (escrita financeira crítica) têm perfis de carga diferentes — escalar juntos desperdiça recursos |
| **Área administrativa com isolamento de rede** | O backoffice precisa poder ficar atrás de controles de acesso adicionais (VPN/IP allowlist), separado do app público |
| **Futuro consumo por API pública de terceiros** | Clientes vão integrar diretamente com a API — ela precisa existir como serviço HTTP versionado, independente do frontend |

**Decisão final:**
- `apps/web` — Next.js (React 19, App Router): dashboard do lojista, onboarding, login. Consome a API via HTTP, não acessa banco diretamente.
- `apps/api` — NestJS: toda regra de negócio, autenticação, autorização, domínio financeiro, webhooks, API pública.
- Comunicação: REST JSON, autenticação via JWT (cookies HttpOnly para o web app; Bearer token para API pública/integrações de terceiros).

Esta decisão é revisável — documentada aqui conforme regra 35 do escopo.

## 2. Stack completa

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind | Exigido no escopo; SSR bom para dashboard autenticado |
| Backend | NestJS + TypeScript | Estrutura modular nativa, DI, guards, interceptors — mapeia diretamente para Clean Architecture |
| Banco | PostgreSQL | Exigido no escopo; suporta RLS para isolamento de tenant |
| ORM | Prisma | Migrations versionadas, tipagem forte ponta a ponta |
| Cache/Filas | Redis + BullMQ | Processamento assíncrono de webhooks/notificações |
| Autenticação | JWT (access curto + refresh rotativo) + bcrypt | Sem dependência de provedor externo na v1 |
| Containerização | Docker + Docker Compose | Exigido no escopo |

## 3. Separação de camadas (Clean Architecture) — `apps/api`

```
src/
  modules/<domain>/
    controllers/   -> HTTP, DTO validation, nunca lógica de negócio
    services/       -> orquestração de use cases
    use-cases/       -> regra de negócio pura, testável sem HTTP/DB
    entities/         -> modelos de domínio
    dtos/
    guards/
  integrations/payment-providers/
    payment-provider.interface.ts   -> contrato (port)
    mock-payment.provider.ts         -> implementação atual
    getnet/getnet-payment.provider.ts -> adaptador estrutural, sem credenciais ainda
  infrastructure/queues/
    payment-recovery.queue.ts        -> produtor BullMQ + métricas
  workers/
    payment-recovery.worker.ts       -> processo dedicado de recuperação/conciliação
  shared/
  prisma/
```

## 4. Abstração de Payment Provider (preparação para Getnet — Regras 6, 9, 31)

Interface `PaymentProvider` definida em `apps/api/src/integrations/payment-providers/payment-provider.interface.ts`, com métodos: `createPayment`, `getPayment`, `cancelPayment`, `refundPayment`, `capturePayment`, `createCustomer`, `processWebhook`.

Implementação ativa hoje: `MockPaymentProvider` — simula aprovação/negação de forma determinística para permitir desenvolvimento e testes de todo o fluxo de cobrança sem depender de nenhuma credencial externa.

**O que falta explicitamente para a Getnet (documentado por transparência — regra 32):**
- Autenticação real (OAuth2 client_credentials) — endpoint e formato não confirmados nesta etapa.
- Mapeamento exato de status Getnet → status internos (`PENDING`, `APPROVED`, etc.).
- Formato real de payload de webhook e método de validação de assinatura.
- Parâmetros exatos de criação de cobrança PIX/cartão.

O serviço `getnet-auth.service.ts` já implementa o fluxo genérico OAuth `client_credentials`, Basic Auth, cache do token no Redis e renovação antecipada. Ele permanece desativado sem credenciais e URL de token. Quando o contrato Pix for confirmado, o trabalho restante será preencher os paths/payloads oficiais em `GetnetPaymentProvider`, validar webhook e status, sem tocar no código de domínio/use-case.

## 5. Processamento assíncrono e operação

A API HTTP registra a intenção e retorna sem manter o navegador preso à confirmação externa. O produtor BullMQ agenda recuperações em `payment-recovery`; o processo `worker:recovery` consome esses jobs, consulta o provider, aplica a mesma transição centralizada e executa conciliação periódica. O Docker Compose mantém `api` e `worker` como serviços independentes, compartilhando PostgreSQL e Redis, sem expor porta HTTP para o worker.

A janela de expiração de PIX/Boleto é configurável por `PAYMENT_EXPIRATION_MINUTES`, o estado/cache tem TTL configurável por `PAYMENT_STATE_TTL_SECONDS` e as filas são observáveis em `GET /v1/health/queues`. O lock distribuído usa token de proprietário e remoção condicional por Lua para não apagar o lock de outra requisição após expiração.

## 6. Ledger financeiro (Regra 11)

Saldo nunca é um campo editável diretamente. Modelo:

- `LedgerEntry`: todo evento financeiro (crédito, débito, taxa, estorno, chargeback) é uma linha imutável, com `balance_after` calculado no momento da inserção.
- `Balance` (view materializada / campo calculado): saldo disponível e pendente derivados da soma de `LedgerEntry`, nunca escrito diretamente por requisição HTTP.
- Toda escrita em `LedgerEntry` passa por um `LedgerService.append()` único, dentro de transação de banco, garantindo que não existe caminho de código que altere saldo sem gerar rastro.

## 7. Isolamento multi-tenant (Regra: "não misturar dados entre empresas")

- Toda tabela de negócio tem `company_id`.
- Todo repositório de acesso a dados no backend recebe o `company_id` do usuário autenticado via `CompanyContext` (extraído do JWT) e o aplica automaticamente — nenhuma query de módulo de negócio aceita `company_id` vindo do body/query da requisição.
- Área administrativa é o único lugar que pode consultar entre tenants, e exige role `platform_admin`, nunca role de empresa.

## 8. Status desta entrega

Este documento cobre a fundação do monorepo, o domínio de pagamentos, o Redis/BullMQ e a operação assíncrona. A entrega atual contém: monorepo inicializado, schema Prisma completo, módulo de autenticação funcional, abstração de provider com Mock e adaptador Getnet estrutural, Docker Compose com Postgres + Redis + API + worker, expiração configurável, conciliação periódica, métricas da fila, `.env.example` e testes unitários cobrindo Redis, idempotência, webhook, recuperação e ledger.

**Ainda não incluído nesta entrega:** autenticação OAuth real da Getnet, endpoints e payloads oficiais, criação/consulta Pix reais, validação oficial de assinatura do webhook, mapeamento definitivo de status, homologação, métricas externas/APM, CI/CD e execução comprovada dos E2E contra infraestrutura real. O teste E2E agora exige `TEST_DATABASE_URL` e `TEST_REDIS_URL` e é pulado quando a infraestrutura não está disponível.
