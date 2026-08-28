import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminCompaniesService } from './admin-companies.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { KybDecisionDto, AdminCompanyStatusDto } from '../dtos/admin.dto';

describe('AdminCompaniesService', () => {
  let service: AdminCompaniesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn(), update: jest.fn() },
      complianceRecord: { findUnique: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AdminCompaniesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AdminCompaniesService);
  });

  describe('updateStatus', () => {
    it('rejeita empresa inexistente', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('company-x', { status: AdminCompanyStatusDto.BLOCKED }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('registra audit log com o status anterior e o novo', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' });
      prisma.company.update.mockResolvedValue({ id: 'company-1', status: 'SUSPENDED' });

      await service.updateStatus(
        'company-1',
        { status: AdminCompanyStatusDto.SUSPENDED, reason: 'Atividade suspeita' },
        'admin-1',
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorUserId: 'admin-1',
            action: 'admin.company.status_change',
            metadata: { from: 'ACTIVE', to: 'SUSPENDED', reason: 'Atividade suspeita' },
          }),
        }),
      );
    });
  });

  describe('reviewKyb', () => {
    it('rejeita quando não existe registro de compliance para a empresa', async () => {
      prisma.complianceRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.reviewKyb('company-1', { decision: KybDecisionDto.APPROVED }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita reavaliar um KYB já aprovado', async () => {
      prisma.complianceRecord.findUnique.mockResolvedValue({ status: 'APPROVED' });

      await expect(
        service.reviewKyb('company-1', { decision: KybDecisionDto.APPROVED }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('aprovação ativa a empresa automaticamente (PENDING_KYB -> ACTIVE)', async () => {
      prisma.complianceRecord.findUnique.mockResolvedValue({ status: 'NOT_STARTED' });
      prisma.complianceRecord.update.mockResolvedValue({ status: 'APPROVED' });
      prisma.company.update.mockResolvedValue({ status: 'ACTIVE' });

      await service.reviewKyb('company-1', { decision: KybDecisionDto.APPROVED, notes: 'Documentos ok' }, 'admin-1');

      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'company-1' }, data: { status: 'ACTIVE' } }),
      );
    });

    it('rejeição NÃO altera o status da empresa', async () => {
      prisma.complianceRecord.findUnique.mockResolvedValue({ status: 'NOT_STARTED' });
      prisma.complianceRecord.update.mockResolvedValue({ status: 'REJECTED' });

      await service.reviewKyb('company-1', { decision: KybDecisionDto.REJECTED, notes: 'CNPJ divergente' }, 'admin-1');

      expect(prisma.company.update).not.toHaveBeenCalled();
    });
  });
});
