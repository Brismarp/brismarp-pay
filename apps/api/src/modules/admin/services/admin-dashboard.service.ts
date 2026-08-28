import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const DEFAULT_PERIOD_DAYS = 30;

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Visão consolidada de TODAS as empresas — nunca exposta a usuários comuns
   * (só acessível via PlatformAdminGuard). Toda agregação é real, sobre o banco.
   */
  async getSummary(from?: Date, to?: Date) {
    const periodEnd = to ?? new Date();
    const periodStart = from ?? new Date(periodEnd.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const dateFilter = { gte: periodStart, lte: periodEnd };

    const [
      companiesByStatus,
      totalCustomers,
      volumeApproved,
      feesSum,
      chargeCountsByStatus,
      pendingKybCount,
    ] = await Promise.all([
      this.prisma.company.groupBy({ by: ['status'], _count: { _all: true } }),

      this.prisma.customer.count(),

      this.prisma.charge.aggregate({
        where: { status: 'APPROVED', createdAt: dateFilter },
        _sum: { amountCents: true },
      }),

      this.prisma.transaction.aggregate({
        where: { createdAt: dateFilter },
        _sum: { feeCents: true },
      }),

      this.prisma.charge.groupBy({
        by: ['status'],
        where: { createdAt: dateFilter },
        _count: { _all: true },
      }),

      this.prisma.complianceRecord.count({ where: { status: { in: ['NOT_STARTED', 'IN_REVIEW'] } } }),
    ]);

    return {
      period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
      companiesByStatus: companiesByStatus.map((row) => ({ status: row.status, count: row._count._all })),
      totalCustomers,
      volumeProcessedCents: volumeApproved._sum.amountCents ?? 0,
      feesCollectedCents: feesSum._sum.feeCents ?? 0,
      chargeStatusBreakdown: chargeCountsByStatus.map((row) => ({ status: row.status, count: row._count._all })),
      pendingKybCount,
    };
  }
}
