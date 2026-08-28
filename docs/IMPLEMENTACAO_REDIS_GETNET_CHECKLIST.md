# Checklist de implementação Redis / Getnet — estado auditado

## Implementado e validado nesta rodada

- [x] Redis integrado como serviço global da API.
- [x] Redis utilizado para estado temporário de pagamentos.
- [x] Redis utilizado para idempotência por empresa e chave de pagamento.
- [x] Lock distribuído com `SET NX` e release condicionado ao token proprietário.
- [x] Compra persistida no PostgreSQL antes da chamada ao provider.
- [x] Estado inicial `PROCESSING` registrado antes da integração externa.
- [x] Endpoint de consulta de status: `GET /companies/:companyId/charges/:chargeId/status`.
- [x] Reload da página pode recuperar o estado pelo `chargeId/paymentId`.
- [x] Atualização do cache Redis após transição de status, fora da transação do banco.
- [x] BullMQ adicionado para recuperação assíncrona de pagamentos pendentes.
- [x] Fila de recuperação com retry e backoff exponencial.
- [x] Worker separado em processo/container próprio (`npm run worker:recovery`).
- [x] Endpoint de webhook preparado em `POST /v1/webhooks/getnet`.
- [x] Deduplicação de eventos de webhook com Redis.
- [x] Transição de status centralizada para evitar duplicação de lógica.
- [x] Liquidação no ledger mantida para transições para `APPROVED`.
- [x] Provider Getnet criado como adaptador estrutural isolado.
- [x] Seleção de provider por `PAYMENT_PROVIDER`.
- [x] Provider mock mantido como padrão para desenvolvimento.
- [x] Variáveis de ambiente atualizadas para Redis, expiração, worker e seleção de provider.
- [x] Política técnica configurável de expiração para PIX/Boleto usando `expiresAt` e status `EXPIRED`.
- [x] Rotina de recuperação individual consulta o provider e reaplica a transição centralizada.
- [x] Rotina periódica de conciliação no worker para pendências e expirações.
- [x] Métricas básicas da fila em `GET /v1/health/queues`.
- [x] Logs JSON básicos do worker para início, conclusão e falha.
- [x] Serviço OAuth genérico preparado com `client_credentials`, Basic Auth, cache Redis e renovação antecipada.
- [x] Testes específicos de Redis: JSON com TTL, `SET NX`, release seguro de lock e encerramento.
- [x] Testes de idempotência, cache de status, deduplicação de webhook, expiração e recuperação.
- [x] Persistência de `IncomingWebhookEvent` com payload bruto, chave idempotente e estado processado.
- [x] Suíte unitária verde: 8 suítes e 53 testes aprovados.
- [x] Build NestJS aprovado.
- [x] Suíte E2E preparada para exigir PostgreSQL + Redis reais e validar consulta de status; sem essas variáveis, é pulada intencionalmente.

## Pendente — depende da Getnet

- [ ] Confirmar qual produto/API Pix foi contratado e quais operações estão habilitadas.
- [ ] Inserir endpoints oficiais de sandbox/homologação e produção.
- [ ] Validar e ativar o fluxo OAuth com credenciais, escopos, endpoints e certificados reais do contrato.
- [ ] Implementar criação real da cobrança Pix e persistir QR Code/copia-e-cola conforme payload oficial.
- [ ] Implementar consulta real de pagamento e regras de retry/limite.
- [ ] Implementar validação oficial de assinatura/autenticidade do webhook.
- [ ] Mapear payloads e status oficiais para o domínio BrismarPay.
- [ ] Realizar homologação com casos de aprovação, expiração, rejeição, duplicidade, reenvio e indisponibilidade.

## Pendente — endurecimento de produção

- [ ] Substituir métricas básicas por métricas persistentes/externas e alertas de fila, latência, erro e backlog.
- [ ] Definir formalmente a expiração com base no contrato e na validade real do QR Code.
- [ ] Implementar conciliação oficial com persistência de evidência, divergências e reprocessamento controlado.
- [ ] Persistir `IncomingWebhookEvent` com payload bruto, assinatura válida e estado de processamento quando o contrato Getnet for conhecido.
- [ ] Executar E2E contra Postgres e Redis descartáveis em CI.
- [ ] Revisar TTL e retenção com base em RPO/RTO, auditoria e regras de negócio.
- [ ] Adicionar CI/CD, secret manager, rotação de credenciais e observabilidade distribuída.

## Como executar

1. Copie `.env.example` para `.env`.
2. Mantenha `PAYMENT_PROVIDER=mock` até a homologação da Getnet.
3. Suba Redis e PostgreSQL com `docker compose up -d redis postgres`.
4. Instale dependências, gere o Prisma Client e aplique as migrations.
5. Inicie a API com `npm run start:dev` e o worker com `npm run worker:recovery` — ou use `docker compose up --build`.
6. Verifique `GET /v1/health` e `GET /v1/health/queues`.

## Observação importante

A integração Getnet não foi inventada nem simulada. O provider foi isolado e preparado estruturalmente, mas a comunicação real permanece bloqueada até que o produto/API Pix, credenciais, endpoints, escopos e formato oficial de webhook sejam confirmados.
