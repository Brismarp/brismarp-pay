import { ChargeStatus } from '@prisma/client';

/**
 * Mapeamento deliberadamente explícito. Status desconhecidos nunca são tratados
 * como aprovação; permanecem em PROCESSING para consulta/revisão posterior.
 */
const STATUS_MAP: Record<string, ChargeStatus> = {
  PENDING: 'PENDING',
  CREATED: 'PENDING',
  PROCESSING: 'PROCESSING',
  IN_PROGRESS: 'PROCESSING',
  APPROVED: 'APPROVED',
  PAID: 'APPROVED',
  COMPLETED: 'APPROVED',
  DECLINED: 'DECLINED',
  DENIED: 'DECLINED',
  FAILED: 'FAILED',
  ERROR: 'FAILED',
  CANCELED: 'CANCELED',
  CANCELLED: 'CANCELED',
  EXPIRED: 'EXPIRED',
};

export function mapGetnetStatus(status: unknown): ChargeStatus {
  const normalized = String(status ?? '').trim().toUpperCase();
  return STATUS_MAP[normalized] ?? 'PROCESSING';
}

export function extractGetnetStatus(payload: Record<string, unknown>): ChargeStatus {
  return mapGetnetStatus(payload.status ?? payload.paymentStatus ?? payload.payment_status ?? payload.state);
}

export function extractProviderPaymentId(payload: Record<string, unknown>): string {
  const candidate = payload.payment_id ?? payload.paymentId ?? payload.transaction_id ?? payload.transactionId ?? payload.id;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('Resposta Getnet sem identificador de pagamento.');
  }
  return candidate.trim();
}
