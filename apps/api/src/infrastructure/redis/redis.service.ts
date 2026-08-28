import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  get raw() {
    return this.client;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) as T : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number) {
    const data = JSON.stringify(value);
    if (ttlSeconds) await this.client.set(key, data, 'EX', ttlSeconds);
    else await this.client.set(key, data);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    return this.client.set(key, value, 'EX', ttlSeconds, 'NX');
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async releaseIfOwner(key: string, ownerToken: string) {
    return this.client.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      key,
      ownerToken,
    );
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
