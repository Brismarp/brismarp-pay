import { defineRailway, postgres, preserve, project, redis, service } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("Postgres");
  const cache = redis("Redis");

  const shared = {
    NODE_ENV: "production",
    PAYMENT_PROVIDER: "asaas",
    ASAAS_BASE_URL: "https://api-sandbox.asaas.com",
    ASAAS_API_KEY: preserve(),
    ASAAS_WEBHOOK_TOKEN: preserve(),
    DATABASE_URL: db.env.DATABASE_URL,
    REDIS_URL: cache.env.REDIS_URL,
  };

  const api = service("api", {
    env: shared,
  });

  const worker = service("worker", {
    env: shared,
  });

  return project("brismarp-pay", {
    resources: [db, cache, api, worker],
  });
});