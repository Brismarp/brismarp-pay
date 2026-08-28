import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateCompanyStatusDto, ReviewKybDto, KybDecisionDto } from '../dtos/admin.dto';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminCompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { search?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(params.pageSize ?? 20, MAX_PAGE_SIZE);

    const where = {
      ...(params.status ? { status: params.status as any } : {}),
      ...(params.search
        ? {
            OR: [
              { legalName: { contains: params.search, mode: 'insensitive' as const } },
              { tradeName: { contains: params.search, mode: 'insensitive' as const } },
              { cnpj: { contains: params.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        include: { kyb: true, _count: { select: { users: true, customers: true, charges: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.company.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getOne(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        address: true,
        kyb: true,
        users: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada.');
    return company;
  }

  /**
   * Só a área administrativa pode mudar o status de uma empresa (ativar, suspender,
   * bloquear) — nenhum usuário comum de empresa tem esse poder sobre a própria conta.
   */
  async updateStatus(companyId: string, dto: UpdateCompanyStatusDto, actorUserId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada.');

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { status: dto.status },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        companyId,
        action: 'admin.company.status_change',
        entity: 'Company',
        entityId: companyId,
        metadata: { from: company.status, to: dto.status, reason: dto.reason },
      },
    });

    return updated;
  }

  /**
   * Análise de compliance/KYB. Aprovar ativa a empresa (PENDING_KYB -> ACTIVE).
   * Rejeitar mantém a empresa fora de operação — não existe aprovação automática
   * em nenhum caminho de código, sempre exige esta ação administrativa explícita.
   */
  async reviewKyb(companyId: string, dto: ReviewKybDto, actorUserId: string) {
    const compliance = await this.prisma.complianceRecord.findUnique({ where: { companyId } });
    if (!compliance) throw new NotFoundException('Registro de compliance não encontrado para esta empresa.');

    if (compliance.status === 'APPROVED') {
      throw new BadRequestException('Esta empresa já teve o KYB aprovado.');
    }

    const newComplianceStatus = dto.decision === KybDecisionDto.APPROVED ? 'APPROVED' : 'REJECTED';

    const [updatedCompliance] = await this.prisma.$transaction([
      this.prisma.complianceRecord.update({
        where: { companyId },
        data: {
          status: newComplianceStatus,
          notes: dto.notes,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
        },
      }),
      ...(dto.decision === KybDecisionDto.APPROVED
        ? [this.prisma.company.update({ where: { id: companyId }, data: { status: 'ACTIVE' as const } })]
        : []),
      this.prisma.auditLog.create({
        data: {
          actorUserId,
          companyId,
          action: 'admin.company.kyb_review',
          entity: 'ComplianceRecord',
          entityId: companyId,
          metadata: { decision: dto.decision, notes: dto.notes },
        },
      }),
    ]);

    return updatedCompliance;
  }
}
