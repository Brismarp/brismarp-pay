# Operação assíncrona do BrismarPay

## Objetivo

A API HTTP não deve permanecer aguardando a confirmação definitiva de um pagamento externo. Ela registra a cobrança, grava o estado inicial no PostgreSQL e Redis e agenda a recuperação no BullMQ. O processo `worker:recovery` consulta o provider, aplica as transições centralizadas, expira cobranças vencidas e executa conciliação periódica.

## Execução local

Com PostgreSQL e Redis disponíveis, copie `.env.example` para `.env`, mantenha `PAYMENT_PROVIDER=mock` e execute:

```bash
cd apps/api
npm install
npm run prisma:generate
npm run start:dev
```

Em outro terminal, execute o worker:

```bash
cd apps/api
npm run worker:recovery
```

Com Docker Compose, a API e o worker são processos distintos:

```bash
docker compose up --build postgres redis api worker web
```

O worker não expõe porta HTTP. Ele compartilha `DATABASE_URL` e `REDIS_URL` com a API e deve ser escalado separadamente conforme a quantidade de pagamentos pendentes.

## Parâmetros operacionais

| Variável | Padrão | Finalidade |
|---|---:|---|
| `PAYMENT_STATE_TTL_SECONDS` | `86400` | Retenção do estado temporário e chaves de idempotência/webhook no Redis. |
| `PAYMENT_EXPIRATION_MINUTES` | `30` | Janela padrão para PIX/Boleto antes de marcar a cobrança como `EXPIRED`. |
| `RECONCILIATION_BATCH_SIZE` | `100` | Quantidade máxima de cobranças processadas por ciclo. |
| `RECONCILIATION_INTERVAL_MS` | `300000` | Intervalo mínimo do ciclo periódico de conciliação. |
| `RECOVERY_WORKER_CONCURRENCY` | `5` | Número de jobs processados simultaneamente pelo worker. |

Os valores acima são defaults técnicos, não uma política comercial da Getnet. A janela definitiva deve ser compatível com a validade do QR Code/cobrança contratada e com as regras de negócio do BrismarPay.

## Observabilidade

O endpoint `GET /v1/health` verifica PostgreSQL. O endpoint `GET /v1/health/queues` retorna as contagens BullMQ de jobs aguardando, ativos, concluídos, falhos, atrasados e pausados. O worker também registra eventos JSON de inicialização, conclusão, falha e encerramento para integração posterior com logs centralizados ou APM.

## Testes

Os testes unitários cobrem o uso de Redis para JSON/TTL, `SET NX`, release seguro de locks, idempotência, cache de status, deduplicação de webhooks, expiração e recuperação pelo provider. A suíte E2E exige simultaneamente `TEST_DATABASE_URL` e `TEST_REDIS_URL`; quando essas variáveis não existem, ela é pulada de forma intencional.

Exemplo de execução E2E:

```bash
TEST_DATABASE_URL=postgresql://postgres:test@localhost:5433/brismar_pay_test \
TEST_REDIS_URL=redis://localhost:6380 \
JWT_SECRET=test-secret-not-for-production \
npx prisma migrate deploy --schema=../../packages/database/schema.prisma

TEST_DATABASE_URL=postgresql://postgres:test@localhost:5433/brismar_pay_test \
TEST_REDIS_URL=redis://localhost:6380 \
JWT_SECRET=test-secret-not-for-production \
npm run test:e2e -- --runInBand
```

A execução acima deve utilizar banco e Redis descartáveis, nunca ambientes de desenvolvimento compartilhados ou produção.

## Limitações conhecidas

O provider Getnet continua estruturalmente isolado e indisponível até que sejam recebidos produto/API Pix, endpoints, credenciais, escopos, regras de webhook, mapeamento de status e acesso ao ambiente de homologação. A implementação do worker não substitui a conciliação financeira oficial: quando a API Getnet for conectada, será necessário persistir evidências de consulta, tratar divergências e definir o procedimento de exceção antes da entrada em produção.
