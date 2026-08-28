import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: {
    customer: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    charge: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      customer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      charge: { findMany: jest.fn() },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CustomersService);
  });

  it('cria cliente vinculado à empresa autenticada', async () => {
    prisma.customer.create.mockResolvedValue({ id: 'cust-1', companyId: 'company-1', name: 'Ana' });

    await service.create('company-1', { name: 'Ana', document: '12345678900' });

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: { companyId: 'company-1', name: 'Ana', document: '12345678900' },
    });
  });

  it('update retorna 404 quando o cliente é de outra empresa', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.update('company-1', 'cust-other', { name: 'Novo' })).rejects.toThrow(NotFoundException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('listagem sempre filtra por companyId, inclusive com busca', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.list('company-1', { search: 'ana' });

    const findArgs = prisma.customer.findMany.mock.calls[0][0];
    expect(findArgs.where.companyId).toBe('company-1');
    expect(findArgs.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.objectContaining({ contains: 'ana' }) }),
      ]),
    );
  });
});
