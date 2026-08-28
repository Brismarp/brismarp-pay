import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCnpj } from './cnpj.validator';

export function IsCnpj(validationOptions?: ValidationOptions) {
  return function (object: unknown, propertyName: string) {
    registerDecorator({
      name: 'isCnpj',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isValidCnpj(value);
        },
        defaultMessage() {
          return 'CNPJ inválido.';
        },
      },
    });
  };
}
