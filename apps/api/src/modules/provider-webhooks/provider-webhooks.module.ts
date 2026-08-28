import { Module } from '@nestjs/common';
import { ProviderWebhooksController } from './provider-webhooks.controller';
import { ChargesModule } from '../charges/charges.module';
@Module({ imports:[ChargesModule], controllers:[ProviderWebhooksController] })
export class ProviderWebhooksModule {}
