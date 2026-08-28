import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PaymentProvider,
  CreatePaymentInput,
  ProviderPaymentResult,
  RefundInput,
  WebhookProcessingResult,
} from './payment-provider.interface';

/**
 * Provider de desenvolvimento/sandbox interno.
 *
 * Não se comunica com nenhum serviço externo. Simula de forma determinística:
 * - PIX: sempre criado como PENDING (aguardando "pagamento" simulado via endpoint de teste).
 * - Cartão: aprovado automaticamente, exceto quando o valor termina em centavos "00" acima
 *   de R$ 10.000,00 — usado para exercitar o fluxo de DECLINED em testes.
 *
 * Isto NÃO é a integração Getnet. Serve exclusivamente para permitir o desenvolvimento
 * e teste de todo o fluxo de cobrança/ledger/webhook antes da credencial real existir.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createPayment(input: CreatePaymentInput): Promise<ProviderPaymentResult> {
    const providerPaymentId = `mock_${crypto.randomUUID()}`;

    if (input.method === 'PIX' || input.method === 'BOLETO') {
      return {
        providerPaymentId,
        status: 'PENDING',
        raw: { simulated: true, method: input.method },
      };
    }

    const simulateDecline = input.amountCents > 1_000_000; // > R$10.000,00
    return {
      providerPaymentId,
      status: simulateDecline ? 'DECLINED' : 'APPROVED',
      raw: { simulated: true, method: input.method, installments: input.installments ?? 1 },
    };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPaymentResult> {
    return { providerPaymentId, status: 'APPROVED', raw: { simulated: true } };
  }

  async cancelPayment(_providerPaymentId: string): Promise<void> {
    return;
  }

  async refundPayment(_input: RefundInput): Promise<void> {
    return;
  }

  async capturePayment(providerPaymentId: string): Promise<ProviderPaymentResult> {
    return { providerPaymentId, status: 'APPROVED', raw: { simulated: true } };
  }

  async createCustomer(input: { name: string; document: string }): Promise<{ providerCustomerId: string }> {
    return { providerCustomerId: `mock_cust_${crypto.randomUUID()}` };
  }

  async processWebhook(
    rawPayload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookProcessingResult> {
    const payload = rawPayload as { providerPaymentId: string; event: string };
    return {
      eventType: payload.event,
      providerPaymentId: payload.providerPaymentId,
      newStatus: 'APPROVED',
      raw: payload,
    };
  }
}
