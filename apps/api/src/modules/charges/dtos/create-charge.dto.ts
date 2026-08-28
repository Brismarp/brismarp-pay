import { IsEnum, IsInt, Min, IsOptional, IsString, IsUUID, IsObject, Max } from 'class-validator';

export enum ChargeMethodDto {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  BOLETO = 'BOLETO',
}

export class CreateChargeDto {
  @IsEnum(ChargeMethodDto)
  method: ChargeMethodDto;

  @IsInt()
  @Min(100) // valor mínimo R$1,00 — evita cobranças de centavos por engano/abuso
  amountCents: number;

  @IsUUID()
  customerId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;

  // Se não enviado, o backend gera uma chave determinística — mas o cliente da API é
  // fortemente encorajado a enviar a sua própria para garantir idempotência mesmo
  // em caso de timeout de rede antes de receber a resposta.
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
