import { ChargeStatus } from '@prisma/client';
import { ProviderPaymentResult } from '../payment-provider.interface';

/**
 * Status Asaas → domínio Brismar Pay.
 * Status desconhecido nunca vira APPROVED.
 */
const PAYMENT_STATUS_MAP: Record<string, ChargeStatus> = {
  PENDING: 'PENDING',
  OVERDUE: 'PENDING',
  AWAITING_RISK_ANALYSIS: 'PROCESSING',
  RECEIVED: 'APPROVED',
  CONFIRMED: 'APPROVED',
  RECEIVED_IN_CASH: 'APPROVED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUND_REQUESTED: 'APPROVED',
  REFUND_IN_PROGRESS: 'APPROVED',
  CHARGEBACK_REQUESTED: 'CHARGEBACK',
  CHARGEBACK_DISPUTE: 'CHARGEBACK',
  AWAITING_CHARGEBACK_REVERSAL: 'CHARGEBACK',
  DUNNING_REQUESTED: 'PENDING',
  DUNNING_RECEIVED: 'PENDING',
};

const EVENT_STATUS_MAP: Record<string, ChargeStatus> = {
  PAYMENT_CREATED: 'PENDING',
  PAYMENT_UPDATED: 'PENDING',
  PAYMENT_CONFIRMED: 'APPROVED',
  PAYMENT_RECEIVED: 'APPROVED',
  PAYMENT_OVERDUE: 'PENDING',
  PAYMENT_DELETED: 'CANCELED',
  PAYMENT_RESTORED: 'PENDING',
  PAYMENT_REFUNDED: 'REFUNDED',
  PAYMENT_PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
  PAYMENT_CHARGEBACK_DISPUTE: 'CHARGEBACK',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'CHARGEBACK',
  PAYMENT_AWAITING_RISK_ANALYSIS: 'PROCESSING',
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: 'APPROVED',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'DECLINED',
};

export function mapAsaasPaymentStatus(status: unknown): ChargeStatus {
  const normalized = String(status ?? '').trim().toUpperCase();
  return PAYMENT_STATUS_MAP[normalized] ?? 'PROCESSING';
}

export function mapAsaasEventType(eventType: unknown): ChargeStatus | undefined {
  const normalized = String(eventType ?? '').trim().toUpperCase();
  return EVENT_STATUS_MAP[normalized];
}

export function toProviderStatus(status: ChargeStatus): ProviderPaymentResult['status'] {
  switch (status) {
    case 'PENDING':
    case 'PROCESSING':
    case 'APPROVED':
    case 'DECLINED':
    case 'FAILED':
      return status;
    default:
      return 'FAILED';
  }
}

export function extractAsaasPaymentId(payload: Record<string, unknown>): string {
  const nested = payload.payment;
  const fromNested =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>).id
      : undefined;
  const topLevelId = payload.event ? undefined : payload.id;
  const candidate = fromNested ?? payload.paymentId ?? topLevelId;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('Resposta Asaas sem identificador de pagamento.');
  }
  return candidate.trim();
}

export function extractAsaasEventType(payload: Record<string, unknown>): string {
  const event = payload.event ?? payload.eventType ?? payload.type ?? 'PAYMENT_UPDATED';
  return String(event);
}

export function extractAsaasCheckout(payload: Record<string, unknown>) {
  const pix = payload.pixQrCode;
  const pixObject = pix && typeof pix === 'object' && !Array.isArray(pix) ? (pix as Record<string, unknown>) : {};
  const checkout = {
    pixCopyPaste: typeof pixObject.payload === 'string' ? pixObject.payload : undefined,
    pixQrCodeImage: typeof pixObject.encodedImage === 'string' ? pixObject.encodedImage : undefined,
    invoiceUrl: typeof payload.invoiceUrl === 'string' ? payload.invoiceUrl : undefined,
    bankSlipUrl: typeof payload.bankSlipUrl === 'string' ? payload.bankSlipUrl : undefined,
  };
  if (!checkout.pixCopyPaste && !checkout.pixQrCodeImage && !checkout.invoiceUrl && !checkout.bankSlipUrl) {
    return undefined;
  }
  return checkout;
}
