import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PaymentProvidersModule } from './integrations/payment-providers/payment-providers.module';
import { HealthModule } from './modules/health/health.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ChargesModule } from './modules/charges/charges.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { QueuesModule } from './infrastructure/queues/queues.module';
import { ProviderWebhooksModule } from './modules/provider-webhooks/provider-webhooks.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule, RedisModule, QueuesModule, AuthModule, PaymentProvidersModule,
    HealthModule, CompaniesModule, CustomersModule, ChargesModule, LedgerModule,
    DashboardModule, AdminModule, ProviderWebhooksModule, ApiKeysModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
