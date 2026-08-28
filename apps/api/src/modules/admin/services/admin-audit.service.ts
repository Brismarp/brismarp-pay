import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Único lugar do sistema que pode consultar audit logs de QUALQUER empresa —
   * fora daqui, todo acesso a AuditLog deveria ser escopado por tenant (não há
   * hoje um endpoint de auditoria para usuários comuns; se for criado, deve
   * reusar CompanyRolesGuard, nunca este service).
   */
  async list(params: {
    companyId?: string;
    actorUserId?: string;
    action?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(params.pageSize ?? 20, MAX_PAGE_SIZE);

    const where = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
      ...(params.action ? { action: { contains: params.action } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actorUser: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, legalName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
