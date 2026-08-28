import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma, LedgerEntryType } from '@prisma/client';

/**
 * Único ponto do sistema autorizado a gravar em LedgerEntry.
 * Nenhum controller, DTO ou requisição HTTP escreve saldo diretamente —
 * tudo passa por append(), sempre dentro de uma transação de banco,
 * sempre calculando o saldo a partir do último lançamento real (nunca de um
 * campo solto que poderia divergir do histórico).
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      type: LedgerEntryType;
      amountCents: number; // sempre positivo; o sinal é definido pelo `type`
      referenceType: string;
      referenceId?: string;
      description: string;
      performedBy: string;
    },
  ) {
    const lastEntry = await tx.ledgerEntry.findFirst({
      where: { companyId: params.companyId },
      orderBy: { createdAt: 'desc' },
    });

    const currentBalance = lastEntry?.balanceAfterCents ?? 0;
    const isCredit = params.type === 'CREDIT';
    const delta = isCredit ? params.amountCents : -params.amountCents;
    const balanceAfterCents = currentBalance + delta;

    return tx.ledgerEntry.create({
      data: {
        companyId: params.companyId,
        type: params.type,
        amountCents: params.amountCents,
        balanceAfterCents,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        description: params.description,
        performedBy: params.performedBy,
      },
    });
  }

  async getCurrentBalance(companyId: string): Promise<number> {
    const lastEntry = await this.prisma.ledgerEntry.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    return lastEntry?.balanceAfterCents ?? 0;
  }
}
