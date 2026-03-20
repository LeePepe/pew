/**
 * REST API adapters for DbRead / DbWrite.
 *
 * Wraps the existing D1Client (Cloudflare REST API) behind the
 * abstract interfaces defined in db.ts.
 */

import { getD1Client } from "./d1";
import type { DbRead, DbWrite } from "./db";

export function createRestDbRead(): DbRead {
  const client = getD1Client();
  return {
    query: <T>(sql: string, params?: unknown[]) =>
      client.query<T>(sql, params ?? []),
    firstOrNull: <T>(sql: string, params?: unknown[]) =>
      client.firstOrNull<T>(sql, params ?? []),
  };
}

export function createRestDbWrite(): DbWrite {
  const client = getD1Client();
  return {
    execute: async (sql: string, params?: unknown[]) =>
      client.execute(sql, params ?? []),
    batch: (stmts: Array<{ sql: string; params?: unknown[] }>) =>
      client.batch(stmts),
  };
}
