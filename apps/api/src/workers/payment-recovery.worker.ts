import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import { AppModule } from '../app.module';
import { ChargesService } from '../modules/charges/services/charges.service';
import { RedisService } from '../infrastructure/redis/redis.service';
import { PAYMENT_RECOVERY_QUEUE_NAME } from '../infrastructure/queues/payment-recovery.queue';

interface RecoveryJobData {
  chargeId: string;
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: process.env.WORKER_LOG_LEVEL === 'silent' ? false : ['error', 'warn', 'log'],
  });
  const charges = app.get(ChargesService);
  const redis = app.get(RedisService);
  const concurrency = Math.max(1, Number(process.env.RECOVERY_WORKER_CONCURRENCY ?? 5));
  const worker = new Worker<RecoveryJobData>(
    PAYMENT_RECOVERY_QUEUE_NAME,
    async (job: Job<RecoveryJobData>) => charges.recoverPendingCharge(job.data.chargeId),
    { connection: redis.raw, concurrency },
  );

  worker.on('completed', job => {
    console.info(JSON.stringify({ event: 'payment-recovery.completed', jobId: job.id, chargeId: job.data.chargeId }));
  });
  worker.on('failed', (job, error) => {
    console.error(JSON.stringify({ event: 'payment-recovery.failed', jobId: job?.id, chargeId: job?.data.chargeId, error: error.message }));
  });
  worker.on('error', error => {
    console.error(JSON.stringify({ event: 'payment-recovery.worker-error', error: error.message }));
  });

  const reconciliationIntervalMs = Math.max(60_000, Number(process.env.RECONCILIATION_INTERVAL_MS ?? 300_000));
  let reconciling = false;
  const reconciliationTimer = setInterval(async () => {
    if (reconciling) return;
    reconciling = true;
    try {
      const result = await charges.reconcilePendingPayments();
      console.info(JSON.stringify({ event: 'payment-reconciliation.completed', result }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'payment-reconciliation.failed', error: error instanceof Error ? error.message : 'unknown' }));
    } finally {
      reconciling = false;
    }
  }, reconciliationIntervalMs);

  const shutdown = async (signal: string) => {
    console.info(JSON.stringify({ event: 'payment-recovery.shutdown', signal }));
    clearInterval(reconciliationTimer);
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  console.info(JSON.stringify({
    event: 'payment-recovery.started',
    queue: PAYMENT_RECOVERY_QUEUE_NAME,
    concurrency,
    reconciliationIntervalMs,
  }));
}

bootstrap().catch(error => {
  console.error(JSON.stringify({ event: 'payment-recovery.bootstrap-failed', error: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
});
