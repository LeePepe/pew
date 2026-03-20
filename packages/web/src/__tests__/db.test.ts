import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock d1 module before importing db modules
vi.mock("@/lib/d1", () => ({
  getD1Client: vi.fn(),
}));

import { getD1Client } from "@/lib/d1";
import { createRestDbRead, createRestDbWrite } from "@/lib/db-rest";
import { getDbRead, getDbWrite, resetDb } from "@/lib/db";

const mockQuery = vi.fn();
const mockFirstOrNull = vi.fn();
const mockExecute = vi.fn();
const mockBatch = vi.fn();

const mockClient = {
  query: mockQuery,
  firstOrNull: mockFirstOrNull,
  execute: mockExecute,
  batch: mockBatch,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  vi.mocked(getD1Client).mockReturnValue(mockClient as never);
});

// ---------------------------------------------------------------------------
// createRestDbRead
// ---------------------------------------------------------------------------

describe("createRestDbRead", () => {
  it("delegates query() to D1Client.query()", async () => {
    const expected = { results: [{ id: 1 }], meta: { changes: 0, duration: 1 } };
    mockQuery.mockResolvedValue(expected);

    const db = createRestDbRead();
    const result = await db.query("SELECT * FROM users WHERE id = ?", ["u1"]);

    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM users WHERE id = ?", ["u1"]);
    expect(result).toEqual(expected);
  });

  it("passes empty array when params omitted in query()", async () => {
    mockQuery.mockResolvedValue({ results: [], meta: { changes: 0, duration: 0 } });

    const db = createRestDbRead();
    await db.query("SELECT 1");

    expect(mockQuery).toHaveBeenCalledWith("SELECT 1", []);
  });

  it("delegates firstOrNull() to D1Client.firstOrNull()", async () => {
    mockFirstOrNull.mockResolvedValue({ id: 1, name: "test" });

    const db = createRestDbRead();
    const result = await db.firstOrNull("SELECT * FROM users WHERE id = ?", ["u1"]);

    expect(mockFirstOrNull).toHaveBeenCalledWith("SELECT * FROM users WHERE id = ?", ["u1"]);
    expect(result).toEqual({ id: 1, name: "test" });
  });

  it("returns null from firstOrNull() when no row", async () => {
    mockFirstOrNull.mockResolvedValue(null);

    const db = createRestDbRead();
    const result = await db.firstOrNull("SELECT * FROM users WHERE id = ?", ["missing"]);

    expect(result).toBeNull();
  });

  it("passes empty array when params omitted in firstOrNull()", async () => {
    mockFirstOrNull.mockResolvedValue(null);

    const db = createRestDbRead();
    await db.firstOrNull("SELECT 1");

    expect(mockFirstOrNull).toHaveBeenCalledWith("SELECT 1", []);
  });

  it("does not expose execute or batch methods", () => {
    const db = createRestDbRead();
    expect(db).not.toHaveProperty("execute");
    expect(db).not.toHaveProperty("batch");
  });
});

// ---------------------------------------------------------------------------
// createRestDbWrite
// ---------------------------------------------------------------------------

describe("createRestDbWrite", () => {
  it("delegates execute() to D1Client.execute()", async () => {
    const meta = { changes: 1, duration: 2 };
    mockExecute.mockResolvedValue(meta);

    const db = createRestDbWrite();
    const result = await db.execute("INSERT INTO users (id) VALUES (?)", ["u1"]);

    expect(mockExecute).toHaveBeenCalledWith("INSERT INTO users (id) VALUES (?)", ["u1"]);
    expect(result).toEqual(meta);
  });

  it("passes empty array when params omitted in execute()", async () => {
    mockExecute.mockResolvedValue({ changes: 0, duration: 0 });

    const db = createRestDbWrite();
    await db.execute("DELETE FROM temp");

    expect(mockExecute).toHaveBeenCalledWith("DELETE FROM temp", []);
  });

  it("delegates batch() to D1Client.batch()", async () => {
    const expected = [
      { results: [], meta: { changes: 1, duration: 1 } },
      { results: [], meta: { changes: 1, duration: 1 } },
    ];
    mockBatch.mockResolvedValue(expected);

    const stmts = [
      { sql: "INSERT INTO a (id) VALUES (?)", params: ["1"] },
      { sql: "INSERT INTO b (id) VALUES (?)", params: ["2"] },
    ];

    const db = createRestDbWrite();
    const result = await db.batch(stmts);

    expect(mockBatch).toHaveBeenCalledWith(stmts);
    expect(result).toEqual(expected);
  });

  it("does not expose query or firstOrNull methods", () => {
    const db = createRestDbWrite();
    expect(db).not.toHaveProperty("query");
    expect(db).not.toHaveProperty("firstOrNull");
  });
});

// ---------------------------------------------------------------------------
// getDbRead / getDbWrite singletons
// ---------------------------------------------------------------------------

describe("getDbRead", () => {
  it("returns a DbRead instance", async () => {
    const db = await getDbRead();
    expect(db).toHaveProperty("query");
    expect(db).toHaveProperty("firstOrNull");
  });

  it("returns the same instance on repeated calls (singleton)", async () => {
    const db1 = await getDbRead();
    const db2 = await getDbRead();
    expect(db1).toBe(db2);
  });

  it("returns a fresh instance after resetDb()", async () => {
    const db1 = await getDbRead();
    resetDb();
    const db2 = await getDbRead();
    expect(db1).not.toBe(db2);
  });
});

describe("getDbWrite", () => {
  it("returns a DbWrite instance", async () => {
    const db = await getDbWrite();
    expect(db).toHaveProperty("execute");
    expect(db).toHaveProperty("batch");
  });

  it("returns the same instance on repeated calls (singleton)", async () => {
    const db1 = await getDbWrite();
    const db2 = await getDbWrite();
    expect(db1).toBe(db2);
  });

  it("returns a fresh instance after resetDb()", async () => {
    const db1 = await getDbWrite();
    resetDb();
    const db2 = await getDbWrite();
    expect(db1).not.toBe(db2);
  });
});
