import {
  extractAsaasCheckout,
  extractAsaasPaymentId,
  mapAsaasEventType,
  mapAsaasPaymentStatus,
  toProviderStatus,
} from './asaas-status.mapper';

describe('Asaas status mapper', () => {
  it.each([
    ['PENDING', 'PENDING'],
    ['OVERDUE', 'PENDING'],
    ['RECEIVED', 'APPROVED'],
    ['CONFIRMED', 'APPROVED'],
    ['REFUNDED', 'REFUNDED'],
    ['CHARGEBACK_REQUESTED', 'CHARGEBACK'],
  ])('maps payment status %s to %s', (input, expected) => {
    expect(mapAsaasPaymentStatus(input)).toBe(expected);
  });

  it('does not approve an unknown payment status', () => {
    expect(mapAsaasPaymentStatus('mystery')).toBe('PROCESSING');
  });

  it('maps PAYMENT_RECEIVED to APPROVED', () => {
    expect(mapAsaasEventType('PAYMENT_RECEIVED')).toBe('APPROVED');
  });

  it('extracts payment id from nested webhook payload', () => {
    expect(extractAsaasPaymentId({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_123' } })).toBe('pay_123');
  });

  it('requires a stable payment identifier', () => {
    expect(() => extractAsaasPaymentId({ event: 'PAYMENT_RECEIVED' })).toThrow('identificador');
  });

  it('keeps terminal domain statuses out of create/get result union', () => {
    expect(toProviderStatus('APPROVED')).toBe('APPROVED');
    expect(toProviderStatus('REFUNDED')).toBe('FAILED');
  });

  it('extracts PIX checkout fields', () => {
    expect(
      extractAsaasCheckout({
        invoiceUrl: 'https://asaas.com/i/abc',
        pixQrCode: { payload: '00020126', encodedImage: 'iVBORw0KGgo=' },
      }),
    ).toEqual({
      pixCopyPaste: '00020126',
      pixQrCodeImage: 'iVBORw0KGgo=',
      invoiceUrl: 'https://asaas.com/i/abc',
      bankSlipUrl: undefined,
    });
  });
});
