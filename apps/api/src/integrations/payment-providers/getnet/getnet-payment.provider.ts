import { Injectable, BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { GetnetAuthService } from './getnet-auth.service';
import { PaymentProvider, CreatePaymentInput, ProviderPaymentResult, RefundInput, WebhookProcessingResult } from '../payment-provider.interface';
import { extractGetnetStatus, extractProviderPaymentId } from './getnet-status.mapper';

@Injectable()
export class GetnetPaymentProvider implements PaymentProvider {
  readonly name = 'getnet';

  constructor(private readonly auth: GetnetAuthService) {}

  async createPayment(input: CreatePaymentInput): Promise<ProviderPaymentResult> {
    const payload = {
      amount: input.amountCents,
      currency: input.currency,
      method: input.method,
      installments: input.installments ?? 1,
      customer: input.customer,
      reference_id: input.idempotencyKey,
      metadata: input.metadata,
    };
    const response = await this.requestJson(this.requiredPath('GETNET_PIX_CREATE_PATH'), 'POST', payload, {
      'Idempotency-Key': input.idempotencyKey,
      'x-seller-id': this.requiredEnv('GETNET_SELLER_ID'),
    });
    return this.normalizePayment(response);
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPaymentResult> {
    const path = this.requiredPath('GETNET_PIX_GET_PATH').replace(':id', encodeURIComponent(providerPaymentId));
    return this.normalizePayment(await this.requestJson(path, 'GET'));
  }

  async cancelPayment(providerPaymentId: string): Promise<void> {
    const path = this.requiredPath('GETNET_PIX_CANCEL_PATH').replace(':id', encodeURIComponent(providerPaymentId));
    await this.requestJson(path, 'POST');
  }

  async refundPayment(input: RefundInput): Promise<void> {
    const path = this.requiredPath('GETNET_PIX_REFUND_PATH').replace(':id', encodeURIComponent(input.providerPaymentId));
    await this.requestJson(path, 'POST', { amount: input.amountCents, reason: input.reason });
  }

  async capturePayment(providerPaymentId: string): Promise<ProviderPaymentResult> {
    const path = this.requiredPath('GETNET_PIX_CAPTURE_PATH').replace(':id', encodeURIComponent(providerPaymentId));
    return this.normalizePayment(await this.requestJson(path, 'POST'));
  }

  async createCustomer(_input: { name: string; document: string; email?: string }): Promise<{ providerCustomerId: string }> {
    throw new ServiceUnavailableException('Cadastro de cliente Getnet depende do produto contratado e não foi habilitado.');
  }

  async processWebhook(rawPayload: unknown, headers: Record<string, string>): Promise<WebhookProcessingResult> {
    const payload = this.asObject(rawPayload);
    const signatureValid = this.validateWebhook(headers, JSON.stringify(payload));
    if (!signatureValid) throw new UnauthorizedException('Webhook Getnet rejeitado por falha de autenticidade.');
    const providerPaymentId = extractProviderPaymentId(payload);
    const eventType = String(payload.event_type ?? payload.eventType ?? payload.type ?? 'payment.updated');
    return {
      eventType,
      providerPaymentId,
      newStatus: extractGetnetStatus(payload),
      raw: payload,
      signatureValid,
    };
  }

  private async requestJson(path: string, method: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const token = await this.auth.getAccessToken();
    const baseUrl = this.requiredEnv('GETNET_BASE_URL').replace(/\/$/, '');
    const timeoutMs = this.getTimeoutMs();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/${path.replace(/^\//, '')}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', ...extraHeaders },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await response.text();
        let parsed: unknown = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { rawResponse: text }; }
        if (response.ok) return this.asObject(parsed);
        if (response.status >= 400 && response.status < 500) throw new BadRequestException(`Getnet recusou a operação (HTTP ${response.status}).`);
        lastError = new ServiceUnavailableException(`Getnet indisponível (HTTP ${response.status}).`);
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        lastError = error;
      } finally { clearTimeout(timeout); }
    }
    throw new ServiceUnavailableException(lastError instanceof Error ? lastError.message : 'Getnet indisponível após tentativas limitadas.');
  }

  private normalizePayment(payload: Record<string, unknown>): ProviderPaymentResult {
    return { providerPaymentId: extractProviderPaymentId(payload), status: this.statusForResult(payload), raw: payload };
  }

  private statusForResult(payload: Record<string, unknown>): ProviderPaymentResult['status'] {
    const status = extractGetnetStatus(payload);
    switch (status) {
      case 'PENDING': case 'PROCESSING': case 'APPROVED': case 'DECLINED': case 'FAILED':
        return status;
      default:
        return 'FAILED';
    }
  }

  private validateWebhook(headers: Record<string, string>, raw: string): boolean {
    const mode = (process.env.GETNET_WEBHOOK_AUTH_MODE ?? 'token').toLowerCase();
    const secret = process.env.GETNET_WEBHOOK_SECRET;
    if (!secret) return false;
    if (mode === 'hmac') {
      const received = headers['x-signature'] ?? headers['x-getnet-signature'] ?? '';
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    }
    const received = headers.authorization ?? headers.Authorization ?? headers['x-webhook-token'] ?? '';
    const normalized = received.replace(/^Bearer\s+/i, '');
    return normalized.length === secret.length && crypto.timingSafeEqual(Buffer.from(normalized), Buffer.from(secret));
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Payload Getnet inválido.');
    return value as Record<string, unknown>;
  }

  private requiredEnv(name: string): string { const value = process.env[name]; if (!value) throw new ServiceUnavailableException(`Configuração Getnet ausente: ${name}.`); return value; }
  private requiredPath(name: string): string { return this.requiredEnv(name); }
  private getTimeoutMs(): number { const value = Number(process.env.GETNET_TIMEOUT_MS ?? 10000); return Number.isFinite(value) && value >= 1000 ? Math.floor(value) : 10000; }
}
