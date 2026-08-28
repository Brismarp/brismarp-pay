import { Inject, Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { PAYMENT_PROVIDER, PaymentProvider, ProviderPaymentResult } from '../../../integrations/payment-providers/payment-provider.interface';
import { CreateChargeDto } from '../dtos/create-charge.dto';
import { ChargeStatus } from '@prisma/client';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { PaymentRecoveryQueue } from '../../../infrastructure/queues/payment-recovery.queue';
import { mapGetnetStatus } from '../../../integrations/payment-providers/getnet/getnet-status.mapper';

const PLACEHOLDER_FEE_BPS = 250;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAYMENT_STATE_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_PAYMENT_EXPIRATION_MINUTES = 30;
const DEFAULT_RECONCILIATION_BATCH_SIZE = 100;

export type ChargeActor = {
  userId: string | null;
  source: string;
};

@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly redis: RedisService,
    private readonly recoveryQueue: PaymentRecoveryQueue,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async create(companyId: string, actor: ChargeActor, dto: CreateChargeDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, companyId } });
    if (!customer) throw new BadRequestException('Cliente informado não pertence a esta empresa.');

    const idempotencyKey = dto.idempotencyKey ?? crypto.randomUUID();
    const redisKey = `idempotency:${companyId}:${idempotencyKey}`;
    const existingRedis = await this.redis.getJson<{ chargeId: string }>(redisKey);
    if (existingRedis) return this.getOwned(companyId, existingRedis.chargeId);

    const existing = await this.prisma.charge.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.companyId !== companyId) throw new ConflictException('Idempotency key já utilizada por outra empresa.');
      await this.redis.setJson(redisKey, { chargeId: existing.id }, this.paymentStateTtlSeconds());
      return existing;
    }

    const lockKey = `lock:${redisKey}`;
    const lockToken = crypto.randomUUID();
    const lock = await this.redis.setIfAbsent(lockKey, lockToken, 30);
    if (!lock) {
      const replay = await this.prisma.charge.findUnique({ where: { idempotencyKey } });
      if (replay && replay.companyId === companyId) return replay;
      throw new ConflictException('Pagamento com esta chave está sendo processado.');
    }

    try {
      const charge = await this.prisma.$transaction(async tx => {
        const created = await tx.charge.create({
          data: {
            companyId,
            customerId: customer.id,
            method: dto.method,
            status: 'PROCESSING',
            amountCents: dto.amountCents,
            installments: dto.installments ?? 1,
            idempotencyKey,
            metadata: dto.metadata as any,
            providerName: this.paymentProvider.name,
            expiresAt: this.expiresAtForMethod(dto.method),
          },
        });
        await tx.chargeEvent.create({
          data: {
            chargeId: created.id,
            fromStatus: null,
            toStatus: 'PROCESSING',
            source: actor.source,
            metadata: { phase: 'intent-created' } as any,
          },
        });
        return created;
      }, { isolationLevel: 'Serializable' });

      await this.redis.setJson(`payment:${charge.id}`, {
        paymentId: charge.id,
        companyId,
        status: 'PROCESSING',
        amountCents: charge.amountCents,
        provider: this.paymentProvider.name,
        createdAt: charge.createdAt,
        expiresAt: charge.expiresAt,
      }, this.paymentStateTtlSeconds());
      await this.redis.setJson(redisKey, { chargeId: charge.id }, this.paymentStateTtlSeconds());

      try {
        const providerResult = await this.paymentProvider.createPayment({
          companyId,
          amountCents: dto.amountCents,
          currency: 'BRL',
          method: dto.method,
          installments: dto.installments,
          customer: { externalId: customer.id, name: customer.name, document: customer.document },
          idempotencyKey,
          metadata: dto.metadata,
        });
        const status = this.mapProviderStatus(providerResult.status);
        const updated = await this.transition(
          charge.id,
          status,
          `provider:${this.paymentProvider.name}`,
          providerResult.raw,
          providerResult.providerPaymentId,
          actor.source,
        );
        if (['PENDING', 'PROCESSING'].includes(updated.status)) await this.recoveryQueue.schedule(updated.id);
      } catch (error) {
        await this.transition(
          charge.id,
          'FAILED',
          `provider:${this.paymentProvider.name}:error`,
          { message: error instanceof Error ? error.message : 'unknown' },
          undefined,
          actor.source,
        );
      }

      await this.prisma.auditLog.create({
        data: {
          actorUserId: actor.userId,
          companyId,
          action: 'charge.create',
          entity: 'Charge',
          entityId: charge.id,
          metadata: { method: dto.method, amountCents: dto.amountCents, asynchronous: true } as any,
        },
      });
      return this.getOwned(companyId, charge.id);
    } finally {
      await this.redis.releaseIfOwner(lockKey, lockToken);
    }
  }

  async getStatus(companyId: string, chargeId: string) {
    const cached = await this.redis.getJson<any>(`payment:${chargeId}`);
    if (cached && cached.companyId === companyId) return cached;
    const charge = await this.getOwned(companyId, chargeId);
    const state = this.stateFromCharge(charge);
    await this.redis.setJson(`payment:${charge.id}`, state, this.paymentStateTtlSeconds());
    return state;
  }

  async simulatePixConfirmation(companyId: string, chargeId: string, actor: ChargeActor) {
    const charge = await this.getOwned(companyId, chargeId);
    if (charge.method !== 'PIX' && charge.method !== 'BOLETO') throw new BadRequestException('Simulação disponível apenas para PIX/Boleto.');
    if (!['PENDING', 'PROCESSING'].includes(charge.status)) throw new BadRequestException(`Cobrança não está pendente (status atual: ${charge.status}).`);
    return this.transition(chargeId, 'APPROVED', 'sandbox-simulation', { simulated: true }, undefined, actor.source);
  }

  async cancel(companyId: string, chargeId: string, actor: ChargeActor) {
    const charge = await this.getOwned(companyId, chargeId);
    if (!['PENDING', 'PROCESSING'].includes(charge.status)) throw new BadRequestException(`Cobrança com status "${charge.status}" não pode ser cancelada.`);
    if (charge.providerPaymentId) await this.paymentProvider.cancelPayment(charge.providerPaymentId);
    return this.transition(chargeId, 'CANCELED', actor.source, { cancelled: true }, undefined, actor.source);
  }

  async refund(companyId: string, chargeId: string, actor: ChargeActor, reason?: string) {
    const charge = await this.getOwned(companyId, chargeId);
    if (charge.status === 'REFUNDED') {
      throw new ConflictException('Cobrança já estornada.');
    }
    if (charge.status !== 'APPROVED') {
      throw new BadRequestException(`Somente cobranças aprovadas podem ser estornadas (status atual: ${charge.status}).`);
    }
    if (!charge.providerPaymentId) {
      throw new BadRequestException('Cobrança sem identificador do provider não pode ser estornada.');
    }

    const alreadyRefunded = await this.prisma.refund.findFirst({
      where: { chargeId, status: 'succeeded' },
    });
    if (alreadyRefunded) throw new ConflictException('Cobrança já estornada.');

    await this.paymentProvider.refundPayment({
      providerPaymentId: charge.providerPaymentId,
      amountCents: charge.amountCents,
      reason,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.charge.findUniqueOrThrow({ where: { id: chargeId } });
      if (current.status !== 'APPROVED') {
        throw new ConflictException('Cobrança já estornada.');
      }

      const settlement = await tx.transaction.findFirst({
        where: { chargeId, type: 'charge' },
        orderBy: { createdAt: 'desc' },
      });
      const netAmountCents =
        settlement?.netAmountCents ??
        current.amountCents - Math.round((current.amountCents * PLACEHOLDER_FEE_BPS) / 10000);

      const refund = await tx.refund.create({
        data: {
          chargeId,
          amountCents: current.amountCents,
          reason: reason?.trim() || null,
          status: 'succeeded',
        },
      });

      await tx.transaction.create({
        data: {
          companyId: current.companyId,
          chargeId,
          type: 'refund',
          amountCents: current.amountCents,
          feeCents: 0,
          netAmountCents,
          status: 'REFUNDED',
        },
      });

      if (netAmountCents > 0) {
        await this.ledgerService.append(tx, {
          companyId: current.companyId,
          type: 'REFUND',
          amountCents: netAmountCents,
          referenceType: 'refund',
          referenceId: refund.id,
          description: 'Estorno de cobrança aprovada (líquido)',
          performedBy: actor.source,
        });
      }

      const next = await tx.charge.update({
        where: { id: chargeId },
        data: { status: 'REFUNDED' },
      });
      await tx.chargeEvent.create({
        data: {
          chargeId,
          fromStatus: current.status,
          toStatus: 'REFUNDED',
          source: actor.source,
          metadata: { refundId: refund.id, reason: reason ?? null } as any,
        },
      });
      return next;
    }, { isolationLevel: 'Serializable' });

    await this.redis.setJson(`payment:${updated.id}`, this.stateFromCharge(updated), this.paymentStateTtlSeconds());
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        companyId,
        action: 'charge.refund',
        entity: 'Charge',
        entityId: charge.id,
        metadata: { reason: reason ?? null } as any,
      },
    });
    return updated;
  }

  /** Processa um job individual da fila de recuperação. Erros são relançados para o retry do BullMQ. */
  async recoverPendingCharge(chargeId: string) {
    const charge = await this.prisma.charge.findUnique({ where: { id: chargeId } });
    if (!charge || !['PENDING', 'PROCESSING'].includes(charge.status)) return { ignored: true, chargeId };

    if (charge.expiresAt && charge.expiresAt.getTime() <= Date.now()) {
      const expired = await this.transition(charge.id, 'EXPIRED', 'system:expiration', { expiredAt: new Date().toISOString() });
      return { expired: true, charge: expired };
    }

    if (!charge.providerPaymentId) throw new Error(`Cobrança ${charge.id} não possui providerPaymentId para recuperação.`);

    const providerResult = await this.paymentProvider.getPayment(charge.providerPaymentId);
    const updated = await this.transition(
      charge.id,
      this.mapProviderStatus(providerResult.status),
      `recovery:${this.paymentProvider.name}`,
      providerResult.raw,
      providerResult.providerPaymentId,
    );

    if (['PENDING', 'PROCESSING'].includes(updated.status)) await this.recoveryQueue.schedule(updated.id);
    return updated;
  }

  /** Expira cobranças pendentes que ultrapassaram a janela configurada. */
  async expirePendingCharges() {
    const expiredCandidates = await this.prisma.charge.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        expiresAt: { not: null, lte: new Date() },
      },
      select: { id: true },
      take: this.reconciliationBatchSize(),
    });

    let expired = 0;
    for (const candidate of expiredCandidates) {
      const result = await this.recoverPendingCharge(candidate.id);
      if ((result as any)?.expired) expired += 1;
    }
    return { scanned: expiredCandidates.length, expired };
  }

  /** Consulta periodicamente o provider e aplica o mesmo fluxo de transição/webhook. */
  async reconcilePendingPayments(limit = this.reconciliationBatchSize()) {
    const expiration = await this.expirePendingCharges();
    const pending = await this.prisma.charge.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        providerPaymentId: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { updatedAt: 'asc' },
      select: { id: true },
      take: Math.max(1, Math.min(limit, this.reconciliationBatchSize())),
    });

    let processed = 0;
    let failed = 0;
    for (const item of pending) {
      try {
        await this.recoverPendingCharge(item.id);
        processed += 1;
      } catch {
        failed += 1;
      }
    }
    return { expiration, scanned: pending.length, processed, failed };
  }

  async queueMetrics() {
    return this.recoveryQueue.metrics();
  }

  async applyProviderWebhook(providerPaymentId: string, status: ChargeStatus, eventKey: string, metadata: any) {
    const eventLock = await this.redis.setIfAbsent(
      `webhook:${this.paymentProvider.name}:${eventKey}`,
      '1',
      this.paymentStateTtlSeconds(),
    );
    if (!eventLock) return { duplicate: true };
    const charge = await this.prisma.charge.findFirst({ where: { providerPaymentId } });
    if (!charge) throw new NotFoundException('Cobrança do provider não encontrada.');
    if (charge.status === status) return { duplicate: true, charge };
    return this.transition(charge.id, status, 'webhook', metadata, providerPaymentId, 'system');
  }

  async list(companyId: string, params: any) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(params.pageSize ?? 20, MAX_PAGE_SIZE);
    const where: any = {
      companyId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.method ? { method: params.method } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.charge.findMany({
        where,
        include: { customer: { select: { id: true, name: true, document: true } } },
        orderBy: { [params.sortBy ?? 'createdAt']: params.sortOrder ?? 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.charge.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getWithTimeline(companyId: string, chargeId: string) {
    const charge = await this.getOwned(companyId, chargeId);
    const [events, transactions] = await Promise.all([
      this.prisma.chargeEvent.findMany({ where: { chargeId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.transaction.findMany({ where: { chargeId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { ...charge, events, transactions };
  }

  private async transition(
    chargeId: string,
    status: ChargeStatus,
    source: string,
    metadata: any,
    providerPaymentId?: string,
    actorSource = 'system',
  ) {
    const updated = await this.prisma.$transaction(async tx => {
      const current = await tx.charge.findUniqueOrThrow({ where: { id: chargeId } });
      if (current.status === status && (!providerPaymentId || current.providerPaymentId === providerPaymentId)) return current;
      const next = await tx.charge.update({
        where: { id: chargeId },
        data: { status, ...(providerPaymentId ? { providerPaymentId } : {}) },
      });
      await tx.chargeEvent.create({ data: { chargeId, fromStatus: current.status, toStatus: status, source, metadata: metadata as any } });
      if (status === 'APPROVED' && current.status !== 'APPROVED') {
        await this.settleApprovedCharge(tx, next.companyId, next.id, next.amountCents, actorSource);
      }
      return next;
    }, { isolationLevel: 'Serializable' });

    await this.redis.setJson(`payment:${updated.id}`, this.stateFromCharge(updated), this.paymentStateTtlSeconds());
    return updated;
  }

  private stateFromCharge(charge: any) {
    return {
      paymentId: charge.id,
      companyId: charge.companyId,
      status: charge.status,
      amountCents: charge.amountCents,
      provider: charge.providerName,
      providerPaymentId: charge.providerPaymentId,
      createdAt: charge.createdAt,
      updatedAt: charge.updatedAt,
      expiresAt: charge.expiresAt,
    };
  }

  private async settleApprovedCharge(tx: any, companyId: string, chargeId: string, amountCents: number, actorSource: string) {
    const feeCents = Math.round((amountCents * PLACEHOLDER_FEE_BPS) / 10000);
    const netAmountCents = amountCents - feeCents;
    await tx.transaction.create({ data: { companyId, chargeId, type: 'charge', amountCents, feeCents, netAmountCents, status: 'APPROVED' } });
    await this.ledgerService.append(tx, {
      companyId,
      type: 'CREDIT',
      amountCents: netAmountCents,
      referenceType: 'charge',
      referenceId: chargeId,
      description: 'Cobrança aprovada (líquido de taxa)',
      performedBy: actorSource,
    });
    if (feeCents > 0) {
      await this.ledgerService.append(tx, {
        companyId,
        type: 'FEE',
        amountCents: feeCents,
        referenceType: 'charge',
        referenceId: chargeId,
        description: 'Taxa sobre cobrança aprovada',
        performedBy: 'system',
      });
    }
  }

  private mapProviderStatus(status: ProviderPaymentResult['status']): ChargeStatus {
    return this.paymentProvider.name === 'getnet' ? mapGetnetStatus(status) : status as ChargeStatus;
  }

  private expiresAtForMethod(method: string): Date | undefined {
    if (method !== 'PIX' && method !== 'BOLETO') return undefined;
    const minutes = Number(process.env.PAYMENT_EXPIRATION_MINUTES ?? DEFAULT_PAYMENT_EXPIRATION_MINUTES);
    if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
    return new Date(Date.now() + minutes * 60_000);
  }

  private paymentStateTtlSeconds(): number {
    const configured = Number(process.env.PAYMENT_STATE_TTL_SECONDS ?? DEFAULT_PAYMENT_STATE_TTL_SECONDS);
    return Number.isFinite(configured) && configured >= 60 ? Math.floor(configured) : DEFAULT_PAYMENT_STATE_TTL_SECONDS;
  }

  private reconciliationBatchSize(): number {
    const configured = Number(process.env.RECONCILIATION_BATCH_SIZE ?? DEFAULT_RECONCILIATION_BATCH_SIZE);
    return Number.isFinite(configured) && configured >= 1 ? Math.min(Math.floor(configured), 1000) : DEFAULT_RECONCILIATION_BATCH_SIZE;
  }

  private async getOwned(companyId: string, chargeId: string) {
    const charge = await this.prisma.charge.findFirst({ where: { id: chargeId, companyId } });
    if (!charge) throw new NotFoundException('Cobrança não encontrada.');
    return charge;
  }
}
