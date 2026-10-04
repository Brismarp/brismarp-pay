import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider.interface';
import { MockPaymentProvider } from './mock-payment.provider';
import { GetnetPaymentProvider } from './getnet/getnet-payment.provider';
import { GetnetAuthService } from './getnet/getnet-auth.service';
import { AsaasPaymentProvider } from './asaas/asaas-payment.provider';

function resolvePaymentProvider(
  mock: MockPaymentProvider,
  getnet: GetnetPaymentProvider,
  asaas: AsaasPaymentProvider,
): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
  if (name === 'asaas') return asaas;
  if (name === 'getnet') return getnet;
  return mock;
}

@Module({
  providers: [
    MockPaymentProvider,
    GetnetAuthService,
    GetnetPaymentProvider,
    AsaasPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: resolvePaymentProvider,
      inject: [MockPaymentProvider, GetnetPaymentProvider, AsaasPaymentProvider],
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentProvidersModule {}
