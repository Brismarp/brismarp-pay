import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { hasApiKeyCredential } from './api-key-credential';

/**
 * Cobranças e clientes aceitam JWT do painel ou API Key da integração.
 * Se X-Api-Key (ou Bearer bpay_sandbox_/bpay_production_) estiver presente,
 * nunca valida o valor como JWT.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyAuth: ApiKeyAuthGuard,
    private readonly jwtAuth: JwtAuthGuard,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (hasApiKeyCredential(request)) {
      return this.apiKeyAuth.canActivate(context);
    }
    return this.jwtAuth.canActivate(context);
  }
}
