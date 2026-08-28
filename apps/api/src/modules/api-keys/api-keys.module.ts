import { Module } from '@nestjs/common';
import { ApiKeysController } from './controllers/api-keys.controller';
import { ApiKeysService } from './services/api-keys.service';

/**
 * SCAFFOLD — módulo criado e pronto, mas intencionalmente NÃO importado em
 * app.module.ts, para não expor endpoints que hoje lançam erro (ApiKeysService
 * ainda não implementado).
 *
 * Para habilitar quando a lógica estiver pronta:
 *   1. Implementar os métodos de ApiKeysService (ver TODOs no arquivo).
 *   2. Importar `ApiKeysModule` em `app.module.ts` e adicioná-lo ao array `imports`.
 */
@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
