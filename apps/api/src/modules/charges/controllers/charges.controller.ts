import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CompanyRolesGuard } from '../../auth/guards/company-roles.guard';
import { CompanyRoles } from '../../auth/guards/company-roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ChargesService } from '../services/charges.service';
import { CreateChargeDto } from '../dtos/create-charge.dto';
import { ChargeStatus } from '@prisma/client';

@Controller('companies/:companyId/charges')
@UseGuards(JwtAuthGuard, CompanyRolesGuard)
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Post()
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR')
  create(
    @Param('companyId') companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateChargeDto,
  ) {
    return this.chargesService.create(companyId, user.id, dto);
  }

  @Get()
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR', 'VIEWER')
  list(
    @Param('companyId') companyId: string,
    @Query('status') status?: ChargeStatus,
    @Query('method') method?: string,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'amountCents',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.chargesService.list(companyId, {
      status,
      method,
      customerId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get(':chargeId/status')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR', 'VIEWER')
  getStatus(@Param('companyId') companyId: string, @Param('chargeId') chargeId: string) {
    return this.chargesService.getStatus(companyId, chargeId);
  }

  @Get(':chargeId')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR', 'VIEWER')
  getOne(@Param('companyId') companyId: string, @Param('chargeId') chargeId: string) {
    return this.chargesService.getWithTimeline(companyId, chargeId);
  }

  @Patch(':chargeId/cancel')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE')
  cancel(
    @Param('companyId') companyId: string,
    @Param('chargeId') chargeId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chargesService.cancel(companyId, chargeId, user.id);
  }

  /**
   * Sandbox-only: simula a confirmação de um PIX/boleto pendente.
   * Não existe em produção — lá a confirmação vem do webhook real do provider.
   */
  @Patch(':chargeId/simulate-confirmation')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR')
  simulateConfirmation(
    @Param('companyId') companyId: string,
    @Param('chargeId') chargeId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chargesService.simulatePixConfirmation(companyId, chargeId, user.id);
  }
}
