import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { ApiKeysService } from '../services/api-keys.service';

function mockContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let apiKeys: { authenticate: jest.Mock };

  beforeEach(async () => {
    apiKeys = { authenticate: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [ApiKeyAuthGuard, { provide: ApiKeysService, useValue: apiKeys }],
    }).compile();
    guard = moduleRef.get(ApiKeyAuthGuard);
  });

  it('rejeita quando a API Key está ausente', async () => {
    await expect(guard.canActivate(mockContext({}))).rejects.toThrow(UnauthorizedException);
    expect(apiKeys.authenticate).not.toHaveBeenCalled();
  });

  it('rejeita chave inválida ou revogada', async () => {
    apiKeys.authenticate.mockResolvedValue(null);
    await expect(guard.canActivate(mockContext({ 'x-api-key': 'bpay_sandbox_x' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('anexa apiKey e companyContext quando a chave é válida', async () => {
    apiKeys.authenticate.mockResolvedValue({
      id: 'key-1',
      companyId: 'company-1',
      environment: 'SANDBOX',
      scopes: ['charges:read'],
    });
    const ctx = mockContext({ 'x-api-key': 'bpay_sandbox_valid' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const request = ctx.switchToHttp().getRequest();
    expect(request.apiKey).toEqual({
      id: 'key-1',
      companyId: 'company-1',
      environment: 'SANDBOX',
      scopes: ['charges:read'],
    });
    expect(request.companyContext).toEqual({ companyId: 'company-1', role: 'API_KEY' });
  });
});
