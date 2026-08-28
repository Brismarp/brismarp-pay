import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { QueuesModule } from '../../infrastructure/queues/queues.module';

@Module({
  imports: [QueuesModule],
  controllers: [HealthController],
})
export class HealthModule {}
