import { Injectable, BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import {
  PaymentProvider,
  CreatePaymentInput,
  ProviderPaymentResult,
  RefundInput,
  WebhookProcessingResult,
  PaymentMethodType,
} from '../payment-provider.interface';
import {
  extractAsaasCheckout,
  extractAsaasEventType,
  extractAsaasPaymentId,
  mapAsaasEventType,
  mapAsaasPaymentStatus,
  toProviderStatus,
} from './asaas-status.mapper';

type AsaasObject = Record<string, unknown>;

@Injectable()
export class AsaasPaymentProvider implements PaymentProvider {
  readonly name = 'asaas';

  async createPayment(input: CreatePaymentInput): Promise<ProviderPaymentResult> {
    const customer = await this.ensureCustomer(input.customer);
    const payload: AsaasObject = {
      customer: customer.providerCustomerId,
      billingType: this.billingType(input.method),
      value: this.toReais(input.amountCents),
      dueDate: this.dueDate(),
      description: `Brismar Pay · ${input.idempotencyKey}`,
      externalReference: input.idempotencyKey,
      postalService: false,
    };
    if ((input.installments ?? 1) > 1) {
      const installments = input.installments ?? 1;
      payload.installmentCount = installments;
      payload.totalValue = this.toReais(input.amountCents);
      payload.value = this.toReais(Math.round(input.amountCents / installments));
    }

    const payment = await this.requestJson('/payments', 'POST', payload);
    const pixQrCode = input.method === 'PIX' ? await this.fetchPixQrCode(extractAsaasPaymentId(payment)) : undefined;
    return this.normalizePayment(payment, pixQrCode);
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPaymentResult> {
    return this.normalizePayment(await this.requestJson(`/payments/${encodeURIComponent(providerPaymentId)}`, 'GET'));
  }

  async cancelPayment(providerPaymentId: string): Promise<void> {
    await this.requestJson(`/payments/${encodeURIComponent(providerPaymentId)}`, 'DELETE');
  }

  async refundPayment(input: RefundInput): Promise<void> {
    await this.requestJson(`/payments/${encodeURIComponent(input.providerPaymentId)}/refund`, 'POST', {
      value: this.toReais(input.amountCents),
      description: input.reason ?? 'Estorno Brismar Pay',
    });
  }

  async capturePayment(providerPaymentId: string): Promise<ProviderPaymentResult> {
    return this.getPayment(providerPaymentId);
  }

  async createCustomer(input: { name: string; document: string; email?: string }): Promise<{ providerCustomerId: string }> {
    return this.ensureCustomer({ externalId: input.document, ...input });
  }

  async processWebhook(rawPayload: unknown, headers: Record<string, string>): Promise<WebhookProcessingResult> {
    const payload = this.asObject(rawPayload);
    const signatureValid = this.validateWebhook(headers);
    if (!signatureValid) throw new UnauthorizedException('Webhook Asaas rejeitado por falha de autenticidade.');

    const payment = this.nestedPayment(payload);
    const eventType = extractAsaasEventType(payload);
    const providerPaymentId = extractAsaasPaymentId(payload);
    const preferEvent = [
      'PAYMENT_DELETED',
      'PAYMENT_REFUNDED',
      'PAYMENT_PARTIALLY_REFUNDED',
      'PAYMENT_CHARGEBACK_REQUESTED',
      'PAYMENT_CHARGEBACK_DISPUTE',
      'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
    ].includes(eventType);
    const fromEvent = mapAsaasEventType(eventType);
    const fromPayment = payment.status === undefined ? undefined : mapAsaasPaymentStatus(payment.status);
    const mapped = (preferEvent ? fromEvent : fromPayment) ?? fromEvent ?? fromPayment ?? 'PROCESSING';

    return {
      eventType,
      providerPaymentId,
      newStatus: mapped,
      raw: payload,
      signatureValid,
    };
  }

  private async ensureCustomer(input: {
    externalId: string;
    name: string;
    document: string;
    email?: string;
  }): Promise<{ providerCustomerId: string }> {
    const document = input.document.replace(/\D/g, '');
    const existing = await this.requestJson(
      `/customers?cpfCnpj=${encodeURIComponent(document)}&limit=1`,
      'GET',
    );
    const list = Array.isArray(existing.data) ? existing.data : [];
    const first = list[0];
    if (first && typeof first === 'object' && typeof (first as AsaasObject).id === 'string') {
      return { providerCustomerId: String((first as AsaasObject).id) };
    }

    const created = await this.requestJson('/customers', 'POST', {
      name: input.name,
      cpfCnpj: document,
      email: input.email,
      externalReference: input.externalId,
      notificationDisabled: true,
    });
    const id = created.id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Asaas não retornou o identificador do cliente.');
    }
    return { providerCustomerId: id };
  }

  private async fetchPixQrCode(providerPaymentId: string): Promise<AsaasObject | undefined> {
    try {
      return await this.requestJson(`/payments/${encodeURIComponent(providerPaymentId)}/pixQrCode`, 'GET');
    } catch {
      return undefined;
    }
  }

  private async requestJson(path: string, method: string, body?: unknown): Promise<AsaasObject> {
    const apiKey = this.requiredEnv('ASAAS_API_KEY');
    const baseUrl = this.baseUrl();
    const timeoutMs = this.getTimeoutMs();
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            access_token: apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': this.userAgent(),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await response.text();
        let parsed: unknown = {};
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = { rawResponse: text };
        }
        if (response.ok) return this.asObject(parsed);
        if (response.status === 401) throw new UnauthorizedException('Chave Asaas rejeitada. Confira ASAAS_API_KEY e o ambiente (sandbox vs produção).');
        if (response.status >= 400 && response.status < 500) {
          throw new BadRequestException(this.errorMessage(parsed, response.status));
        }
        lastError = new ServiceUnavailableException(`Asaas indisponível (HTTP ${response.status}).`);
      } catch (error) {
        if (error instanceof BadRequestException || error instanceof UnauthorizedException) throw error;
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new ServiceUnavailableException(lastError instanceof Error ? lastError.message : 'Asaas indisponível após tentativas limitadas.');
  }

  private normalizePayment(payload: AsaasObject, pixQrCode?: AsaasObject): ProviderPaymentResult {
    const domainStatus = mapAsaasPaymentStatus(payload.status);
    const withPix = pixQrCode ? { ...payload, pixQrCode } : payload;
    return {
      providerPaymentId: extractAsaasPaymentId(payload),
      status: toProviderStatus(domainStatus),
      raw: {
        ...withPix,
        checkout: extractAsaasCheckout(withPix),
      },
    };
  }

  private billingType(method: PaymentMethodType): string {
    switch (method) {
      case 'PIX':
        return 'PIX';
      case 'BOLETO':
        return 'BOLETO';
      case 'CREDIT_CARD':
        return 'CREDIT_CARD';
      case 'DEBIT_CARD':
        return 'DEBIT_CARD';
      default:
        throw new BadRequestException(`Método de pagamento não suportado pela Asaas: ${method}.`);
    }
  }

  private validateWebhook(headers: Record<string, string>): boolean {
    const received = this.header(headers, 'asaas-access-token') || this.header(headers, 'access_token');
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected) {
      if (!received || received.length !== expected.length) return false;
      return Buffer.from(received).equals(Buffer.from(expected));
    }
    if (process.env.ALLOW_SANDBOX_WEBHOOK === 'true') return true;
    return false;
  }

  private nestedPayment(payload: AsaasObject): AsaasObject {
    const nested = payload.payment;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) return nested as AsaasObject;
    return payload;
  }

  private errorMessage(parsed: unknown, status: number): string {
    if (parsed && typeof parsed === 'object') {
      const errors = (parsed as AsaasObject).errors;
      if (Array.isArray(errors) && errors[0] && typeof errors[0] === 'object') {
        const description = (errors[0] as AsaasObject).description;
        if (typeof description === 'string' && description.trim()) return description;
      }
    }
    return `Asaas recusou a operação (HTTP ${status}).`;
  }

  private asObject(value: unknown): AsaasObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Payload Asaas inválido.');
    }
    return value as AsaasObject;
  }

  private header(headers: Record<string, string>, name: string): string {
    const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return match?.[1] ?? '';
  }

  private toReais(amountCents: number): number {
    return Number((amountCents / 100).toFixed(2));
  }

  private dueDate(): string {
    const minutes = Number(process.env.PAYMENT_EXPIRATION_MINUTES ?? 30);
    const offsetMs = Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 30 * 60_000;
    return new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
  }

  private baseUrl(): string {
    const configured = (process.env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com').replace(/\/$/, '');
    return configured.endsWith('/v3') ? configured : `${configured}/v3`;
  }

  private userAgent(): string {
    const env = this.baseUrl().includes('sandbox') ? 'sandbox' : 'production';
    return `BrismarPay/0.1 (Node.js; ${env})`;
  }

  private requiredEnv(name: string): string {
    const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
    if (!value) throw new ServiceUnavailableException(`Configuração Asaas ausente: ${name}.`);
    return value;
  }

  private getTimeoutMs(): number {
    const value = Number(process.env.ASAAS_TIMEOUT_MS ?? 10000);
    return Number.isFinite(value) && value >= 1000 ? Math.floor(value) : 10000;
  }
}
