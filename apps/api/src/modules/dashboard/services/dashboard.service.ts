import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LedgerService } from '../../ledger/services/ledger.service';

const DEFAULT_PERIOD_DAYS = 30;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  async getSummary(companyId: string, from?: Date, to?: Date) {
    const periodEnd = to ?? new Date();
    const periodStart = from ?? new Date(periodEnd.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const dateFilter = { gte: periodStart, lte: periodEnd };

    // Todas as consultas abaixo são agregações reais sobre as tabelas Charge/Transaction/LedgerEntry.
    // Nenhum valor é fixo ou simulado — se não houver dados no período, os números retornam zero.
    const [
      availableBalanceCents,
      volumeApproved,
      chargeCountsByStatus,
      feesSum,
      chargebackCount,
      refundCount,
      recentCharges,
      pendingCharges,
    ] = await Promise.all([
      this.ledgerService.getCurrentBalance(companyId),

      this.prisma.charge.aggregate({
        where: { companyId, status: 'APPROVED', createdAt: dateFilter },
        _sum: { amountCents: true },
      }),

      this.prisma.charge.groupBy({
        by: ['status'],
        where: { companyId, createdAt: dateFilter },
        _count: { _all: true },
      }),

      this.prisma.transaction.aggregate({
        where: { companyId, createdAt: dateFilter },
        _sum: { feeCents: true },
      }),

      this.prisma.charge.count({
        where: { companyId, status: 'CHARGEBACK', createdAt: dateFilter },
      }),

      this.prisma.refund.count({
        where: { charge: { companyId }, createdAt: dateFilter },
      }),

      this.prisma.charge.findMany({
        where: { companyId },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      this.prisma.charge.aggregate({
        where: { companyId, status: 'PENDING' },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ]);

    const totalChargesInPeriod = chargeCountsByStatus.reduce((acc, row) => acc + row._count._all, 0);
    const approvedInPeriod = chargeCountsByStatus.find((r) => r.status === 'APPROVED')?._count._all ?? 0;
    const declinedOrFailed = chargeCountsByStatus
      .filter((r) => ['DECLINED', 'FAILED'].includes(r.status))
      .reduce((acc, row) => acc + row._count._all, 0);
    const decidedTotal = approvedInPeriod + declinedOrFailed;

    return {
      period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
      balance: {
        availableCents: availableBalanceCents,
        pendingCents: pendingCharges._sum.amountCents ?? 0,
        pendingCount: pendingCharges._count._all,
      },
      volumeProcessedCents: volumeApproved._sum.amountCents ?? 0,
      transactionCount: totalChargesInPeriod,
      approvalRate: decidedTotal > 0 ? approvedInPeriod / decidedTotal : null,
      feesChargedCents: feesSum._sum.feeCents ?? 0,
      chargebackCount,
      refundCount,
      statusBreakdown: chargeCountsByStatus.map((row) => ({ status: row.status, count: row._count._all })),
      recentCharges: recentCharges.map((c) => ({
        id: c.id,
        customerName: c.customer?.name ?? null,
        method: c.method,
        status: c.status,
        amountCents: c.amountCents,
        createdAt: c.createdAt,
      })),
    };
  }
}
