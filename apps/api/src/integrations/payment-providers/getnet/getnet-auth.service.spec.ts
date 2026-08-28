import { Test } from '@nestjs/testing';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { GetnetAuthService } from './getnet-auth.service';

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: jest.fn().mockResolvedValue(body) } as any;
}

describe('GetnetAuthService', () => {
  let service: GetnetAuthService;
  let redis: { getJson: jest.Mock; setJson: jest.Mock };
  let fetchMock: jest.SpyInstance;

  beforeEach(async () => {
    process.env.GETNET_ENVIRONMENT = 'sandbox';
    process.env.GETNET_CLIENT_ID = 'client-id';
    process.env.GETNET_CLIENT_SECRET = 'client-secret';
    process.env.GETNET_TOKEN_URL = 'https://api-sbx.globalgetnet.com/authentication/oauth2/access_token';

    redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    fetchMock = jest.spyOn(global, 'fetch');

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetnetAuthService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(GetnetAuthService);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env.GETNET_TOKEN_URL;
    delete process.env.GETNET_CLIENT_ID;
    delete process.env.GETNET_CLIENT_SECRET;
  });

  it('obtém token com Basic Auth e client_credentials e salva no Redis', async () => {
    fetchMock.mockResolvedValue(response({ access_token: 'token-1', token_type: 'Bearer', scope: 'scope-1', expires_in: 3600 }));

    await expect(service.getAccessToken()).resolves.toBe('token-1');

    expect(fetchMock).toHaveBeenCalledWith(
      process.env.GETNET_TOKEN_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: 'grant_type=client_credentials',
      }),
    );
    expect(redis.setJson).toHaveBeenCalledWith(
      'getnet:oauth:sandbox:client-id',
      expect.objectContaining({ accessToken: 'token-1', scope: 'scope-1' }),
      3540,
    );
  });

  it('reutiliza token Redis ainda válido sem chamar o endpoint', async () => {
    redis.getJson.mockResolvedValue({ accessToken: 'cached-token', expiresAt: Date.now() + 300_000 });

    await expect(service.getAccessToken()).resolves.toBe('cached-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renova quando o token está dentro da janela de segurança', async () => {
    redis.getJson.mockResolvedValue({ accessToken: 'almost-expired', expiresAt: Date.now() + 30_000 });
    fetchMock.mockResolvedValue(response({ access_token: 'token-2', expires_in: 3600 }));

    await expect(service.getAccessToken()).resolves.toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
