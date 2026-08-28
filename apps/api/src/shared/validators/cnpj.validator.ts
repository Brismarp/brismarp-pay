/**
 * Validação de CNPJ pelo algoritmo padrão de dígitos verificadores.
 * Não consulta nenhuma base externa (Receita Federal) — apenas valida o formato/checksum.
 * Validação de existência real da empresa fica a cargo do processo de KYB (fase futura, manual ou via provedor externo).
 */
export function isValidCnpj(rawCnpj: string): boolean {
  const cnpj = rawCnpj.replace(/[^\d]/g, '');

  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // todos os dígitos iguais

  const calcCheckDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split('')
      .reduce((acc, digit, index) => acc + parseInt(digit, 10) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const weightsFirst = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weightsSecond = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const firstDigit = calcCheckDigit(cnpj.slice(0, 12), weightsFirst);
  const secondDigit = calcCheckDigit(cnpj.slice(0, 12) + firstDigit, weightsSecond);

  return cnpj === cnpj.slice(0, 12) + String(firstDigit) + String(secondDigit);
}

export function normalizeCnpj(rawCnpj: string): string {
  return rawCnpj.replace(/[^\d]/g, '');
}
