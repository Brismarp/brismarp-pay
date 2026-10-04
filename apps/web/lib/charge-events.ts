import { ChargeEvent } from '@/lib/api-client';

const GENERIC_FAILURE = 'A operadora recusou a cobrança e não enviou um detalhe.';

export function eventMessage(metadata: ChargeEvent['metadata']): string | null {
  const message = metadata?.message?.trim();
  return message ? message : null;
}

export function failureText(message: string | null | undefined): string {
  const trimmed = message?.trim();
  return trimmed ? trimmed : GENERIC_FAILURE;
}

export function eventSourceLabel(source: string): string {
  if (source === 'provider:asaas:error') return 'Recusa da Asaas';
  if (source === 'provider:getnet:error') return 'Recusa da Getnet';
  if (source === 'provider:mock:error') return 'Recusa do simulador';
  if (source === 'provider:asaas') return 'Asaas';
  if (source === 'provider:getnet') return 'Getnet';
  if (source === 'provider:mock') return 'Simulador';
  if (source === 'webhook') return 'Webhook';
  if (source === 'sandbox-simulation') return 'Simulação de sandbox';
  if (source === 'system') return 'Sistema';
  if (source.startsWith('user:')) return 'Você';
  return source;
}
