import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AdminCompanyStatusDto {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BLOCKED = 'BLOCKED',
}

export class UpdateCompanyStatusDto {
  @IsEnum(AdminCompanyStatusDto)
  status: AdminCompanyStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export enum KybDecisionDto {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ReviewKybDto {
  @IsEnum(KybDecisionDto)
  decision: KybDecisionDto;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
