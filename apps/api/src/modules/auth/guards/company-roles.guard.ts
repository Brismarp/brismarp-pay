import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { COMPANY_ROLES_KEY } from './company-roles.decorator';
import { REQUIRE_SCOPES_KEY } from './require-scopes.decorator';

/**
 * Garante isolamento de tenant e autorização:
 * - JWT: o usuário pertence à empresa da rota e o papel está em @CompanyRoles.
 * - API Key: a chave pertence à empresa da rota e cobre @RequireScopes (fail closed).
 *
 * Nunca confia em company_id vindo do body/query — sempre cruza com o vínculo real
 * (membership) ou com o companyId persistido na API Key.
 */
@Injectable()
export class CompanyRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const companyId = request.params.companyId ?? request.headers['x-company-id'];

    if (request.apiKey) {
      return this.authorizeApiKey(context, request, companyId);
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(COMPANY_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const user = request.user;

    if (!user || !companyId) {
      throw new ForbiddenException('Contexto de empresa ausente.');
    }

    const membership = await this.prisma.companyUser.findFirst({
      where: { userId: user.id, companyId, removedAt: null },
    });

    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Você não tem permissão para executar esta ação nesta empresa.');
    }

    request.companyContext = { companyId, role: membership.role };
    return true;
  }

  private authorizeApiKey(context: ExecutionContext, request: any, companyId: string | undefined): boolean {
    const keyCompanyId = request.apiKey.companyId ?? request.companyContext?.companyId;
    if (!companyId || !keyCompanyId || companyId !== keyCompanyId) {
      throw new ForbiddenException('A API Key não pertence a esta empresa.');
    }

    const requiredScopes = this.reflector.getAllAndOverride<string[]>(REQUIRE_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredScopes || requiredScopes.length === 0) {
      throw new ForbiddenException('Esta rota não aceita autenticação por API Key.');
    }

    const granted: string[] = request.apiKey.scopes ?? [];
    const missing = requiredScopes.filter((scope) => !granted.includes(scope));
    if (missing.length) {
      throw new ForbiddenException('A API Key não possui os escopos necessários.');
    }

    request.companyContext = { companyId, role: 'API_KEY' };
    return true;
  }
}
