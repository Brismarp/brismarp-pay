import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CompanyRolesGuard } from '../../auth/guards/company-roles.guard';
import { CompanyRoles } from '../../auth/guards/company-roles.decorator';
import { LedgerService } from '../services/ledger.service';
import { PrismaService } from '../../../prisma/prisma.service';

const MAX_PAGE_SIZE = 100;

@Controller('companies/:companyId/ledger')
@UseGuards(JwtAuthGuard, CompanyRolesGuard)
export class LedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('balance')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'VIEWER')
  async getBalance(@Param('companyId') companyId: string) {
    const availableBalanceCents = await this.ledgerService.getCurrentBalance(companyId);
    return { availableBalanceCents };
  }

  @Get('entries')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'VIEWER')
  async listEntries(
    @Param('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = Math.max(page ? parseInt(page, 10) : 1, 1);
    const size = Math.min(pageSize ? parseInt(pageSize, 10) : 20, MAX_PAGE_SIZE);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      this.prisma.ledgerEntry.count({ where: { companyId } }),
    ]);

    return { items, total, page: pageNum, pageSize: size, totalPages: Math.ceil(total / size) };
  }
}
