import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';

interface GetnetTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

interface CachedGetnetToken {
  accessToken: string;
  tokenType: string;
  scope?: string;
  expiresAt: number;
}

const DEFAULT_TOKEN_TTL_SECONDS = 3_600;
const TOKEN_REFRESH_SKEW_SECONDS = 60;

@Injectable()
export class GetnetAuthService {
  constructor(private readonly redis: RedisService) {}

  async getAccessToken(): Promise<string> {
    const environment = process.env.GETNET_ENVIRONMENT ?? 'sandbox';
    const clientId = process.env.GETNET_CLIENT_ID;
    const clientSecret = process.env.GETNET_CLIENT_SECRET;
    const tokenUrl = process.env.GETNET_TOKEN_URL;

    if (!clientId || !clientSecret || !tokenUrl) {
      throw new ServiceUnavailableException('Getnet OAuth não configurado: informe token URL, client ID e client secret.');
    }

    const cacheKey = `getnet:oauth:${environment}:${clientId}`;
    const cached = await this.redis.getJson<CachedGetnetToken>(cacheKey);
    if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_SECONDS * 1000) {
      return cached.accessToken;
    }

    const timeoutMs = this.getTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const basicCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicCredentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(`Getnet OAuth recusou a autenticação (HTTP ${response.status}).`);
      }

      const payload = await response.json() as GetnetTokenResponse;
      if (!payload.access_token) {
        throw new ServiceUnavailableException('Getnet OAuth retornou resposta sem access_token.');
      }

      const expiresIn = this.normalizeExpiresIn(payload.expires_in);
      await this.redis.setJson(cacheKey, {
        accessToken: payload.access_token,
        tokenType: payload.token_type ?? 'Bearer',
        scope: payload.scope,
        expiresAt: Date.now() + expiresIn * 1000,
      } satisfies CachedGetnetToken, expiresIn);

      return payload.access_token;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Não foi possível obter token OAuth da Getnet.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeExpiresIn(expiresIn?: number) {
    const configured = Number(expiresIn ?? DEFAULT_TOKEN_TTL_SECONDS);
    if (!Number.isFinite(configured) || configured <= TOKEN_REFRESH_SKEW_SECONDS) return DEFAULT_TOKEN_TTL_SECONDS - TOKEN_REFRESH_SKEW_SECONDS;
    return Math.floor(configured - TOKEN_REFRESH_SKEW_SECONDS);
  }

  private getTimeoutMs() {
    const configured = Number(process.env.GETNET_TIMEOUT_MS ?? 10_000);
    return Number.isFinite(configured) && configured >= 1_000 ? Math.floor(configured) : 10_000;
  }
}
