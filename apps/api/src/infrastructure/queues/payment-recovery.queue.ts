import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export const PAYMENT_RECOVERY_QUEUE_NAME = 'payment-recovery';

@Injectable()
export class PaymentRecoveryQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(redis: RedisService) {
    this.queue = new Queue(PAYMENT_RECOVERY_QUEUE_NAME, { connection: redis.raw });
  }

  async schedule(chargeId: string, delayMs = 60_000) {
    await this.queue.add('recover', { chargeId }, {
      jobId: `recover-${chargeId}`,
      delay: delayMs,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async metrics() {
    const counts = await this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    return {
      name: PAYMENT_RECOVERY_QUEUE_NAME,
      ...counts,
      timestamp: new Date().toISOString(),
    };
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
