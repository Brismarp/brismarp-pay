import Redis from 'ioredis';
import { RedisService } from './redis.service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  }));
});

describe('RedisService', () => {
  let service: RedisService;
  let client: { get: jest.Mock; set: jest.Mock; del: jest.Mock; eval: jest.Mock; quit: jest.Mock };

  beforeEach(() => {
    service = new RedisService();
    client = (Redis as unknown as jest.Mock).mock.results.at(-1)?.value;
  });

  it('grava JSON com TTL explícito', async () => {
    client.set.mockResolvedValue('OK');

    await service.setJson('payment:1', { status: 'PENDING' }, 120);

    expect(client.set).toHaveBeenCalledWith('payment:1', '{"status":"PENDING"}', 'EX', 120);
  });

  it('usa SET NX com expiração para idempotência/lock', async () => {
    client.set.mockResolvedValue('OK');

    await service.setIfAbsent('lock:key', 'token', 30);

    expect(client.set).toHaveBeenCalledWith('lock:key', 'token', 'EX', 30, 'NX');
  });

  it('remove lock apenas quando o token ainda pertence ao dono', async () => {
    client.eval.mockResolvedValue(1);

    await service.releaseIfOwner('lock:key', 'token');

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1])'),
      1,
      'lock:key',
      'token',
    );
  });

  it('encerra a conexão de forma limpa', async () => {
    await service.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
