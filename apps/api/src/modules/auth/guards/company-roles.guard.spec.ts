import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { CompanyRolesGuard } from './company-roles.guard';
import { PrismaService } from '../../../prisma/prisma.service';

function mockExecutionContext(params: { userId?: string; companyId?: string; headerCompanyId?: string }): ExecutionContext {
  const request = {
    user: params.userId ? { id: params.userId } : undefined,
    params: { companyId: params.companyId },
    headers: params.headerCompanyId ? { 'x-company-id': params.headerCompanyId } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('CompanyRolesGuard', () => {
  let guard: CompanyRolesGuard;
  let prisma: { companyUser: { findFirst: jest.Mock } };
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(async () => {
    prisma = { companyUser: { findFirst: jest.fn() } };
    reflector = { getAllAndOverride: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompanyRolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = moduleRef.get(CompanyRolesGuard);
  });

  it('permite acesso quando a rota não declara nenhum papel exigido', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = mockExecutionContext({ userId: 'user-1', companyId: 'company-1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.companyUser.findFirst).not.toHaveBeenCalled();
  });

  it('bloqueia quando não há usuário autenticado ou companyId no contexto', async () => {
    reflector.getAllAndOverride.mockReturnValue(['OWNER']);
    const ctx = mockExecutionContext({ companyId: 'company-1' }); // sem userId

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('bloqueia quando o usuário não tem vínculo algum com a empresa (isolamento de tenant)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['OWNER', 'ADMIN']);
    prisma.companyUser.findFirst.mockResolvedValue(null); // sem vínculo
    const ctx = mockExecutionContext({ userId: 'user-1', companyId: 'company-de-outra-empresa' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(prisma.companyUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', companyId: 'company-de-outra-empresa', removedAt: null },
      }),
    );
  });

  it('bloqueia quando o vínculo existe mas o papel não está na lista permitida', async () => {
    reflector.getAllAndOverride.mockReturnValue(['OWNER', 'ADMIN']);
    prisma.companyUser.findFirst.mockResolvedValue({ role: 'VIEWER' });
    const ctx = mockExecutionContext({ userId: 'user-1', companyId: 'company-1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('permite quando o vínculo existe e o papel está autorizado, anexando o contexto de empresa', async () => {
    reflector.getAllAndOverride.mockReturnValue(['OWNER', 'ADMIN']);
    prisma.companyUser.findFirst.mockResolvedValue({ role: 'ADMIN' });
    const ctx = mockExecutionContext({ userId: 'user-1', companyId: 'company-1' });

    const request = ctx.switchToHttp().getRequest();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((request as any).companyContext).toEqual({ companyId: 'company-1', role: 'ADMIN' });
  });
});
