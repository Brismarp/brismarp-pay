/**
 * Prova financeira contra a API local com PAYMENT_PROVIDER=asaas.
 * Fora do make test. A chave fica no ambiente, nunca neste arquivo.
 *
 *   set -a && source ../../.env && set +a
 *   npx ts-node scripts/asaas-live-flow.ts
 */
const API = process.env.BRISMAR_API_URL ?? 'http://localhost:3001/v1';
const ASAAS = (process.env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com').replace(/\/$/, '').replace(/\/v3$/, '');
const AMOUNT_CENTS = 1000;
const FEE_CENTS = 25;
const NET_CENTS = AMOUNT_CENTS - FEE_CENTS;

function apiKey(): string {
  const value = process.env.ASAAS_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error('ASAAS_API_KEY ausente.');
  return value;
}

function webhookToken(): string {
  const value = process.env.ASAAS_WEBHOOK_TOKEN?.trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error('ASAAS_WEBHOOK_TOKEN ausente.');
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function log(step: string, detail: string) {
  console.log(`PASS  ${step} — ${detail}`);
}

function note(step: string, detail: string) {
  console.log(`NOTE  ${step} — ${detail}`);
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

async function api(path: string, method: string, body?: unknown, token?: string): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: response.status, json };
}

async function asaas(path: string, method: string, body?: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${ASAAS}/v3${path}`, {
    method,
    headers: {
      access_token: apiKey(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'BrismarPay/0.1 (Node.js; sandbox)',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: response.status, json };
}

function providerMeta(charge: any): Record<string, any> {
  const events = Array.isArray(charge.events) ? charge.events : [];
  const match = [...events].reverse().find((event) => {
    const metadata = event?.metadata;
    return metadata && typeof metadata === 'object' && (metadata.customer || metadata.checkout || metadata.id);
  });
  return (match?.metadata ?? {}) as Record<string, any>;
}

async function balance(token: string, companyId: string): Promise<number> {
  const res = await api(`/companies/${companyId}/ledger/balance`, 'GET', undefined, token);
  assert(res.status === 200, `Saldo HTTP ${res.status}: ${JSON.stringify(res.json)}`);
  return res.json.availableBalanceCents;
}

async function chargeDetail(token: string, companyId: string, chargeId: string) {
  const res = await api(`/companies/${companyId}/charges/${chargeId}`, 'GET', undefined, token);
  assert(res.status === 200, `Detalhe da cobrança HTTP ${res.status}: ${JSON.stringify(res.json)}`);
  return res.json;
}

async function main() {
  const stamp = Date.now();
  const email = `asaas.live.${stamp}@brismarpay.test`;
  const password = 'SenhaForte123';
  const cnpj = cnpjFromSeed(stamp);
  const open: string[] = [];

  const health = await api('/health', 'GET');
  assert(health.status === 200, `Health HTTP ${health.status}`);
  assert(health.json.provider === 'asaas', `Provider ativo é "${health.json.provider}", esperado asaas`);
  log('health', 'provider=asaas');

  const registered = await api('/auth/register', 'POST', {
    name: 'Operacao Asaas',
    email,
    password,
  });
  assert(registered.status === 201, `Registro HTTP ${registered.status}: ${JSON.stringify(registered.json)}`);
  const token = registered.json.accessToken as string;
  assert(token, 'Registro sem accessToken');
  log('register', email);

  const company = await api('/companies', 'POST', {
    legalName: 'Brismar Pay Sandbox LTDA',
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
  }, token);
  assert(company.status === 201, `Empresa HTTP ${company.status}: ${JSON.stringify(company.json)}`);
  const companyId = company.json.id as string;
  log('company', companyId);

  const customer = await api(`/companies/${companyId}/customers`, 'POST', {
    name: 'Cliente Sandbox Brismar',
    document: '39053344705',
    email: 'sandbox.brismar.pay@example.com',
  }, token);
  assert(customer.status === 201, `Cliente HTTP ${customer.status}: ${JSON.stringify(customer.json)}`);
  const customerId = customer.json.id as string;
  log('customer', customerId);

  const pixKey = `live-pix-${stamp}`;
  const pix = await api(`/companies/${companyId}/charges`, 'POST', {
    method: 'PIX',
    amountCents: AMOUNT_CENTS,
    customerId,
    idempotencyKey: pixKey,
  }, token);
  assert(pix.status === 201, `PIX HTTP ${pix.status}: ${JSON.stringify(pix.json)}`);
  if (pix.json.status === 'FAILED') {
    throw new Error(`PIX falhou na Asaas: ${JSON.stringify(pix.json)}. Se for 401, a chave foi rejeitada e a bateria para aqui.`);
  }
  open.push(pix.json.id);
  const pixFull = await chargeDetail(token, companyId, pix.json.id);
  const pixMeta = providerMeta(pixFull);
  const pixCheckout = pixMeta.checkout ?? {};
  assert(String(pixFull.providerPaymentId).startsWith('pay_'), `PIX sem pay_*: ${pixFull.providerPaymentId}`);
  assert(pixFull.status === 'PENDING', `PIX status ${pixFull.status}`);
  assert(typeof pixCheckout.invoiceUrl === 'string' && pixCheckout.invoiceUrl.length > 0, 'PIX sem invoiceUrl');
  const hasQr = typeof pixCheckout.pixCopyPaste === 'string' && pixCheckout.pixCopyPaste.length > 0
    && typeof pixCheckout.pixQrCodeImage === 'string' && pixCheckout.pixQrCodeImage.length > 0;
  if (!hasQr) note('pix-qr', 'Asaas criou o PIX e a fatura, mas não devolveu o QR.');
  assert(await balance(token, companyId) === 0, 'PIX pendente alterou o saldo');
  const pixCustomer = String(pixMeta.customer ?? '');
  assert(pixCustomer.startsWith('cus_'), `PIX sem cus_*: ${pixCustomer}`);
  log('pix', `${pixFull.providerPaymentId} ${pixCustomer}`);

  const boleto = await api(`/companies/${companyId}/charges`, 'POST', {
    method: 'BOLETO',
    amountCents: AMOUNT_CENTS,
    customerId,
    idempotencyKey: `live-boleto-${stamp}`,
  }, token);
  assert(boleto.status === 201, `Boleto HTTP ${boleto.status}: ${JSON.stringify(boleto.json)}`);
  assert(boleto.json.status !== 'FAILED', `Boleto falhou: ${JSON.stringify(boleto.json)}`);
  open.push(boleto.json.id);
  const boletoFull = await chargeDetail(token, companyId, boleto.json.id);
  const boletoMeta = providerMeta(boletoFull);
  const boletoCheckout = boletoMeta.checkout ?? {};
  const slip = boletoMeta.bankSlipUrl ?? boletoCheckout.bankSlipUrl ?? boletoMeta.identificationField;
  assert(boletoFull.status === 'PENDING', `Boleto status ${boletoFull.status}`);
  assert(typeof slip === 'string' && slip.length > 0, 'Boleto sem URL nem linha digitável');
  assert(String(boletoMeta.customer) === pixCustomer, `Reuso de cliente falhou: ${pixCustomer} vs ${boletoMeta.customer}`);
  assert(await balance(token, companyId) === 0, 'Boleto pendente alterou o saldo');
  log('boleto-reuse', `${boletoFull.providerPaymentId} customer=${boletoMeta.customer}`);

  const replay = await api(`/companies/${companyId}/charges`, 'POST', {
    method: 'PIX',
    amountCents: AMOUNT_CENTS,
    customerId,
    idempotencyKey: pixKey,
  }, token);
  assert(replay.status === 201, `Replay HTTP ${replay.status}`);
  assert(replay.json.id === pix.json.id, `Idempotência criou outra cobrança: ${replay.json.id}`);
  log('idempotency', pix.json.id);

  const canceled = await api(`/companies/${companyId}/charges/${pix.json.id}/cancel`, 'PATCH', {}, token);
  assert(canceled.status === 200, `Cancelamento HTTP ${canceled.status}: ${JSON.stringify(canceled.json)}`);
  assert(canceled.json.status === 'CANCELED', `PIX cancelado ficou ${canceled.json.status}`);
  const removed = open.indexOf(pix.json.id);
  if (removed >= 0) open.splice(removed, 1);
  const asaasPix = await asaas(`/payments/${encodeURIComponent(pixFull.providerPaymentId)}`, 'GET');
  const gone = asaasPix.status === 404 || asaasPix.json.deleted === true || asaasPix.json.status === 'DELETED';
  assert(gone, `Asaas não refletiu o cancelamento (HTTP ${asaasPix.status} status=${asaasPix.json.status} deleted=${asaasPix.json.deleted})`);
  assert(await balance(token, companyId) === 0, 'Cancelamento alterou o saldo');
  log('cancel-pix', pixFull.providerPaymentId);

  const cardChargeId = await probeMethod(token, companyId, customerId, 'CREDIT_CARD', stamp, open);
  await probeMethod(token, companyId, customerId, 'DEBIT_CARD', stamp, open);

  const invalidCustomer = await api(`/companies/${companyId}/customers`, 'POST', {
    name: 'Documento invalido',
    document: '000',
  }, token);
  assert(invalidCustomer.status === 201 || invalidCustomer.status === 400, `CPF inválido HTTP ${invalidCustomer.status}`);
  if (invalidCustomer.status === 201) {
    const invalidCharge = await api(`/companies/${companyId}/charges`, 'POST', {
      method: 'PIX',
      amountCents: AMOUNT_CENTS,
      customerId: invalidCustomer.json.id,
      idempotencyKey: `live-invalid-${stamp}`,
    }, token);
    assert(invalidCharge.status === 201, `Cobrança de CPF inválido HTTP ${invalidCharge.status}`);
    const invalidFull = await chargeDetail(token, companyId, invalidCharge.json.id);
    assert(invalidFull.status === 'FAILED', `CPF 000 deveria falhar na Asaas, status ${invalidFull.status}`);
    assert(!invalidFull.providerPaymentId, 'CPF 000 criou pagamento na Asaas');
    log('invalid-document', 'FAILED sem pay_*');
  } else {
    log('invalid-document', 'cliente recusado');
  }

  if (!cardChargeId) {
    note('refund', 'Cartão não ficou pendente. Ledger e estorno não executados.');
    await cleanup(token, companyId, open);
    return;
  }
  const settleFull = await chargeDetail(token, companyId, cardChargeId);
  const confirmed = await confirmSandboxCard(settleFull.providerPaymentId);
  if (!confirmed) {
    note('refund', 'Asaas não confirmou o cartão de teste. receiveInCash vira RECEIVED_IN_CASH e não aceita estorno.');
    await cleanup(token, companyId, open);
    return;
  }
  log('card-confirmed', settleFull.providerPaymentId);
  note('boleto-refund', 'Asaas só estorna PIX eletrônico e cartão. Boleto e recebimento em dinheiro não estornam; o boleto é cancelado na limpeza.');

  const eventId = `evt-live-${settleFull.providerPaymentId}`;
  const webhookBody = {
    id: eventId,
    event: 'PAYMENT_CONFIRMED',
    payment: { id: settleFull.providerPaymentId, status: 'CONFIRMED' },
  };
  const webhook = await fetch(`${API}/webhooks/asaas`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'asaas-access-token': webhookToken(),
    },
    body: JSON.stringify(webhookBody),
  });
  assert(webhook.status === 204, `Webhook HTTP ${webhook.status}: ${await webhook.text()}`);
  const approved = await chargeDetail(token, companyId, cardChargeId);
  assert(approved.status === 'APPROVED', `Webhook não aprovou: ${approved.status}`);
  const chargeTx = (approved.transactions ?? []).filter((item: any) => item.type === 'charge');
  assert(chargeTx.length === 1, `Transações de charge: ${chargeTx.length}`);
  assert(chargeTx[0].feeCents === FEE_CENTS, `Taxa ${chargeTx[0].feeCents}, esperado ${FEE_CENTS}`);
  assert(chargeTx[0].netAmountCents === NET_CENTS, `Líquido ${chargeTx[0].netAmountCents}, esperado ${NET_CENTS}`);
  assert(await balance(token, companyId) === NET_CENTS, `Saldo após aprovação ${await balance(token, companyId)}, esperado ${NET_CENTS}`);
  const settled = open.indexOf(cardChargeId);
  if (settled >= 0) open.splice(settled, 1);
  log('ledger', `${NET_CENTS} cents`);

  const duplicate = await fetch(`${API}/webhooks/asaas`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'asaas-access-token': webhookToken(),
    },
    body: JSON.stringify(webhookBody),
  });
  assert(duplicate.status === 204, `Webhook duplicado HTTP ${duplicate.status}`);
  assert(await balance(token, companyId) === NET_CENTS, 'Webhook duplicado alterou o saldo');
  log('webhook-dedup', eventId);

  let refund = await api(`/companies/${companyId}/charges/${cardChargeId}/refund`, 'PATCH', {
    reason: 'Estorno sandbox Brismar Pay',
  }, token);
  for (let attempt = 0; attempt < 6 && refund.status === 400 && String(refund.json?.message ?? '').includes('instantes'); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    refund = await api(`/companies/${companyId}/charges/${cardChargeId}/refund`, 'PATCH', {
      reason: 'Estorno sandbox Brismar Pay',
    }, token);
  }
  assert(refund.status === 200, `Estorno HTTP ${refund.status}: ${JSON.stringify(refund.json)}`);
  assert(refund.json.status === 'REFUNDED', `Estorno ficou ${refund.json.status}`);
  assert(await balance(token, companyId) === 0, `Saldo após estorno ${await balance(token, companyId)}, esperado 0`);
  log('refund', 'saldo 0');

  await cleanup(token, companyId, open);
}

async function confirmSandboxCard(providerPaymentId: string): Promise<boolean> {
  const paid = await asaas(`/payments/${encodeURIComponent(providerPaymentId)}/payWithCreditCard`, 'POST', {
    creditCard: {
      holderName: 'Cliente Sandbox',
      number: '5162306219378829',
      expiryMonth: '12',
      expiryYear: '2028',
      ccv: '123',
    },
    creditCardHolderInfo: {
      name: 'Cliente Sandbox',
      email: 'sandbox.brismar.pay@example.com',
      cpfCnpj: '39053344705',
      postalCode: '01310100',
      addressNumber: '1000',
      phone: '11999999999',
    },
  });
  const already = paid.json?.errors?.[0]?.description === 'Cobrança já confirmada.';
  if ((paid.status < 200 || paid.status >= 300) && !already) return false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await asaas(`/payments/${encodeURIComponent(providerPaymentId)}`, 'GET');
    if (current.json.status === 'CONFIRMED' || current.json.status === 'RECEIVED') return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function probeMethod(
  token: string,
  companyId: string,
  customerId: string,
  method: string,
  stamp: number,
  open: string[],
): Promise<string | undefined> {
  const created = await api(`/companies/${companyId}/charges`, 'POST', {
    method,
    amountCents: AMOUNT_CENTS,
    customerId,
    idempotencyKey: `live-${method.toLowerCase()}-${stamp}`,
  }, token);
  assert(created.status === 201, `${method} HTTP ${created.status}: ${JSON.stringify(created.json)}`);
  const full = await chargeDetail(token, companyId, created.json.id);
  if (full.status === 'FAILED' || full.status === 'DECLINED') {
    const message = providerMeta(full).message ?? full.status;
    note(method.toLowerCase(), `Asaas não concluiu sem dados de cartão (${message})`);
    return undefined;
  }
  open.push(full.id);
  const checkout = providerMeta(full).checkout ?? {};
  assert(full.status === 'PENDING', `${method} status ${full.status}`);
  assert(full.status !== 'APPROVED', `${method} aprovou sem dados de cartão`);
  assert(typeof checkout.invoiceUrl === 'string' && checkout.invoiceUrl.length > 0, `${method} sem invoiceUrl`);
  log(method.toLowerCase(), `${full.providerPaymentId} PENDING invoice`);
  return full.id;
}

async function cleanup(token: string, companyId: string, open: string[]) {
  const leftover: string[] = [];
  for (const id of open) {
    const res = await api(`/companies/${companyId}/charges/${id}/cancel`, 'PATCH', {}, token);
    if (res.status !== 200) leftover.push(`${id} HTTP ${res.status}`);
  }
  if (leftover.length > 0) throw new Error(`Limpeza incompleta: ${leftover.join('; ')}`);
  log('cleanup', `${open.length} pendência(s)`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
});
