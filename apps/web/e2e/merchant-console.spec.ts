import { expect, test, type Page } from '@playwright/test';

function cnpjFromSeed(seed: number): string {
  const base = String(seed).padStart(12, '4').slice(-12);
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

test('walks the merchant console from signup to refund', async ({ page }) => {
  const unique = Date.now();
  const email = `ui.e2e.${unique}@brismarpay.com`;
  const password = 'SenhaForte123';
  const cnpj = cnpjFromSeed(unique);

  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/register');
  await page.locator('input[type="text"]').fill('Lojista Playwright');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId('register-submit').click();
  await page.waitForURL('**/onboarding');

  await fillLabeled(page, 'Razão social', 'Empresa Playwright LTDA');
  await fillLabeled(page, 'CNPJ', cnpj);
  await fillLabeled(page, 'E-mail empresarial', email);
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

  await page.getByRole('link', { name: 'Clientes' }).click();
  await expect(page.getByText('Cadastre o primeiro cliente para começar a emitir cobranças.')).toBeVisible();
  await page.getByTestId('customers-empty-cta').click();
  await page.waitForURL('**/customers/new');

  await fillLabeled(page, 'Nome', 'Cliente Playwright');
  await fillLabeled(page, 'CPF/CNPJ', '12345678900');
  await fillLabeled(page, 'E-mail', `cliente.${unique}@teste.com`);
  await page.getByTestId('new-customer-submit').click();
  await page.waitForURL(/\/customers\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Cliente Playwright' })).toBeVisible();

  await page.getByRole('button', { name: 'Editar' }).click();
  await fillLabeled(page, 'Nome', 'Cliente Editado');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Cliente Editado' })).toBeVisible();

  await page.getByRole('link', { name: 'Nova cobrança' }).click();
  await page.waitForURL(/\/charges\/new/);
  await page.locator('select').nth(1).selectOption('CREDIT_CARD');
  await fillLabeled(page, 'Valor (R$)', '50');
  await page.getByTestId('new-charge-submit').click();
  await page.waitForURL(/\/charges\/[0-9a-f-]+$/);
  await expect(page.getByText('APPROVED', { exact: true })).toBeVisible();

  await page.getByTestId('charge-refund').click();
  await expect(page.getByText('REFUNDED', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'API Keys' }).click();
  await page.waitForURL('**/api-keys');
  await fillLabeled(page, 'Nome', 'Chave sandbox e2e');
  await page.getByTestId('api-keys-create').click();
  await expect(page.getByText('Armazene esta chave agora. Ela não será exibida novamente.')).toBeVisible();
  await expect(page.locator('code').filter({ hasText: 'bpay_sandbox_' })).toBeVisible();

  await page.getByTestId('nav-logout').click();
  await page.waitForURL('**/login');

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('senhaErrada1');
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('alert')).toBeVisible();
});
