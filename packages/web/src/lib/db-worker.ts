/**
 * Worker adapter for DbRead.
 *
 * Sends SQL queries to the pew read Worker (Cloudflare) via HTTP,
 * replacing the D1 REST API with native D1 binding for lower latency.
 */

import type { DbRead, DbQueryResult } from "./db";

export function createWorkerDbRead(): DbRead {
  const url = process.env.WORKER_READ_URL;
  const secret = process.env.WORKER_READ_SECRET;

  if (!url || !secret) {
    throw new Error("WORKER_READ_URL and WORKER_READ_SECRET are required");
  }

  const reader: DbRead = {
    async query<T>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      const res = await fetch(`${url}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ sql, params: params ?? [] }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Worker returned ${res.status}`,
        );
      }

      return res.json() as Promise<DbQueryResult<T>>;
    },

    async firstOrNull<T>(sql: string, params?: unknown[]): Promise<T | null> {
      const result = await reader.query<T>(sql, params);
      return result.results[0] ?? null;
    },
  };

  return reader;
}
