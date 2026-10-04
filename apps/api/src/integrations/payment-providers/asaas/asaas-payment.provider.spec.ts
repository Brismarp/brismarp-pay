import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AsaasPaymentProvider } from './asaas-payment.provider';

describe('AsaasPaymentProvider', () => {
  const provider = new AsaasPaymentProvider();
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ASAAS_API_KEY = '$aact_hmlg_test';
    process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com';
    process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-secret';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('reuses an existing Asaas customer and creates a PIX charge with QR code', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'cus_1' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'pay_1', status: 'PENDING', invoiceUrl: 'https://asaas.test/i/1' }))
      .mockResolvedValueOnce(jsonResponse({ payload: '00020126', encodedImage: 'img' }));

    const result = await provider.createPayment({
      companyId: 'company-1',
      amountCents: 2500,
      currency: 'BRL',
      method: 'PIX',
      customer: { externalId: 'cust-1', name: 'Ana', document: '249.715.637-92' },
      idempotencyKey: 'idem-1',
    });

    expect(result.providerPaymentId).toBe('pay_1');
    expect(result.status).toBe('PENDING');
    expect(result.raw.checkout).toEqual({
      pixCopyPaste: '00020126',
      pixQrCodeImage: 'img',
      invoiceUrl: 'https://asaas.test/i/1',
      bankSlipUrl: undefined,
    });

    const customerUrl = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(customerUrl).toContain('cpfCnpj=24971563792');
    const createInit = (global.fetch as jest.Mock).mock.calls[1][1];
    expect(JSON.parse(createInit.body)).toEqual(expect.objectContaining({
      customer: 'cus_1',
      billingType: 'PIX',
      value: 25,
      externalReference: 'idem-1',
    }));
    expect(createInit.headers.access_token).toBe('$aact_hmlg_test');
  });

  it('rejects webhooks without the configured access token', async () => {
    await expect(provider.processWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }, {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a signed Asaas webhook and maps RECEIVED to APPROVED', async () => {
    const result = await provider.processWebhook(
      { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED' } },
      { 'asaas-access-token': 'webhook-secret' },
    );
    expect(result.providerPaymentId).toBe('pay_1');
    expect(result.newStatus).toBe('APPROVED');
    expect(result.signatureValid).toBe(true);
  });

  it('does not downgrade a paid charge on PAYMENT_UPDATED', async () => {
    const result = await provider.processWebhook(
      { id: 'evt_2', event: 'PAYMENT_UPDATED', payment: { id: 'pay_1', status: 'RECEIVED' } },
      { 'asaas-access-token': 'webhook-secret' },
    );
    expect(result.newStatus).toBe('APPROVED');
  });

  it('surfaces Asaas validation errors', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ errors: [{ description: 'CPF inválido' }] }, 400));
    await expect(provider.createCustomer({ name: 'Ana', document: '000' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}
