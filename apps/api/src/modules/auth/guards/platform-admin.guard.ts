import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

/**
 * Protege toda rota do painel administrativo (/admin/*).
 * Usuários comuns de empresa, mesmo com role OWNER, nunca passam por este guard —
 * isPlatformAdmin é um flag totalmente separado do RBAC de empresa.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException('Acesso restrito à administração da plataforma.');
    }
    return true;
  }
}
