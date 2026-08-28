import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChargesService } from './charges.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { PAYMENT_PROVIDER } from '../../../integrations/payment-providers/payment-provider.interface';
import { ChargeMethodDto } from '../dtos/create-charge.dto';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { PaymentRecoveryQueue } from '../../../infrastructure/queues/payment-recovery.queue';

function createTxMock() {
  const currentCharge = {
    id: 'charge-new',
    companyId: 'company-1',
    amountCents: 5_000,
    status: 'PROCESSING',
    providerName: 'mock',
    providerPaymentId: 'mock_123',
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
  };
  return {
    charge: {
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(currentCharge),
      findUniqueOrThrow: jest.fn().mockResolvedValue(currentCharge),
    },
    chargeEvent: { create: jest.fn() },
    transaction: { create: jest.fn(), findFirst: jest.fn() },
    refund: { create: jest.fn() },
  };
}

describe('ChargesService', () => {
  let service: ChargesService;
  let prisma: any;
  let ledgerService: { append: jest.Mock };
  let paymentProvider: {
    name: string;
    createPayment: jest.Mock;
    getPayment: jest.Mock;
    cancelPayment: jest.Mock;
    refundPayment: jest.Mock;
  };
  let redis: {
    getJson: jest.Mock;
    setJson: jest.Mock;
    setIfAbsent: jest.Mock;
    releaseIfOwner: jest.Mock;
  };
  let recoveryQueue: { schedule: jest.Mock; metrics: jest.Mock };

  beforeEach(async () => {
    const tx = createTxMock();

    prisma = {
      customer: { findFirst: jest.fn() },
      charge: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      refund: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (fnOrArray: any) => {
        if (typeof fnOrArray === 'function') return fnOrArray(tx);
        return Promise.all(fnOrArray);
      }),
      __tx: tx,
    };

    ledgerService = { append: jest.fn().mockResolvedValue({}) };
    paymentProvider = {
      name: 'mock',
      createPayment: jest.fn(),
      getPayment: jest.fn(),
      cancelPayment: jest.fn(),
      refundPayment: jest.fn().mockResolvedValue(undefined),
    };
    redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
      setIfAbsent: jest.fn().mockResolvedValue('OK'),
      releaseIfOwner: jest.fn().mockResolvedValue(1),
    };
    recoveryQueue = {
      schedule: jest.fn().mockResolvedValue(undefined),
      metrics: jest.fn().mockResolvedValue({ name: 'payment-recovery' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargesService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledgerService },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
        { provide: RedisService, useValue: redis },
        { provide: PaymentRecoveryQueue, useValue: recoveryQueue },
      ],
    }).compile();

    service = moduleRef.get(ChargesService);
  });

  const actor = { userId: 'user-1', source: 'user:user-1' };

  const validDto = {
    method: ChargeMethodDto.CREDIT_CARD,
    amountCents: 5_000,
    customerId: 'customer-1',
    idempotencyKey: 'idem-key-1',
  };

  it('rejeita cobrança para cliente que não pertence à empresa autenticada', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.create('company-1', actor, validDto)).rejects.toThrow(BadRequestException);
    expect(paymentProvider.createPayment).not.toHaveBeenCalled();
  });

  it('idempotência: reenviar a mesma chave retorna a cobrança existente, sem chamar o provider de novo', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'customer-1', name: 'Ana', document: '123' });
    prisma.charge.findUnique.mockResolvedValue({ id: 'charge-existing', companyId: 'company-1', idempotencyKey: 'idem-key-1' });

    const result = await service.create('company-1', actor, validDto);

    expect(result.id).toBe('charge-existing');
    expect(paymentProvider.createPayment).not.toHaveBeenCalled();
    expect(redis.setJson).toHaveBeenCalledWith('idempotency:company-1:idem-key-1', { chargeId: 'charge-existing' }, expect.any(Number));
  });

  it('rejeita replay de idempotency key pertencente a outra empresa', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'customer-1', name: 'Ana', document: '123' });
    prisma.charge.findUnique.mockResolvedValue({ id: 'charge-existing', companyId: 'company-OUTRA', idempotencyKey: 'idem-key-1' });

    await expect(service.create('company-1', actor, validDto)).rejects.toThrow(ConflictException);
  });

  it('cobrança aprovada gera Transaction e lançamento de ledger com taxa deduzida', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'customer-1', name: 'Ana', document: '123' });
    prisma.charge.findUnique.mockResolvedValue(null);
    paymentProvider.createPayment.mockResolvedValue({ providerPaymentId: 'mock_123', status: 'APPROVED', raw: {} });
    prisma.__tx.charge.create.mockResolvedValue({ id: 'charge-new', status: 'PROCESSING', companyId: 'company-1', amountCents: 5_000, createdAt: new Date(), updatedAt: new Date() });
    prisma.__tx.charge.update.mockResolvedValue({ id: 'charge-new', status: 'APPROVED', companyId: 'company-1', amountCents: 5_000, providerName: 'mock', providerPaymentId: 'mock_123', createdAt: new Date(), updatedAt: new Date() });
    prisma.charge.findFirst.mockResolvedValue({ id: 'charge-new', companyId: 'company-1', status: 'APPROVED' });

    await service.create('company-1', actor, validDto);

    expect(prisma.__tx.transaction.create).toHaveBeenCalledTimes(1);
    const txArgs = prisma.__tx.transaction.create.mock.calls[0][0].data;
    expect(txArgs.amountCents).toBe(5_000);
    expect(txArgs.feeCents).toBeGreaterThan(0);
    expect(txArgs.netAmountCents).toBe(5_000 - txArgs.feeCents);
    expect(ledgerService.append).toHaveBeenCalledWith(prisma.__tx, expect.objectContaining({ type: 'CREDIT', amountCents: txArgs.netAmountCents }));
    expect(ledgerService.append).toHaveBeenCalledWith(prisma.__tx, expect.objectContaining({ type: 'FEE', amountCents: txArgs.feeCents }));
  });

  it('cobrança PIX pendente recebe expiresAt e não gera lançamento até ser confirmada', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'customer-1', name: 'Ana', document: '123' });
    prisma.charge.findUnique.mockResolvedValue(null);
    paymentProvider.createPayment.mockResolvedValue({ providerPaymentId: 'mock_pix_1', status: 'PENDING', raw: {} });
    prisma.__tx.charge.create.mockResolvedValue({ id: 'charge-pix', status: 'PROCESSING', companyId: 'company-1', amountCents: 5_000, createdAt: new Date(), updatedAt: new Date() });
    prisma.__tx.charge.update.mockResolvedValue({ id: 'charge-pix', status: 'PENDING', companyId: 'company-1', amountCents: 5_000, providerName: 'mock', providerPaymentId: 'mock_pix_1', createdAt: new Date(), updatedAt: new Date() });
    prisma.charge.findFirst.mockResolvedValue({ id: 'charge-pix', companyId: 'company-1', status: 'PENDING' });

    await service.create('company-1', actor, { ...validDto, method: ChargeMethodDto.PIX });

    expect(prisma.__tx.charge.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expiresAt: expect.any(Date) }) }));
    expect(prisma.__tx.transaction.create).not.toHaveBeenCalled();
    expect(ledgerService.append).not.toHaveBeenCalled();
    expect(recoveryQueue.schedule).toHaveBeenCalledWith('charge-pix');
  });

  it('getStatus prioriza o estado Redis quando o tenant corresponde', async () => {
    redis.getJson.mockResolvedValue({ paymentId: 'charge-1', companyId: 'company-1', status: 'PENDING' });

    await expect(service.getStatus('company-1', 'charge-1')).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
    expect(prisma.charge.findFirst).not.toHaveBeenCalled();
  });

  it('deduplica webhook antes de consultar ou alterar a cobrança', async () => {
    redis.setIfAbsent.mockResolvedValue(null);

    await expect(service.applyProviderWebhook('provider-1', 'APPROVED' as any, 'event-1', {})).resolves.toEqual({ duplicate: true });
    expect(prisma.charge.findFirst).not.toHaveBeenCalled();
  });

  it('recupera cobrança pendente consultando o provider e liquida uma aprovação uma única vez', async () => {
    prisma.charge.findUnique.mockResolvedValue({
      id: 'charge-1', companyId: 'company-1', amountCents: 5_000, status: 'PENDING',
      providerName: 'mock', providerPaymentId: 'provider-1', expiresAt: null,
    });
    prisma.__tx.charge.findUniqueOrThrow.mockResolvedValue({
      id: 'charge-1', companyId: 'company-1', amountCents: 5_000, status: 'PENDING',
      providerName: 'mock', providerPaymentId: 'provider-1', expiresAt: null,
    });
    prisma.__tx.charge.update.mockResolvedValue({
      id: 'charge-1', companyId: 'company-1', amountCents: 5_000, status: 'APPROVED',
      providerName: 'mock', providerPaymentId: 'provider-1', expiresAt: null,
    });
    paymentProvider.getPayment.mockResolvedValue({ providerPaymentId: 'provider-1', status: 'APPROVED', raw: {} });

    await service.recoverPendingCharge('charge-1');

    expect(paymentProvider.getPayment).toHaveBeenCalledWith('provider-1');
    expect(prisma.__tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(ledgerService.append).toHaveBeenCalledTimes(2);
  });

  describe('cancel', () => {
    it('permite cancelar cobrança PENDING', async () => {
      prisma.charge.findFirst.mockResolvedValue({ id: 'charge-1', status: 'PENDING', providerPaymentId: 'mock_1' });
      prisma.__tx.charge.update.mockResolvedValue({ id: 'charge-1', status: 'CANCELED', companyId: 'company-1', amountCents: 5_000 });

      await service.cancel('company-1', 'charge-1', actor);

      expect(paymentProvider.cancelPayment).toHaveBeenCalledWith('mock_1');
      expect(prisma.__tx.chargeEvent.create).toHaveBeenCalled();
    });

    it('rejeita cancelar cobrança já aprovada (deve usar estorno, não cancelamento)', async () => {
      prisma.charge.findFirst.mockResolvedValue({ id: 'charge-1', status: 'APPROVED' });

      await expect(service.cancel('company-1', 'charge-1', actor)).rejects.toThrow(BadRequestException);
      expect(paymentProvider.cancelPayment).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    const approvedCharge = {
      id: 'charge-1',
      companyId: 'company-1',
      amountCents: 5_000,
      status: 'APPROVED',
      providerPaymentId: 'mock_123',
    };

    it('estorna cobrança aprovada, lança REFUND do líquido e marca REFUNDED', async () => {
      prisma.charge.findFirst.mockResolvedValue(approvedCharge);
      prisma.refund.findFirst.mockResolvedValue(null);
      prisma.__tx.charge.findUniqueOrThrow.mockResolvedValue(approvedCharge);
      prisma.__tx.transaction.findFirst.mockResolvedValue({ netAmountCents: 4_875 });
      prisma.__tx.refund.create.mockResolvedValue({ id: 'refund-1' });
      prisma.__tx.charge.update.mockResolvedValue({ ...approvedCharge, status: 'REFUNDED' });

      await service.refund('company-1', 'charge-1', actor, 'cliente pediu');

      expect(paymentProvider.refundPayment).toHaveBeenCalledWith({
        providerPaymentId: 'mock_123',
        amountCents: 5_000,
        reason: 'cliente pediu',
      });
      expect(prisma.__tx.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountCents: 5_000, status: 'succeeded' }) }),
      );
      expect(ledgerService.append).toHaveBeenCalledWith(
        prisma.__tx,
        expect.objectContaining({ type: 'REFUND', amountCents: 4_875 }),
      );
      expect(prisma.__tx.charge.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REFUNDED' } }),
      );
    });

    it('rejeita estorno de cobrança pendente', async () => {
      prisma.charge.findFirst.mockResolvedValue({ ...approvedCharge, status: 'PENDING' });

      await expect(service.refund('company-1', 'charge-1', actor)).rejects.toThrow(BadRequestException);
      expect(paymentProvider.refundPayment).not.toHaveBeenCalled();
    });

    it('rejeita segundo estorno da mesma cobrança', async () => {
      prisma.charge.findFirst.mockResolvedValue({ ...approvedCharge, status: 'REFUNDED' });

      await expect(service.refund('company-1', 'charge-1', actor)).rejects.toThrow(ConflictException);
      expect(paymentProvider.refundPayment).not.toHaveBeenCalled();
    });
  });

  describe('simulatePixConfirmation', () => {
    it('aprova PIX pendente via simulação de sandbox', async () => {
      prisma.charge.findFirst.mockResolvedValue({
        id: 'charge-pix',
        method: 'PIX',
        status: 'PENDING',
        companyId: 'company-1',
        amountCents: 5_000,
      });
      prisma.__tx.charge.findUniqueOrThrow.mockResolvedValue({
        id: 'charge-pix',
        status: 'PENDING',
        companyId: 'company-1',
        amountCents: 5_000,
      });
      prisma.__tx.charge.update.mockResolvedValue({
        id: 'charge-pix',
        status: 'APPROVED',
        companyId: 'company-1',
        amountCents: 5_000,
      });

      await service.simulatePixConfirmation('company-1', 'charge-pix', actor);

      expect(prisma.__tx.charge.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
      );
    });

    it('rejeita simulação de cartão já aprovado', async () => {
      prisma.charge.findFirst.mockResolvedValue({
        id: 'charge-1',
        method: 'CREDIT_CARD',
        status: 'APPROVED',
      });

      await expect(service.simulatePixConfirmation('company-1', 'charge-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
