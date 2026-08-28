import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { JwtOrApiKeyGuard } from './jwt-or-api-key.guard';

function mockContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtOrApiKeyGuard', () => {
  let guard: JwtOrApiKeyGuard;
  let apiKeyAuth: { canActivate: jest.Mock };
  let jwtAuth: { canActivate: jest.Mock };

  beforeEach(async () => {
    apiKeyAuth = { canActivate: jest.fn().mockResolvedValue(true) };
    jwtAuth = { canActivate: jest.fn().mockResolvedValue(true) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtOrApiKeyGuard,
        { provide: ApiKeyAuthGuard, useValue: apiKeyAuth },
        { provide: JwtAuthGuard, useValue: jwtAuth },
      ],
    }).compile();

    guard = moduleRef.get(JwtOrApiKeyGuard);
  });

  it('usa API Key quando X-Api-Key está presente', async () => {
    const ctx = mockContext({ 'x-api-key': 'bpay_sandbox_abc' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(apiKeyAuth.canActivate).toHaveBeenCalledWith(ctx);
    expect(jwtAuth.canActivate).not.toHaveBeenCalled();
  });

  it('usa API Key quando Bearer começa com bpay_sandbox_ ou bpay_production_', async () => {
    const ctx = mockContext({ authorization: 'Bearer bpay_production_xyz' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(apiKeyAuth.canActivate).toHaveBeenCalledWith(ctx);
    expect(jwtAuth.canActivate).not.toHaveBeenCalled();
  });

  it('usa JWT quando Authorization é um access token (não bpay_)', async () => {
    const ctx = mockContext({ authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwtAuth.canActivate).toHaveBeenCalledWith(ctx);
    expect(apiKeyAuth.canActivate).not.toHaveBeenCalled();
  });

  it('usa JWT quando não há credencial de API Key', async () => {
    const ctx = mockContext({});

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwtAuth.canActivate).toHaveBeenCalledWith(ctx);
    expect(apiKeyAuth.canActivate).not.toHaveBeenCalled();
  });
});
