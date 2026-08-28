/** Configuração de testes UNITÁRIOS — roda contra src/**, mockando Prisma/dependências externas. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coveragePathIgnorePatterns: ['.module.ts', 'main.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
