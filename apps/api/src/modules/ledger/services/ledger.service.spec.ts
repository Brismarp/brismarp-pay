import { Test } from '@nestjs/testing';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../../../prisma/prisma.service';

function createTxMock() {
  return {
    ledgerEntry: {
      findFirst: jest.fn(),
      create: jest.fn((args) => ({ id: 'entry-new', ...args.data })),
    },
  };
}

describe('LedgerService', () => {
  let ledgerService: LedgerService;
  let prisma: { ledgerEntry: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { ledgerEntry: { findFirst: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [LedgerService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    ledgerService = moduleRef.get(LedgerService);
  });

  describe('append', () => {
    it('primeiro lançamento de uma empresa nova parte de saldo zero', async () => {
      const tx = createTxMock();
      tx.ledgerEntry.findFirst.mockResolvedValue(null);

      const entry = await ledgerService.append(tx as any, {
        companyId: 'company-1',
        type: 'CREDIT',
        amountCents: 10_000,
        referenceType: 'charge',
        description: 'Primeira cobrança aprovada',
        performedBy: 'system',
      });

      expect(entry.balanceAfterCents).toBe(10_000);
    });

    it('CREDIT soma ao saldo anterior', async () => {
      const tx = createTxMock();
      tx.ledgerEntry.findFirst.mockResolvedValue({ balanceAfterCents: 5_000 });

      const entry = await ledgerService.append(tx as any, {
        companyId: 'company-1',
        type: 'CREDIT',
        amountCents: 3_000,
        referenceType: 'charge',
        description: 'Cobrança aprovada',
        performedBy: 'system',
      });

      expect(entry.balanceAfterCents).toBe(8_000);
    });

    it('DEBIT subtrai do saldo anterior', async () => {
      const tx = createTxMock();
      tx.ledgerEntry.findFirst.mockResolvedValue({ balanceAfterCents: 5_000 });

      const entry = await ledgerService.append(tx as any, {
        companyId: 'company-1',
        type: 'DEBIT',
        amountCents: 2_000,
        referenceType: 'payout',
        description: 'Transferência solicitada',
        performedBy: 'user:user-1',
      });

      expect(entry.balanceAfterCents).toBe(3_000);
    });

    it('FEE é tratado como débito no cálculo de saldo', async () => {
      const tx = createTxMock();
      tx.ledgerEntry.findFirst.mockResolvedValue({ balanceAfterCents: 10_000 });

      const entry = await ledgerService.append(tx as any, {
        companyId: 'company-1',
        type: 'FEE',
        amountCents: 250,
        referenceType: 'charge',
        description: 'Taxa sobre cobrança',
        performedBy: 'system',
      });

      expect(entry.balanceAfterCents).toBe(9_750);
    });

    it('busca o último lançamento SEMPRE escopado pela empresa (isolamento de tenant)', async () => {
      const tx = createTxMock();
      tx.ledgerEntry.findFirst.mockResolvedValue(null);

      await ledgerService.append(tx as any, {
        companyId: 'company-42',
        type: 'CREDIT',
        amountCents: 100,
        referenceType: 'charge',
        description: 'teste',
        performedBy: 'system',
      });

      expect(tx.ledgerEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-42' } }),
      );
    });
  });

  describe('getCurrentBalance', () => {
    it('retorna zero quando a empresa não tem nenhum lançamento', async () => {
      prisma.ledgerEntry.findFirst.mockResolvedValue(null);
      const balance = await ledgerService.getCurrentBalance('company-1');
      expect(balance).toBe(0);
    });

    it('retorna o balanceAfterCents do último lançamento', async () => {
      prisma.ledgerEntry.findFirst.mockResolvedValue({ balanceAfterCents: 42_000 });
      const balance = await ledgerService.getCurrentBalance('company-1');
      expect(balance).toBe(42_000);
    });
  });
});
