import { isValidCnpj, normalizeCnpj } from './cnpj.validator';

describe('isValidCnpj', () => {
  it('aceita um CNPJ válido conhecido (formatado)', () => {
    // 11.222.333/0001-81 é um CNPJ de dígitos verificadores válidos, amplamente
    // usado como exemplo em documentação pública — não corresponde a empresa real.
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('aceita o mesmo CNPJ sem formatação', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('rejeita CNPJ com dígito verificador incorreto', () => {
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
  });

  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('rejeita CNPJ com quantidade de dígitos incorreta', () => {
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('112223330001811')).toBe(false); // 15 dígitos
  });

  it('rejeita strings vazias ou não numéricas', () => {
    expect(isValidCnpj('')).toBe(false);
    expect(isValidCnpj('abcd efgh ijkl')).toBe(false);
  });
});

describe('normalizeCnpj', () => {
  it('remove pontuação, mantendo apenas dígitos', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('mantém string já normalizada inalterada', () => {
    expect(normalizeCnpj('11222333000181')).toBe('11222333000181');
  });
});
