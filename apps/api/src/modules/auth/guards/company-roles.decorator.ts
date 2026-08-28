import { SetMetadata } from '@nestjs/common';

export const COMPANY_ROLES_KEY = 'companyRoles';

/**
 * Uso: @CompanyRoles('OWNER', 'ADMIN')
 * Combinar sempre com @UseGuards(JwtAuthGuard | JwtOrApiKeyGuard, CompanyRolesGuard).
 */
export const CompanyRoles = (...roles: string[]) => SetMetadata(COMPANY_ROLES_KEY, roles);
