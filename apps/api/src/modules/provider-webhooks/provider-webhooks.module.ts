import { Module } from '@nestjs/common';
import { ProviderWebhooksController } from './provider-webhooks.controller';
import { ChargesModule } from '../charges/charges.module';
import { PaymentProvidersModule } from '../../integrations/payment-providers/payment-providers.module';

@Module({
  imports: [ChargesModule, PaymentProvidersModule],
  controllers: [ProviderWebhooksController],
})
export class ProviderWebhooksModule {}
