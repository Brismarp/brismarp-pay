import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from './create-test-app';

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

function cookieHeader(setCookie: string[] | string | undefined): string {
  const list = !setCookie ? [] : Array.isArray(setCookie) ? setCookie : [setCookie];
  return list.map((part) => part.split(';')[0]).join('; ');
}

function cnpjFromSeed(seed: number): string {
  const base = String(seed).padStart(12, '1').slice(-12);
  const digit = (value: string, weights: number[]) => {
    const sum = [...value].reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const d1 = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digit(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + String(d1) + String(d2);
}

describeIfInfra('Fluxos críticos (E2E com PostgreSQL + Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now();
  const userEmail = `teste.e2e.${uniqueSuffix}@brismarpay.com`;
  const userPassword = 'SenhaForte123';
  const companyCnpj = cnpjFromSeed(uniqueSuffix);

  let accessToken: string;
  let companyId: string;
  let customerId: string;
  let chargeId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.REDIS_URL = TEST_REDIS_URL;

    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      if (companyId) await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
      await prisma.user.delete({ where: { email: userEmail } }).catch(() => undefined);
    }
    if (app) await app.close();
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

  it('4b. Edição de cliente atualiza nome e e-mail', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/companies/${companyId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Cliente Editado', email: 'editado@teste.com' })
      .expect(200);

    expect(res.body.name).toBe('Cliente Editado');
    expect(res.body.email).toBe('editado@teste.com');
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

  it('8b. Estorno integral marca a cobrança como REFUNDED', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/companies/${companyId}/charges/${chargeId}/refund`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'e2e' })
      .expect(200);

    expect(res.body.status).toBe('REFUNDED');
  });

  it('8c. Segundo estorno é rejeitado', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/companies/${companyId}/charges/${chargeId}/refund`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);
  });

  it('8d. PIX pendente pode ser confirmado no sandbox', async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/charges`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ method: 'PIX', amountCents: 2500, customerId, idempotencyKey: `e2e-pix-${uniqueSuffix}` })
      .expect(201);

    expect(created.body.status).toBe('PENDING');

    const confirmed = await request(app.getHttpServer())
      .patch(`/v1/companies/${companyId}/charges/${created.body.id}/simulate-confirmation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(confirmed.body.status).toBe('APPROVED');
  });

  it('8e. Dashboard inclui o estorno no período', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/companies/${companyId}/dashboard/summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.refundCount).toBeGreaterThanOrEqual(1);
  });

  it('8f. Refresh com cookie HttpOnly emite novo access token', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: userEmail, password: userPassword })
      .expect(200);

    const cookies = cookieHeader(login.headers['set-cookie']);
    expect(cookies).toContain('bpay_refresh_token=');

    const refreshed = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('Cookie', cookies)
      .send({})
      .expect(200);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));
  });

  it('8g. Logout invalida o refresh cookie', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: userEmail, password: userPassword })
      .expect(200);

    const cookies = cookieHeader(login.headers['set-cookie']);

    await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookies).send({}).expect(200);

    await request(app.getHttpServer()).post('/v1/auth/refresh').set('Cookie', cookies).send({}).expect(401);
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
