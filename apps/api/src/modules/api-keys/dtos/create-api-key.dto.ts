import { IsArray, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export enum ApiKeyEnvironmentDto {
  SANDBOX = 'SANDBOX',
  PRODUCTION = 'PRODUCTION',
}

// Escopos sugeridos — ajustar conforme os recursos reais expostos pela API pública
// quando ela for implementada (ex: 'charges:read', 'charges:write', 'customers:read'...).
export const AVAILABLE_SCOPES = [
  'charges:read',
  'charges:write',
  'customers:read',
  'customers:write',
  'ledger:read',
  'webhooks:manage',
] as const;

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsEnum(ApiKeyEnvironmentDto)
  environment: ApiKeyEnvironmentDto;

  @IsArray()
  @IsString({ each: true })
  scopes: string[];
}
