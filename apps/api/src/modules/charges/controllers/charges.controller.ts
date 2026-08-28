import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrApiKeyGuard } from '../../api-keys/guards/jwt-or-api-key.guard';
import { CompanyRolesGuard } from '../../auth/guards/company-roles.guard';
import { CompanyRoles } from '../../auth/guards/company-roles.decorator';
import { RequireScopes } from '../../auth/guards/require-scopes.decorator';
import { CurrentActor, RequestActor } from '../../auth/decorators/current-actor.decorator';
import { ChargesService } from '../services/charges.service';
import { CreateChargeDto } from '../dtos/create-charge.dto';
import { RefundChargeDto } from '../dtos/refund-charge.dto';
import { ChargeStatus } from '@prisma/client';

@Controller('companies/:companyId/charges')
@UseGuards(JwtOrApiKeyGuard, CompanyRolesGuard)
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Post()
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR')
  @RequireScopes('charges:write')
  create(
    @Param('companyId') companyId: string,
    @CurrentActor() actor: RequestActor,
    @Body() dto: CreateChargeDto,
  ) {
    return this.chargesService.create(companyId, actor, dto);
  }

  @Get()
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR', 'VIEWER')
  @RequireScopes('charges:read')
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
  @RequireScopes('charges:read')
  getStatus(@Param('companyId') companyId: string, @Param('chargeId') chargeId: string) {
    return this.chargesService.getStatus(companyId, chargeId);
  }

  @Get(':chargeId')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR', 'VIEWER')
  @RequireScopes('charges:read')
  getOne(@Param('companyId') companyId: string, @Param('chargeId') chargeId: string) {
    return this.chargesService.getWithTimeline(companyId, chargeId);
  }

  @Patch(':chargeId/cancel')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE')
  @RequireScopes('charges:write')
  cancel(
    @Param('companyId') companyId: string,
    @Param('chargeId') chargeId: string,
    @CurrentActor() actor: RequestActor,
  ) {
    return this.chargesService.cancel(companyId, chargeId, actor);
  }

  @Patch(':chargeId/refund')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE')
  @RequireScopes('charges:write')
  refund(
    @Param('companyId') companyId: string,
    @Param('chargeId') chargeId: string,
    @CurrentActor() actor: RequestActor,
    @Body() dto: RefundChargeDto,
  ) {
    return this.chargesService.refund(companyId, chargeId, actor, dto.reason);
  }

  /**
   * Sandbox-only: simula a confirmação de um PIX/boleto pendente.
   * Não existe em produção — lá a confirmação vem do webhook real do provider.
   * API Keys de PRODUCTION não podem chamar este endpoint.
   */
  @Patch(':chargeId/simulate-confirmation')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR')
  @RequireScopes('charges:write')
  simulateConfirmation(
    @Param('companyId') companyId: string,
    @Param('chargeId') chargeId: string,
    @CurrentActor() actor: RequestActor,
    @Req() request: { apiKey?: { environment?: string } },
  ) {
    if (request.apiKey && request.apiKey.environment !== 'SANDBOX') {
      throw new ForbiddenException('Simulação disponível apenas com API Key de sandbox.');
    }
    return this.chargesService.simulatePixConfirmation(companyId, chargeId, actor);
  }
}
