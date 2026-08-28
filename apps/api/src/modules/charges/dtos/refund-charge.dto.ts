import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundChargeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
