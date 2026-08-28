import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CompanyRolesGuard } from '../../auth/guards/company-roles.guard';
import { CompanyRoles } from '../../auth/guards/company-roles.decorator';
import { ApiKeysService } from '../services/api-keys.service';
import { CreateApiKeyDto } from '../dtos/create-api-key.dto';

/**
 * Rotas administrativas de API Keys (OWNER/ADMIN/DEVELOPER).
 * O segredo completo só é devolvido na geração ou rotação.
 */
@Controller('companies/:companyId/api-keys')
@UseGuards(JwtAuthGuard, CompanyRolesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @CompanyRoles('OWNER', 'ADMIN', 'DEVELOPER')
  create(@Param('companyId') companyId: string, @Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.generate(companyId, dto);
  }

  @Get()
  @CompanyRoles('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER')
  list(@Param('companyId') companyId: string) {
    return this.apiKeysService.list(companyId);
  }

  @Delete(':apiKeyId')
  @CompanyRoles('OWNER', 'ADMIN', 'DEVELOPER')
  revoke(@Param('companyId') companyId: string, @Param('apiKeyId') apiKeyId: string) {
    return this.apiKeysService.revoke(companyId, apiKeyId);
  }

  @Post(':apiKeyId/rotate')
  @CompanyRoles('OWNER', 'ADMIN', 'DEVELOPER')
  rotate(@Param('companyId') companyId: string, @Param('apiKeyId') apiKeyId: string) {
    return this.apiKeysService.rotate(companyId, apiKeyId);
  }
}
