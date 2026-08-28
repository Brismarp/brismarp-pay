import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { MockPaymentProvider } from './mock-payment.provider';
import { GetnetPaymentProvider } from './getnet/getnet-payment.provider';
import { GetnetAuthService } from './getnet/getnet-auth.service';

@Module({
  providers: [
    MockPaymentProvider,
    GetnetAuthService,
    GetnetPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (mock: MockPaymentProvider, getnet: GetnetPaymentProvider) =>
        (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase() === 'getnet' ? getnet : mock,
      inject: [MockPaymentProvider, GetnetPaymentProvider],
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentProvidersModule {}
