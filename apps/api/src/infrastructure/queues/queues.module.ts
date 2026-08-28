import { Module } from '@nestjs/common';
import { PaymentRecoveryQueue } from './payment-recovery.queue';
@Module({ providers: [PaymentRecoveryQueue], exports: [PaymentRecoveryQueue] })
export class QueuesModule {}
