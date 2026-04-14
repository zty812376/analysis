import { Pool, type PoolConfig } from "pg";

type GlobalPostgresState = typeof globalThis & {
  __analysisPostgresPool__?: Pool;
};

function readConnectionString() {
  return process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
}

function readSslConfig() {
  const explicitSsl = process.env.POSTGRES_SSL?.trim()?.toLowerCase();
  const sslMode = process.env.PGSSLMODE?.trim()?.toLowerCase();

  if (explicitSsl === "false" || sslMode === "disable") {
    return false;
  }

  if (
    explicitSsl === "true" ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  ) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

function getPoolConfig(): PoolConfig {
  const connectionString = readConnectionString();
  const ssl = readSslConfig();
  const max = Number(process.env.POSTGRES_POOL_MAX ?? 10);

  if (connectionString) {
    return {
      connectionString,
      ssl,
      max: Number.isFinite(max) && max > 0 ? max : 10,
    };
  }

  if (!process.env.PGHOST?.trim()) {
    throw new Error(
      "未配置 PostgreSQL 连接。请设置 POSTGRES_URL 或 DATABASE_URL，或提供 PGHOST 等 PG* 环境变量。"
    );
  }

  return {
    host: process.env.PGHOST?.trim(),
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER?.trim(),
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE?.trim(),
    ssl,
    max: Number.isFinite(max) && max > 0 ? max : 10,
  };
}

export function getPostgresPool() {
  const globalState = globalThis as GlobalPostgresState;

  if (!globalState.__analysisPostgresPool__) {
    globalState.__analysisPostgresPool__ = new Pool(getPoolConfig());
  }

  return globalState.__analysisPostgresPool__;
}
