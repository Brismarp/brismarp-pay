import { Module } from '@nestjs/common';
import { LedgerService } from './services/ledger.service';
import { LedgerController } from './controllers/ledger.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [ApiKeysModule],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
