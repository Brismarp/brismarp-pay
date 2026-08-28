import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCompanyDto } from '../dtos/create-company.dto';
import { normalizeCnpj } from '../../../shared/validators/cnpj.validator';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCompany(userId: string, dto: CreateCompanyDto) {
    const cnpj = normalizeCnpj(dto.cnpj);

    const existing = await this.prisma.company.findUnique({ where: { cnpj } });
    if (existing) {
      throw new ConflictException('Já existe uma empresa cadastrada com este CNPJ.');
    }

    const now = new Date();

    // Transação: empresa, endereço, conta bancária (se enviada), registro de KYB e
    // vínculo do usuário como OWNER são criados atomicamente — nunca deixamos uma
    // empresa "meio criada" sem dono ou sem registro de compliance.
    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          legalName: dto.legalName,
          tradeName: dto.tradeName,
          cnpj,
          businessEmail: dto.businessEmail,
          phone: dto.phone,
          status: 'PENDING_KYB',
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          address: { create: { ...dto.address } },
          ...(dto.bankAccount
            ? { bankAccounts: { create: { ...dto.bankAccount } } }
            : {}),
          kyb: { create: { status: 'NOT_STARTED' } },
          users: {
            create: { userId, role: 'OWNER', acceptedAt: now },
          },
        },
        include: { address: true, bankAccounts: true, kyb: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          companyId: created.id,
          action: 'company.create',
          entity: 'Company',
          entityId: created.id,
        },
      });

      return created;
    });

    // Neste ponto a análise de KYB ainda não foi iniciada de fato — não existe
    // integração com nenhum provedor de verificação nesta fase. O status
    // PENDING_KYB/NOT_STARTED reflete isso com precisão, sem prometer aprovação.
    return company;
  }

  async listCompaniesForUser(userId: string) {
    const memberships = await this.prisma.companyUser.findMany({
      where: { userId, removedAt: null },
      include: { company: { include: { kyb: true } } },
    });

    return memberships.map((m) => ({
      id: m.company.id,
      legalName: m.company.legalName,
      tradeName: m.company.tradeName,
      status: m.company.status,
      kybStatus: m.company.kyb?.status ?? 'NOT_STARTED',
      role: m.role,
    }));
  }

  async getCompanyForUser(userId: string, companyId: string) {
    const membership = await this.prisma.companyUser.findFirst({
      where: { userId, companyId, removedAt: null },
    });
    if (!membership) {
      throw new ForbiddenException('Você não tem acesso a esta empresa.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { address: true, bankAccounts: true, kyb: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada.');

    return company;
  }
}
