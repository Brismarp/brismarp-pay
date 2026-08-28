import { Module } from '@nestjs/common';
import { LedgerService } from './services/ledger.service';
import { LedgerController } from './controllers/ledger.controller';

@Module({
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
