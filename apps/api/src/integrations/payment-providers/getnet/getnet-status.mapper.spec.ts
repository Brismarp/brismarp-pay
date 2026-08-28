import { extractGetnetStatus, extractProviderPaymentId, mapGetnetStatus } from './getnet-status.mapper';

describe('Getnet status mapper', () => {
  it.each([
    ['PENDING', 'PENDING'], ['PROCESSING', 'PROCESSING'], ['APPROVED', 'APPROVED'],
    ['DECLINED', 'DECLINED'], ['FAILED', 'FAILED'], ['CANCELED', 'CANCELED'], ['EXPIRED', 'EXPIRED'],
    ['PAID', 'APPROVED'], ['CANCELLED', 'CANCELED'],
  ])('maps %s to %s', (input, expected) => expect(mapGetnetStatus(input)).toBe(expected));

  it('does not approve an unknown status', () => expect(mapGetnetStatus('mystery_status')).toBe('PROCESSING'));

  it('extracts status from common provider fields', () => {
    expect(extractGetnetStatus({ payment_status: 'PAID' })).toBe('APPROVED');
  });

  it('requires a stable payment identifier', () => {
    expect(() => extractProviderPaymentId({ status: 'PENDING' })).toThrow('identificador');
  });
});
