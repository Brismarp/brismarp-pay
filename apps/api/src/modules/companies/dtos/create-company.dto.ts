import { Type } from 'class-transformer';
import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  ValidateNested,
  IsBoolean,
  Equals,
  Matches,
  IsIn,
} from 'class-validator';
import { IsCnpj } from '../../../shared/validators/is-cnpj.decorator';

class AddressDto {
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido.' })
  zipCode: string;

  @IsString()
  @MinLength(2)
  street: string;

  @IsString()
  number: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  district: string;

  @IsString()
  city: string;

  @IsString()
  @MaxLength(2)
  state: string;
}

class BankAccountDto {
  @IsString()
  bankCode: string;

  @IsString()
  agency: string;

  @IsString()
  account: string;

  @IsIn(['checking', 'savings'])
  accountType: 'checking' | 'savings';

  @IsString()
  holderDocument: string;
}

export class CreateCompanyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string;

  @IsCnpj()
  cnpj: string;

  @IsEmail()
  businessEmail: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  // Dados bancários são opcionais nesta etapa — podem ser exigidos apenas quando
  // a empresa solicitar a primeira transferência (fase futura), mas o cadastro já
  // suporta o envio antecipado.
  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount?: BankAccountDto;

  // Aceite explícito e obrigatório — não é possível prosseguir sem marcar ambos.
  @IsBoolean()
  @Equals(true, { message: 'É necessário aceitar os termos de uso para continuar.' })
  termsAccepted: boolean;

  @IsBoolean()
  @Equals(true, { message: 'É necessário aceitar a política de privacidade para continuar.' })
  privacyAccepted: boolean;
}
