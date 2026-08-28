import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CompanyRolesGuard } from '../../auth/guards/company-roles.guard';
import { CompanyRoles } from '../../auth/guards/company-roles.decorator';
import { DashboardService } from '../services/dashboard.service';

@Controller('companies/:companyId/dashboard')
@UseGuards(JwtAuthGuard, CompanyRolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR', 'VIEWER')
  async getSummary(
    @Param('companyId') companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = this.parseDate(from);
    const toDate = this.parseDate(to);
    return this.dashboardService.getSummary(companyId, fromDate, toDate);
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Data inválida: "${value}". Use o formato ISO (YYYY-MM-DD).`);
    }
    return parsed;
  }
}
