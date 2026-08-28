import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from '../services/api-keys.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();
    const header = request.headers['x-api-key'] ?? request.headers.authorization;
    const rawKey = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '').trim() : '';
    if (!rawKey) throw new UnauthorizedException('API Key ausente.');
    const key = await this.apiKeys.authenticate(rawKey);
    if (!key) throw new UnauthorizedException('API Key inválida ou revogada.');
    request.apiKey = { id: key.id, environment: key.environment, scopes: key.scopes };
    request.companyContext = { companyId: key.companyId, role: 'API_KEY' };
    return true;
  }
}
