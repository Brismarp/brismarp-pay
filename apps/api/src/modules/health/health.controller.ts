import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentRecoveryQueue } from '../../infrastructure/queues/payment-recovery.queue';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recoveryQueue: PaymentRecoveryQueue,
  ) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected',
        provider: process.env.PAYMENT_PROVIDER ?? 'mock',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'degraded',
        database: 'unreachable',
        provider: process.env.PAYMENT_PROVIDER ?? 'mock',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('queues')
  async queues() {
    try {
      return { status: 'ok', queue: await this.recoveryQueue.metrics(), timestamp: new Date().toISOString() };
    } catch {
      return { status: 'degraded', queue: 'unreachable', timestamp: new Date().toISOString() };
    }
  }
}
