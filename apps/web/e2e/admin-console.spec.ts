import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const requireFromApi = createRequire(path.join(__dirname, '../../api/package.json'));
const { PrismaClient } = requireFromApi('@prisma/client') as { PrismaClient: new () => { user: { update: Function }; $disconnect: () => Promise<void> } };

function cnpjFromSeed(seed: number): string {
  const base = String(seed).padStart(12, '5').slice(-12);
  const digit = (value: string, weights: number[]) => {
    const sum = [...value].reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const d1 = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digit(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + String(d1) + String(d2);
}

async function fillLabeled(page: Page, label: string, value: string) {
  await page.locator(`label:has-text("${label}")`).locator('xpath=following-sibling::input[1]').fill(value);
}

async function promoteAdmin(email: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to promote a Playwright admin via Prisma.');
  }
  const prisma = new PrismaClient();
  try {
    await prisma.user.update({ where: { email }, data: { isPlatformAdmin: true } });
  } finally {
    await prisma.$disconnect();
  }
}

test('walks the admin console from KYB approval to audit', async ({ page }) => {
  const unique = Date.now();
  const password = 'SenhaForte123';
  const merchantEmail = `ui.admin.merchant.${unique}@brismarpay.com`;
  const adminEmail = `ui.admin.${unique}@brismarpay.com`;
  const legalName = `Empresa Admin UI ${unique} LTDA`;
  const cnpj = cnpjFromSeed(unique);

  await page.goto('/register');
  await page.locator('input[type="text"]').fill('Lojista Admin UI');
  await page.locator('input[type="email"]').fill(merchantEmail);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId('register-submit').click();
  await page.waitForURL('**/onboarding');

  await fillLabeled(page, 'Razão social', legalName);
  await fillLabeled(page, 'CNPJ', cnpj);
  await fillLabeled(page, 'E-mail empresarial', merchantEmail);
  await fillLabeled(page, 'CEP', '01310-100');
  await fillLabeled(page, 'Número', '1000');
  await fillLabeled(page, 'Logradouro', 'Av. Paulista');
  await fillLabeled(page, 'Bairro', 'Bela Vista');
  await fillLabeled(page, 'Cidade', 'São Paulo');
  await fillLabeled(page, 'UF', 'SP');
  await page.getByText('Li e aceito os Termos de Uso.').click();
  await page.getByText('Li e aceito a Política de Privacidade.').click();
  await page.getByTestId('onboarding-submit').click();
  await page.waitForURL('**/dashboard');

  await page.goto('/admin');
  await page.waitForURL('**/dashboard');
  await expect(page).not.toHaveURL(/\/admin/);

  await page.getByTestId('nav-logout').click();
  await page.waitForURL('**/login');

  await page.goto('/register');
  await page.locator('input[type="text"]').fill('Admin Playwright');
  await page.locator('input[type="email"]').fill(adminEmail);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId('register-submit').click();
  await page.waitForURL('**/onboarding');

  await promoteAdmin(adminEmail);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Visão geral da plataforma' })).toBeVisible();
  await expect(page.getByText('KYB pendente')).toBeVisible();

  await page.getByRole('link', { name: 'Empresas' }).click();
  await page.waitForURL('**/admin/companies');
  await page.getByPlaceholder('Buscar por razão social, nome fantasia ou CNPJ...').fill(legalName);
  await page.getByRole('link', { name: legalName }).click();
  await page.waitForURL(/\/admin\/companies\/[0-9a-f-]+$/);

  await page.getByTestId('admin-kyb-approve').click();
  await expect(page.getByRole('heading', { name: /Status da conta: ACTIVE/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Compliance \(KYB\): APPROVED/ })).toBeVisible();

  page.on('dialog', (dialog) => dialog.accept('suspensão e2e'));
  await page.getByTestId('admin-status-suspend').click();
  await expect(page.getByRole('heading', { name: /Status da conta: SUSPENDED/ })).toBeVisible();

  await page.getByRole('link', { name: 'Auditoria' }).click();
  await page.waitForURL('**/admin/audit-logs');
  await page.getByPlaceholder(/Filtrar por ação/).fill('admin.company.kyb_review');
  await expect(page.getByRole('cell', { name: 'admin.company.kyb_review' }).first()).toBeVisible();
  await expect(page.getByText(legalName).first()).toBeVisible();
  await page.getByPlaceholder(/Filtrar por ação/).fill('admin.company.status_change');
  await expect(page.getByRole('cell', { name: 'admin.company.status_change' }).first()).toBeVisible();
  await expect(page.getByText(legalName).first()).toBeVisible();
});
