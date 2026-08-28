import { Module } from '@nestjs/common';
import { ApiKeysController } from './controllers/api-keys.controller';
import { ApiKeysService } from './services/api-keys.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { AuthModule } from '../auth/auth.module';

/**
 * Gestão de API Keys (JWT + RBAC) e autenticação dual nas rotas de cobrança/clientes.
 * CRUD de chaves continua só com JWT. JwtOrApiKeyGuard é o que as rotas de negócio usam.
 * AuthModule é reexportado para JwtAuthGuard ficar visível nos módulos de cobrança/clientes.
 */
@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyAuthGuard, JwtOrApiKeyGuard],
  exports: [ApiKeysService, ApiKeyAuthGuard, JwtOrApiKeyGuard, AuthModule],
})
export class ApiKeysModule {}
