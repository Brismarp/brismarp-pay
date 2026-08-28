import { Module } from '@nestjs/common';
import { ApiKeysController } from './controllers/api-keys.controller';
import { ApiKeysService } from './services/api-keys.service';

/**
 * Gestão de API Keys (JWT + RBAC). O módulo está registrado em app.module.ts.
 * ApiKeyAuthGuard autentica X-Api-Key / Bearer, mas ainda não protege as rotas
 * públicas de cobrança/clientes — ver docs/FASE_7_API_TODO.md.
 */
@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
