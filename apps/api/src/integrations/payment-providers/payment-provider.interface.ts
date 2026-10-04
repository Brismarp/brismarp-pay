/**
 * Contrato que qualquer adquirente/processador precisa implementar para se conectar
 * ao domínio financeiro da Brismar Pay.
 *
 * Regra de arquitetura: NENHUM código de domínio (use-cases, services de cobrança,
 * ledger) pode importar um provider concreto (ex: GetnetPaymentProvider) diretamente.
 * Toda referência é feita através desta interface, injetada via token PAYMENT_PROVIDER.
 *
 * Providers concretos (mock, asaas, getnet) implementam esta mesma interface.
 * Trocar o processador é PAYMENT_PROVIDER no ambiente — o domínio de cobrança/ledger não muda.
 */

export type PaymentMethodType = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO';

export interface CreatePaymentInput {
  companyId: string;
  amountCents: number;
  currency: 'BRL';
  method: PaymentMethodType;
  installments?: number;
  customer: {
    externalId: string;
    name: string;
    document: string;
    email?: string;
  };
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderPaymentResult {
  providerPaymentId: string;
  status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'DECLINED' | 'FAILED';
  raw: Record<string, unknown>; // payload bruto do provider, para auditoria/debug
}

export interface RefundInput {
  providerPaymentId: string;
  amountCents: number;
  reason?: string;
}

export interface WebhookProcessingResult {
  eventType: string;
  providerPaymentId: string;
  newStatus: ProviderPaymentResult['status'] | 'CANCELED' | 'EXPIRED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CHARGEBACK';
  raw: Record<string, unknown>;
  /** Resultado da validação feita pelo adaptador concreto. */
  signatureValid?: boolean;
}

export interface PaymentProvider {
  readonly name: string;

  createPayment(input: CreatePaymentInput): Promise<ProviderPaymentResult>;
  getPayment(providerPaymentId: string): Promise<ProviderPaymentResult>;
  cancelPayment(providerPaymentId: string): Promise<void>;
  refundPayment(input: RefundInput): Promise<void>;
  capturePayment(providerPaymentId: string): Promise<ProviderPaymentResult>;
  createCustomer(input: { name: string; document: string; email?: string }): Promise<{ providerCustomerId: string }>;

  /**
   * Recebe o payload bruto de um webhook do provider, valida assinatura/autenticidade
   * e retorna um resultado normalizado. A validação de assinatura é responsabilidade
   * de CADA provider concreto, pois o formato varia entre adquirentes.
   */
  processWebhook(rawPayload: unknown, headers: Record<string, string>): Promise<WebhookProcessingResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
