import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const describeIfInfra = TEST_DATABASE_URL && TEST_REDIS_URL ? describe : describe.skip;

function cnpjFromSeed(seed: number): string {
  const base = String(seed).padStart(12, '2').slice(-12);
  const digit = (value: string, weights: number[]) => {
    const sum = [...value].reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const d1 = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digit(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + String(d1) + String(d2);
}

function companyPayload(email: string, cnpj: string) {
  return {
    legalName: 'Empresa API Key E2E LTDA',
    cnpj,
    businessEmail: email,
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
  };
}

describeIfInfra('API pública por API Key (E2E com PostgreSQL + Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now();
  const userEmail = `apikey.e2e.${uniqueSuffix}@brismarpay.com`;
  const otherEmail = `apikey.other.${uniqueSuffix}@brismarpay.com`;
  const userPassword = 'SenhaForte123';
  const companyCnpj = cnpjFromSeed(uniqueSuffix);
  const otherCnpj = cnpjFromSeed(uniqueSuffix + 17);

  let accessToken: string;
  let companyId: string;
  let otherCompanyId: string;
  let fullKey: string;
  let readKey: string;
  let customerId: string;

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
    if (prisma) {
      if (companyId) await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
      if (otherCompanyId) await prisma.company.delete({ where: { id: otherCompanyId } }).catch(() => undefined);
      await prisma.user.delete({ where: { email: userEmail } }).catch(() => undefined);
      await prisma.user.delete({ where: { email: otherEmail } }).catch(() => undefined);
    }
    if (app) await app.close();
  });

  it('prepara empresa e chaves via JWT', async () => {
    const register = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ name: 'Lojista API Key', email: userEmail, password: userPassword })
      .expect(201);
    accessToken = register.body.accessToken;

    const company = await request(app.getHttpServer())
      .post('/v1/companies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(companyPayload(userEmail, companyCnpj))
      .expect(201);
    companyId = company.body.id;

    const full = await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/api-keys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Integração completa',
        environment: 'SANDBOX',
        scopes: ['customers:read', 'customers:write', 'charges:read', 'charges:write'],
      })
      .expect(201);
    fullKey = full.body.key;

    const readOnly = await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/api-keys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Somente leitura',
        environment: 'SANDBOX',
        scopes: ['customers:read', 'charges:read'],
      })
      .expect(201);
    readKey = readOnly.body.key;
  });

  it('cria cliente e cobrança autenticando só com X-Api-Key', async () => {
    const customer = await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/customers`)
      .set('X-Api-Key', fullKey)
      .send({ name: 'Cliente API', document: '12345678900', email: 'cliente.api@teste.com' })
      .expect(201);
    customerId = customer.body.id;

    const charge = await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/charges`)
      .set('X-Api-Key', fullKey)
      .send({ method: 'CREDIT_CARD', amountCents: 5000, customerId })
      .expect(201);

    expect(charge.body.status).toBe('APPROVED');
  });

  it('chave só de leitura não cria cliente', async () => {
    await request(app.getHttpServer())
      .post(`/v1/companies/${companyId}/customers`)
      .set('X-Api-Key', readKey)
      .send({ name: 'Bloqueado', document: '98765432100' })
      .expect(403);
  });

  it('chave da empresa A não acessa a empresa B', async () => {
    const otherRegister = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ name: 'Outra Empresa', email: otherEmail, password: userPassword })
      .expect(201);

    const otherCompany = await request(app.getHttpServer())
      .post('/v1/companies')
      .set('Authorization', `Bearer ${otherRegister.body.accessToken}`)
      .send(companyPayload(otherEmail, otherCnpj))
      .expect(201);
    otherCompanyId = otherCompany.body.id;

    await request(app.getHttpServer())
      .get(`/v1/companies/${otherCompanyId}/customers`)
      .set('X-Api-Key', fullKey)
      .expect(403);
  });

  it('API Key não lista chaves (rota continua só JWT)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/companies/${companyId}/api-keys`)
      .set('X-Api-Key', fullKey)
      .expect(401);
  });

  it('chave revogada deixa de autenticar', async () => {
    const listed = await request(app.getHttpServer())
      .get(`/v1/companies/${companyId}/api-keys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const fullMeta = listed.body.find((item: { prefix: string }) => fullKey.startsWith(item.prefix));
    expect(fullMeta?.id).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .delete(`/v1/companies/${companyId}/api-keys/${fullMeta.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/v1/companies/${companyId}/customers`)
      .set('X-Api-Key', fullKey)
      .expect(401);
  });
});
