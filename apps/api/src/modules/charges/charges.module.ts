import { Module } from '@nestjs/common';
import { ChargesController } from './controllers/charges.controller';
import { ChargesService } from './services/charges.service';
import { LedgerModule } from '../ledger/ledger.module';
import { PaymentProvidersModule } from '../../integrations/payment-providers/payment-providers.module';
import { QueuesModule } from '../../infrastructure/queues/queues.module';

@Module({
  imports: [LedgerModule, PaymentProvidersModule, QueuesModule],
  controllers: [ChargesController],
  providers: [ChargesService],
  exports: [ChargesService],
})
export class ChargesModule {}
