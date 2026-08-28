import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: { companyId, ...dto },
    });
  }

  async update(companyId: string, customerId: string, dto: UpdateCustomerDto) {
    await this.getOwned(companyId, customerId);
    return this.prisma.customer.update({ where: { id: customerId }, data: dto });
  }

  async list(
    companyId: string,
    params: { search?: string; page?: number; pageSize?: number },
  ) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(params.pageSize ?? 20, MAX_PAGE_SIZE);

    const where = {
      companyId,
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' as const } },
              { document: { contains: params.search } },
              { email: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getWithHistory(companyId: string, customerId: string) {
    const customer = await this.getOwned(companyId, customerId);
    const charges = await this.prisma.charge.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { ...customer, charges };
  }

  /** Garante que o cliente pertence à empresa do contexto autenticado — nunca confia apenas no ID da URL. */
  private async getOwned(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
    return customer;
  }
}
