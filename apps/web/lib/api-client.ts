const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';
const ACCESS_TOKEN_KEY = 'bpay_access_token';
const AUTH_SKIP_REFRESH = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let refreshInFlight: Promise<string | null> | null = null;

function readStoredAccessToken(): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      return null;
    }
    const data = (await res.json()) as { accessToken: string };
    sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    return data.accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
  retried = false,
): Promise<T> {
  const token = readStoredAccessToken() ?? accessToken;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !retried && !AUTH_SKIP_REFRESH.has(path.split('?')[0])) {
    const nextToken = await refreshAccessToken();
    if (nextToken) return request<T>(path, options, nextToken, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? 'Erro inesperado. Tente novamente.');
  }

  return res.json();
}

export const apiClient = {
  register: (data: { name: string; email: string; password: string }) =>
    request<{ accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string; twoFactorCode?: string }) =>
    request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  me: (accessToken: string) =>
    request<{ id: string; email: string; isPlatformAdmin: boolean }>('/auth/me', {}, accessToken),

  listMyCompanies: (accessToken: string) =>
    request<
      Array<{ id: string; legalName: string; tradeName: string | null; status: string; kybStatus: string; role: string }>
    >('/companies/me', {}, accessToken),

  createCompany: (data: CreateCompanyPayload, accessToken: string) =>
    request<{ id: string }>(
      '/companies',
      { method: 'POST', body: JSON.stringify(data) },
      accessToken,
    ),

  getDashboardSummary: (companyId: string, accessToken: string, params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<DashboardSummary>(
      `/companies/${companyId}/dashboard/summary${suffix}`,
      {},
      accessToken,
    );
  },

  // --- Clientes ---

  listCustomers: (
    companyId: string,
    accessToken: string,
    params?: { search?: string; page?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<PaginatedResult<Customer>>(`/companies/${companyId}/customers${suffix}`, {}, accessToken);
  },

  createCustomer: (companyId: string, data: CreateCustomerPayload, accessToken: string) =>
    request<Customer>(
      `/companies/${companyId}/customers`,
      { method: 'POST', body: JSON.stringify(data) },
      accessToken,
    ),

  getCustomer: (companyId: string, customerId: string, accessToken: string) =>
    request<Customer & { charges: Charge[] }>(
      `/companies/${companyId}/customers/${customerId}`,
      {},
      accessToken,
    ),

  updateCustomer: (
    companyId: string,
    customerId: string,
    data: { name?: string; email?: string; phone?: string },
    accessToken: string,
  ) =>
    request<Customer>(
      `/companies/${companyId}/customers/${customerId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      accessToken,
    ),

  // --- Cobranças ---

  listCharges: (
    companyId: string,
    accessToken: string,
    params?: { status?: string; method?: string; customerId?: string; page?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.method) qs.set('method', params.method);
    if (params?.customerId) qs.set('customerId', params.customerId);
    if (params?.page) qs.set('page', String(params.page));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<PaginatedResult<Charge & { customer: { id: string; name: string; document: string } | null }>>(
      `/companies/${companyId}/charges${suffix}`,
      {},
      accessToken,
    );
  },

  createCharge: (companyId: string, data: CreateChargePayload, accessToken: string) =>
    request<Charge>(
      `/companies/${companyId}/charges`,
      { method: 'POST', body: JSON.stringify(data) },
      accessToken,
    ),

  getCharge: (companyId: string, chargeId: string, accessToken: string) =>
    request<Charge & { events: ChargeEvent[]; transactions: unknown[] }>(
      `/companies/${companyId}/charges/${chargeId}`,
      {},
      accessToken,
    ),

  cancelCharge: (companyId: string, chargeId: string, accessToken: string) =>
    request<Charge>(`/companies/${companyId}/charges/${chargeId}/cancel`, { method: 'PATCH' }, accessToken),

  refundCharge: (companyId: string, chargeId: string, accessToken: string, reason?: string) =>
    request<Charge>(
      `/companies/${companyId}/charges/${chargeId}/refund`,
      { method: 'PATCH', body: JSON.stringify(reason ? { reason } : {}) },
      accessToken,
    ),

  simulateChargeConfirmation: (companyId: string, chargeId: string, accessToken: string) =>
    request<Charge>(
      `/companies/${companyId}/charges/${chargeId}/simulate-confirmation`,
      { method: 'PATCH' },
      accessToken,
    ),

  listApiKeys: (companyId: string, accessToken: string) =>
    request<ApiKeyListItem[]>(`/companies/${companyId}/api-keys`, {}, accessToken),

  createApiKey: (
    companyId: string,
    data: { name: string; environment: ApiKeyEnvironment; scopes: string[] },
    accessToken: string,
  ) =>
    request<ApiKeySecretResponse>(
      `/companies/${companyId}/api-keys`,
      { method: 'POST', body: JSON.stringify(data) },
      accessToken,
    ),

  revokeApiKey: (companyId: string, apiKeyId: string, accessToken: string) =>
    request<{ id: string; prefix?: string; revokedAt: string; alreadyRevoked?: boolean }>(
      `/companies/${companyId}/api-keys/${apiKeyId}`,
      { method: 'DELETE' },
      accessToken,
    ),

  rotateApiKey: (companyId: string, apiKeyId: string, accessToken: string) =>
    request<ApiKeySecretResponse>(
      `/companies/${companyId}/api-keys/${apiKeyId}/rotate`,
      { method: 'POST' },
      accessToken,
    ),

  // --- Admin (área administrativa da plataforma) ---

  adminListCompanies: (
    accessToken: string,
    params?: { search?: string; status?: string; page?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<PaginatedResult<AdminCompanyListItem>>(`/admin/companies${suffix}`, {}, accessToken);
  },

  adminGetCompany: (companyId: string, accessToken: string) =>
    request<AdminCompanyDetail>(`/admin/companies/${companyId}`, {}, accessToken),

  adminUpdateCompanyStatus: (
    companyId: string,
    data: { status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED'; reason?: string },
    accessToken: string,
  ) =>
    request<AdminCompanyDetail>(
      `/admin/companies/${companyId}/status`,
      { method: 'PATCH', body: JSON.stringify(data) },
      accessToken,
    ),

  adminReviewKyb: (
    companyId: string,
    data: { decision: 'APPROVED' | 'REJECTED'; notes?: string },
    accessToken: string,
  ) =>
    request<{ status: string }>(
      `/admin/companies/${companyId}/kyb`,
      { method: 'PATCH', body: JSON.stringify(data) },
      accessToken,
    ),

  adminGetDashboardSummary: (accessToken: string, params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<AdminDashboardSummary>(`/admin/dashboard/summary${suffix}`, {}, accessToken);
  },

  adminListAuditLogs: (
    accessToken: string,
    params?: { companyId?: string; actorUserId?: string; action?: string; page?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.companyId) qs.set('companyId', params.companyId);
    if (params?.actorUserId) qs.set('actorUserId', params.actorUserId);
    if (params?.action) qs.set('action', params.action);
    if (params?.page) qs.set('page', String(params.page));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<PaginatedResult<AdminAuditLog>>(`/admin/audit-logs${suffix}`, {}, accessToken);
  },
};

export interface AdminCompanyListItem {
  id: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string;
  status: string;
  kyb: { status: string } | null;
  _count: { users: number; customers: number; charges: number };
  createdAt: string;
}

export interface AdminCompanyDetail extends AdminCompanyListItem {
  businessEmail: string;
  address: Record<string, unknown> | null;
  users: Array<{ role: string; user: { id: string; name: string; email: string } }>;
}

export interface AdminDashboardSummary {
  period: { from: string; to: string };
  companiesByStatus: Array<{ status: string; count: number }>;
  totalCustomers: number;
  volumeProcessedCents: number;
  feesCollectedCents: number;
  chargeStatusBreakdown: Array<{ status: string; count: number }>;
  pendingKybCount: number;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  actorUser: { id: string; name: string; email: string } | null;
  company: { id: string; legalName: string } | null;
  metadata: Record<string, unknown> | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Customer {
  id: string;
  name: string;
  document: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
}

export interface CreateCustomerPayload {
  name: string;
  document: string;
  email?: string;
  phone?: string;
}

export type ChargeMethod = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO';

export interface ChargeCheckout {
  pixCopyPaste?: string;
  pixQrCodeImage?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
}

export interface Charge {
  id: string;
  method: ChargeMethod;
  status: string;
  amountCents: number;
  installments: number;
  customerId: string;
  createdAt: string;
  providerName?: string | null;
  providerPaymentId?: string | null;
  failureMessage?: string | null;
  metadata?: { checkout?: ChargeCheckout } | null;
}

export interface ChargeEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  source: string;
  createdAt: string;
  metadata?: { checkout?: ChargeCheckout; message?: string } | null;
}

export interface CreateChargePayload {
  method: ChargeMethod;
  amountCents: number;
  customerId: string;
  installments?: number;
  metadata?: Record<string, unknown>;
}

export interface DashboardSummary {
  period: { from: string; to: string };
  balance: { availableCents: number; pendingCents: number; pendingCount: number };
  volumeProcessedCents: number;
  transactionCount: number;
  approvalRate: number | null;
  feesChargedCents: number;
  chargebackCount: number;
  refundCount: number;
  statusBreakdown: Array<{ status: string; count: number }>;
  recentCharges: Array<{
    id: string;
    customerName: string | null;
    method: string;
    status: string;
    amountCents: number;
    createdAt: string;
  }>;
}

export interface CreateCompanyPayload {
  legalName: string;
  tradeName?: string;
  cnpj: string;
  businessEmail: string;
  phone?: string;
  address: {
    zipCode: string;
    street: string;
    number: string;
    complement?: string;
    district: string;
    city: string;
    state: string;
  };
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export const API_KEY_SCOPES = [
  'charges:read',
  'charges:write',
  'customers:read',
  'customers:write',
  'ledger:read',
  'webhooks:manage',
] as const;

export type ApiKeyEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  environment: ApiKeyEnvironment;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeySecretResponse {
  id: string;
  name: string;
  prefix: string;
  environment: ApiKeyEnvironment;
  scopes: string[];
  createdAt: string;
  key: string;
  warning: string;
}
