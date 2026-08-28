import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { COMPANY_ROLES_KEY } from './company-roles.decorator';

/**
 * Garante duas coisas em toda rota protegida por este guard:
 * 1. O usuário autenticado pertence à empresa referenciada na rota (isolamento de tenant).
 * 2. O papel do usuário na empresa está na lista de papéis permitidos para a ação.
 *
 * Nunca confia em company_id vindo do body/query — sempre cruza com o vínculo real no banco.
 */
@Injectable()
export class CompanyRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(COMPANY_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const companyId = request.params.companyId ?? request.headers['x-company-id'];

    if (!user || !companyId) {
      throw new ForbiddenException('Contexto de empresa ausente.');
    }

    const membership = await this.prisma.companyUser.findFirst({
      where: { userId: user.id, companyId, removedAt: null },
    });

    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Você não tem permissão para executar esta ação nesta empresa.');
    }

    // Disponibiliza o contexto de empresa/papel para os controllers/services subsequentes.
    request.companyContext = { companyId, role: membership.role };
    return true;
  }
}
