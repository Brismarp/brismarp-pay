import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from './create-test-app';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const describeIfInfra = TEST_DATABASE_URL && TEST_REDIS_URL ? describe : describe.skip;

function cnpjFromSeed(seed: number): string {
  const base = String(seed).padStart(12, '3').slice(-12);
  const digit = (value: string, weights: number[]) => {
    const sum = [...value].reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const d1 = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digit(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + String(d1) + String(d2);
}

describeIfInfra('Admin KYB (E2E com PostgreSQL + Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now();
  const adminEmail = `admin.e2e.${uniqueSuffix}@brismarpay.com`;
  const merchantEmail = `merchant.e2e.${uniqueSuffix}@brismarpay.com`;
  const password = 'SenhaForte123';
  const cnpj = cnpjFromSeed(uniqueSuffix);

  let adminToken: string;
  let merchantToken: string;
  let companyId: string;
  let adminUserId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.REDIS_URL = TEST_REDIS_URL;
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      if (companyId) await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
      await prisma.user.delete({ where: { email: adminEmail } }).catch(() => undefined);
      await prisma.user.delete({ where: { email: merchantEmail } }).catch(() => undefined);
    }
    if (app) await app.close();
  });

  it('lojista comum não acessa rotas /admin', async () => {
    const merchant = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ name: 'Lojista', email: merchantEmail, password })
      .expect(201);
    merchantToken = merchant.body.accessToken;

    await request(app.getHttpServer())
      .get('/v1/admin/companies')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(403);
  });

  it('admin promovido via Prisma aprova KYB e ativa a empresa', async () => {
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ name: 'Admin', email: adminEmail, password })
      .expect(201);
    adminToken = registered.body.accessToken;

    const me = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    adminUserId = me.body.id;

    await prisma.user.update({ where: { id: adminUserId }, data: { isPlatformAdmin: true } });

    const company = await request(app.getHttpServer())
      .post('/v1/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        legalName: 'Empresa Admin E2E LTDA',
        cnpj,
        businessEmail: adminEmail,
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
    companyId = company.body.id;
    expect(company.body.status).toBe('PENDING_KYB');

    const reviewed = await request(app.getHttpServer())
      .patch(`/v1/admin/companies/${companyId}/kyb`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED', notes: 'e2e' })
      .expect(200);

    expect(reviewed.body.status).toBe('APPROVED');

    const after = await request(app.getHttpServer())
      .get(`/v1/admin/companies/${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.status).toBe('ACTIVE');
  });
});
