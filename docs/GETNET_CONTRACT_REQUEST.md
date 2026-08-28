# Informações técnicas a solicitar à Getnet

Este documento deve ser enviado ao atendimento técnico/integrações da Getnet antes de ativar `PAYMENT_PROVIDER=getnet`. A documentação pública confirma a existência da Global API/Single Entry Point, OAuth 2.0, métodos Pix no Brasil e operações de webhook, mas o contrato contratado e o ambiente habilitado precisam ser confirmados.

## 1. Produto e escopo contratado

Solicitar o nome comercial e técnico exato do produto Pix, o identificador do contrato/merchant, o país e a região de processamento, os métodos habilitados e se a integração será pela Global API/Regional API, Payment Link API, Web Checkout ou outra solução. Confirmar se o BrismarPay atuará como merchant próprio, plataforma/marketplace ou facilitador de múltiplos sellers, pois isso pode alterar headers, credenciais, responsabilidade de KYB e modelo de subcontas.

## 2. Ambientes e endpoints

Solicitar a base URL completa de sandbox/homologação, pré-produção e produção; endpoint de OAuth em cada ambiente; endpoint de criação de cobrança Pix; endpoint de consulta; endpoint de cancelamento/expiração quando aplicável; endpoints de configuração e consulta de webhooks; e exigências de DNS, IP allowlist, proxy, TLS ou certificado mútuo. A documentação pública apresenta exemplos em `api-sbx.globalgetnet.com` e referência OpenAPI em `api.pre.globalgetnet.com`; essa diferença deve ser resolvida pela Getnet antes da configuração.

## 3. Credenciais e autorização

Solicitar `client_id`, `client_secret`, `seller_id`/merchant ID, escopos OAuth, tenant/realm quando aplicável, certificado ou chave adicional, forma segura de entrega, política de rotação e prazo de validade. Confirmar se o token deve ser obtido com Basic Auth, qual encoding é exigido, se o corpo usa `grant_type=client_credentials`, a validade indicada por `expires_in`, tolerância de clock skew e limites de requisição. O segredo não deve ser enviado ao frontend nem persistido em texto claro.

## 4. Criação do Pix

Solicitar request/response JSON oficial completo, incluindo valor e unidade monetária, moeda, identificador externo do pedido, chave de idempotência, `seller_id`, descrição, dados do pagador, documento, e-mail, telefone, cidade, validade, expiração, multa/juros/desconto quando suportados, informação de QR Code, código copia-e-cola, `payment_id`, `transaction_id`, `order_id`, `request_id` e demais identificadores. Confirmar se o endpoint é o publicado como `POST /dpm/payments-gwproxy/v2/payments/qrcode/pix` ou outro, e se há necessidade de headers como `x-seller-id`, `x-transaction-channel-entry` e `request_id`.

## 5. Consulta, cancelamento e expiração

Solicitar request/response da consulta por `payment_id`, `order_id` e/ou idempotency key; limites de polling; janela de consistência; códigos HTTP e códigos de erro; status possíveis; transições válidas; procedimento para cancelar antes do pagamento; comportamento após expiração; e se uma cobrança Pix pode ser reaberta ou substituída. Confirmar se o endpoint publicado `GET /dpm/hub-payment-info/v1/payments/info/{payment_id}` vale para Pix e qual variante deve ser usada.

## 6. Webhooks

Solicitar o procedimento de cadastro da URL por ambiente, os eventos Pix habilitados, exemplos reais de payload por evento, nomes e tipos dos campos, headers recebidos, identificador estável do evento, identificadores de pagamento, assinatura ou modo de autenticação, janela de validade de token, IPs de origem, política de retry, backoff, timeout, reenvio manual e ordem de entrega. Confirmar se o endpoint deve responder `204` sempre após persistir o evento, inclusive em duplicidades, e qual comportamento a Getnet espera para payload inválido.

A documentação pública lista métodos de autenticação de webhook Basic Auth, OAuth 2.0 e Bearer/token, além de eventos como `PIX_UPDATED_TRANSACTIONS`, `PENDING_TRANSACTIONS`, `PROCESSING_TRANSACTIONS`, `APPROVED_TRANSACTIONS`, `FAILED_TRANSACTIONS` e `EXPIRED_TRANSACTIONS`. É necessário receber a escolha oficial aplicável ao contrato.

## 7. Mapeamento de status e conciliação

Solicitar uma tabela oficial de status, substatus e códigos de motivo, incluindo criação, pendente, processamento, aprovado, rejeitado, falho, cancelado, expirado, estornado e chargeback. Solicitar também o relatório de liquidação/conciliação, identificadores para cruzamento, horário de corte, timezone, status de liquidação financeira, tratamento de divergências e prazo de retenção dos dados.

## 8. Homologação e critérios de aceite

Solicitar credenciais e massa de testes para criar Pix, consultar, pagar, aguardar, expirar, cancelar, reenviar webhook, enviar eventos duplicados, provocar erros de autenticação, simular timeout e validar indisponibilidade temporária. Definir com a Getnet casos de aceite para QR Code/copia-e-cola, idempotência, consulta, webhooks, retry, assinatura, reconciliação e limites. Somente depois de todos os cenários aprovados o provider deve ser ativado em produção.

## Referências públicas consultadas

1. [Global API / Single Entry Point](https://docs.globalgetnet.com/pt/products/online-payments/regional-api)
2. [Authentication](https://docs.globalgetnet.com/en/products/online-payments/regional-api?doc=first-step-authentication)
3. [Quick Start Guide](https://docs.globalgetnet.com/en/products/online-payments/regional-api?doc=quickstart-guide)
4. [Supported Payment Methods](https://docs.globalgetnet.com/en/products/online-payments/regional-api?doc=first-step-supported-payment-methods)
5. [How Webhooks Work](https://docs.globalgetnet.com/en/products/online-payments/regional-api?doc=webhook-how-it-works)
6. [Global API OpenAPI Reference](https://docs.globalgetnet.com/en/products/online-payments/regional-api/swagger)
