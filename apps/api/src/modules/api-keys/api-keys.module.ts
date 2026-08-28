import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ApiKeysController } from './controllers/api-keys.controller';
import { ApiKeysService } from './services/api-keys.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Gestão de API Keys (JWT + RBAC) e autenticação dual nas rotas de cobrança/clientes.
 * CRUD de chaves continua só com JWT. JwtOrApiKeyGuard é o que as rotas de negócio usam.
 */
@Module({
  imports: [PassportModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyAuthGuard, JwtAuthGuard, JwtOrApiKeyGuard],
  exports: [ApiKeysService, ApiKeyAuthGuard, JwtOrApiKeyGuard],
})
export class ApiKeysModule {}
