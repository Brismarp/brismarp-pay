import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApiKeyEnvironmentDto } from '../dtos/create-api-key.dto';

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: {
    apiKey: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      apiKey: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ApiKeysService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ApiKeysService);
  });

  it('gera chave com hash SHA-256 e devolve o segredo só na resposta', async () => {
    prisma.apiKey.create.mockImplementation(async ({ data }: { data: { keyHash: string; prefix: string } }) => ({
      id: 'key-1',
      name: 'Integração',
      prefix: data.prefix,
      environment: 'SANDBOX',
      scopes: ['charges:read'],
      createdAt: new Date(),
    }));

    const result = await service.generate('company-1', {
      name: ' Integração ',
      environment: ApiKeyEnvironmentDto.SANDBOX,
      scopes: ['charges:read'],
    });

    expect(result.key).toMatch(/^bpay_sandbox_[a-f0-9]{64}$/);
    const createArgs = prisma.apiKey.create.mock.calls[0][0].data;
    expect(createArgs.keyHash).toBe(hash(result.key));
    expect(createArgs.keyHash).not.toBe(result.key);
    expect(createArgs.name).toBe('Integração');
    expect(createArgs.companyId).toBe('company-1');
  });

  it('rejeita escopos que não estão na lista permitida', async () => {
    await expect(
      service.generate('company-1', {
        name: 'Inválida',
        environment: ApiKeyEnvironmentDto.SANDBOX,
        scopes: ['charges:read', 'admin:all'],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it('rotação revoga a chave atual e cria outra com os mesmos escopos', async () => {
    prisma.apiKey.findFirst.mockResolvedValue({
      id: 'old-key',
      name: 'Integração',
      environment: 'SANDBOX',
      scopes: ['customers:write'],
      revokedAt: null,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn({
        apiKey: {
          update: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({
            id: 'new-key',
            name: 'Integração',
            prefix: 'bpay_sandbox_abc',
            environment: 'SANDBOX',
            scopes: ['customers:write'],
            createdAt: new Date(),
          }),
        },
      } as any),
    );

    const rotated = await service.rotate('company-1', 'old-key');

    expect(rotated.id).toBe('new-key');
    expect(rotated.key).toMatch(/^bpay_sandbox_/);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('authenticate retorna null para chave revogada', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({ id: 'key-1', revokedAt: new Date() });

    await expect(service.authenticate('bpay_sandbox_deadbeef')).resolves.toBeNull();
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });

  it('authenticate retorna null quando o hash não existe', async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null);

    await expect(service.authenticate('bpay_sandbox_unknown')).resolves.toBeNull();
  });

  it('rotate rejeita chave já revogada', async () => {
    prisma.apiKey.findFirst.mockResolvedValue({ id: 'old-key', revokedAt: new Date() });

    await expect(service.rotate('company-1', 'old-key')).rejects.toThrow(ConflictException);
  });

  it('rotate rejeita chave de outra empresa', async () => {
    prisma.apiKey.findFirst.mockResolvedValue(null);

    await expect(service.rotate('company-1', 'missing')).rejects.toThrow(NotFoundException);
  });
});
