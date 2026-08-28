import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Testes E2E dos fluxos críticos definidos no escopo (seção 20):
 * cadastro → login → onboarding → criação de cliente → criação de cobrança →
 * consulta de transação → cancelamento.
 *
 * Estes testes rodam contra um banco Postgres REAL (não mockado) — são testes de
 * integração de verdade, não unitários. Por isso exigem TEST_DATABASE_URL e TEST_REDIS_URL
 * apontando para infraestrutura descartável de testes (nunca a de desenvolvimento/produção).
 *
 * Se TEST_DATABASE_URL ou TEST_REDIS_URL não estiverem definidas, a suíte inteira é pulada (não falha) —
 * isso é intencional: ambientes sem Postgres disponível (ex: CI ainda não configurado,
 * ou execução isolada de unit tests) não devem quebrar por falta de infraestrutura.
 *
 * Como rodar:
 *   docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=brismar_pay_test postgres:16-alpine
 *   TEST_DATABASE_URL=postgresql://postgres:test@localhost:5433/brismar_pay_test \
 *   TEST_REDIS_URL=redis://localhost:6380 \
 *     JWT_SECRET=test-secret-not-for-production \
 *     npx prisma migrate deploy --schema=../../packages/database/schema.prisma
 *   TEST_DATABASE_URL=... JWT_SECRET=... npm run test:e2e
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const describeIfInfra = TEST_DATABASE_URL && TEST_REDIS_URL ? describe : describe.skip;

describeIfInfra('Fluxos críticos (E2E com PostgreSQL + Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now();
  const userEmail = `teste.e2e.${uniqueSuffix}@brismarpay.com`;
  const userPassword = 'SenhaForte123';
  const companyCnpj = '11222333000181'; // CNPJ de exemplo com dígitos verificadores válidos

  let accessToken: string;
  let companyId: string;
  let customerId: string;
  let chargeId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.REDIS_URL = TEST_REDIS_URL;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('v1');
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Limpeza do usuário/empresa de teste — não deixa lixo acumulando no banco de teste.
    if (companyId) await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await prisma.user.delete({ where: { email: userEmail } }).catch(() => undefined);
    await app.close();
  });

  it('1. Cadastro: cria conta e retorna access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ name: 'Usuário Teste E2E', email: userEmail, password: userPassword })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    accessToken = res.body.accessToken;
  });

  it('2. Login: autentica com as credenciais recém-criadas', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: userEmail, password: userPassword })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    accessToken = res.body.accessToken;
  });

  it('2b. Login com senha errada é rejeitado', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: userEmail, password: 'senhaErrada' })
      .expect(401);
  });

  it('3. Onboarding: cria a empresa e vincula o usuário como OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/companies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        legalName: 'Empresa Teste E2E LTDA',
        cnpj: companyCnpj,
        businessEmail: userEmail,
        address: {
          zipCode: '01310-100',
          street: 'Av. Paulista',
          number: '1000',
          district: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        },
        termsAccepted: true,
        privacyAccepted: true,
      })
      .expect(201);

    expect(res.body.status).toBe('PENDING_KYB');
    companyId = res.body.id;
  });

  it('3b. Onboarding rejeita CNPJ inválido', async () => {
    await request(app.getHttpServer())
      .post('/v1/companies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        legalName: 'Empresa Inválida',
        cnpj: '00000000000000',
        businessEmail: userEmail,
        address: {
          zipCode: '01310-100',
          street: 'Av. Paulista',
          number: '1000',
          district: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        },
        termsAccepted: true,
        privacyAccepted: true,
      })
      .expect(400);
  });

  it('4. Criação de cliente', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/customers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Cliente Teste', document: '12345678900', email: 'cliente@teste.com' })
      .expect(201);

    customerId = res.body.id;
    expect(customerId).toEqual(expect.any(String));
  });

  it('5. Criação de cobrança (cartão, aprovada pelo mock provider)', async () => {
    const idempotencyKey = `e2e-${uniqueSuffix}`;

    const res = await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/charges`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ method: 'CREDIT_CARD', amountCents: 5000, customerId, idempotencyKey })
      .expect(201);

    chargeId = res.body.id;
    expect(res.body.status).toBe('APPROVED');
  });

  it('5a. Consulta de status usa o estado assíncrono Redis', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/companies/${companyId}/charges/${chargeId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.paymentId).toBe(chargeId);
    expect(res.body.status).toBe('APPROVED');
  });

  it('5b. Idempotência: reenviar a mesma chave não cria uma segunda cobrança', async () => {
    const idempotencyKey = `e2e-${uniqueSuffix}`;

    const res = await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/charges`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ method: 'CREDIT_CARD', amountCents: 5000, customerId, idempotencyKey })
      .expect(201);

    expect(res.body.id).toBe(chargeId);

    const charges = await prisma.charge.findMany({ where: { companyId, idempotencyKey } });
    expect(charges).toHaveLength(1);
  });

  it('6. Consulta de transação: saldo reflete a cobrança aprovada', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/companies/${companyId}/ledger/balance`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.availableBalanceCents).toBeGreaterThan(0);
  });

  it('7. Timeline da cobrança tem ao menos o evento de criação', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/companies/${companyId}/charges/${chargeId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.events.length).toBeGreaterThanOrEqual(1);
  });

  it('8. Cancelamento é rejeitado para cobrança já aprovada', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/companies/${companyId}/charges/${chargeId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('9. Isolamento de tenant: outro usuário não vinculado não acessa a empresa', async () => {
    const outroEmail = `outro.${uniqueSuffix}@brismarpay.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ name: 'Outro Usuário', email: outroEmail, password: userPassword })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/companies/${companyId}/customers`)
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .expect(403);

    await prisma.user.delete({ where: { email: outroEmail } }).catch(() => undefined);
  });
});
