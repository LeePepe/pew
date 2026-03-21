import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWorkerDbRead } from "@/lib/db-worker";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WORKER_READ_URL = "https://pew.test.workers.dev";
  process.env.WORKER_READ_SECRET = "test-secret";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("createWorkerDbRead", () => {
  it("throws when WORKER_READ_URL is missing", () => {
    delete process.env.WORKER_READ_URL;
    expect(() => createWorkerDbRead()).toThrow("WORKER_READ_URL");
  });

  it("throws when WORKER_READ_SECRET is missing", () => {
    delete process.env.WORKER_READ_SECRET;
    expect(() => createWorkerDbRead()).toThrow("WORKER_READ_SECRET");
  });

  describe("query()", () => {
    it("sends POST to /api/query with auth header", async () => {
      const mockResponse = {
        results: [{ id: 1 }],
        meta: { changes: 0, duration: 1.2 },
      };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const db = createWorkerDbRead();
      const result = await db.query("SELECT * FROM users WHERE id = ?", ["u1"]);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("https://pew.test.workers.dev/api/query");
      expect(init!.method).toBe("POST");
      expect(init!.headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        }),
      );

      const body = JSON.parse(init!.body as string);
      expect(body.sql).toBe("SELECT * FROM users WHERE id = ?");
      expect(body.params).toEqual(["u1"]);

      expect(result).toEqual(mockResponse);
    });

    it("passes empty array when params omitted", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ results: [], meta: { changes: 0, duration: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const db = createWorkerDbRead();
      await db.query("SELECT 1");

      const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
      expect(body.params).toEqual([]);
    });

    it("throws on non-OK response with error message", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Write queries not allowed" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const db = createWorkerDbRead();
      await expect(db.query("INSERT INTO foo VALUES (?)")).rejects.toThrow(
        "Write queries not allowed",
      );
    });

    it("throws with status code when error body is unparseable", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Internal Server Error", { status: 500 }),
      );

      const db = createWorkerDbRead();
      await expect(db.query("SELECT 1")).rejects.toThrow("Worker returned 500");
    });
  });

  describe("firstOrNull()", () => {
    it("returns the first row", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [{ id: "u1", name: "Alice" }],
            meta: { changes: 0, duration: 0.5 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const db = createWorkerDbRead();
      const row = await db.firstOrNull<{ id: string; name: string }>(
        "SELECT * FROM users WHERE id = ?",
        ["u1"],
      );
      expect(row).toEqual({ id: "u1", name: "Alice" });
    });

    it("returns null when no rows", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ results: [], meta: { changes: 0, duration: 0.3 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const db = createWorkerDbRead();
      const row = await db.firstOrNull("SELECT * FROM users WHERE id = ?", ["missing"]);
      expect(row).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// getDbRead() switching logic
// ---------------------------------------------------------------------------

describe("getDbRead switching", () => {
  it("uses WorkerDbRead when WORKER_READ_URL is set", async () => {
    process.env.WORKER_READ_URL = "https://pew.test.workers.dev";
    process.env.WORKER_READ_SECRET = "secret";

    // Reset db singletons
    const { resetDb, getDbRead } = await import("@/lib/db");
    resetDb();

    const db = await getDbRead();
    // WorkerDbRead doesn't have execute or batch
    expect(db).toHaveProperty("query");
    expect(db).toHaveProperty("firstOrNull");
    expect(db).not.toHaveProperty("execute");
    expect(db).not.toHaveProperty("batch");

    resetDb(); // cleanup
  });

  it("uses RestDbRead when WORKER_READ_URL is absent", async () => {
    delete process.env.WORKER_READ_URL;

    // Need to mock d1 since RestDbRead calls getD1Client
    vi.doMock("@/lib/d1", () => ({
      getD1Client: vi.fn().mockReturnValue({
        query: vi.fn(),
        firstOrNull: vi.fn(),
        execute: vi.fn(),
        batch: vi.fn(),
      }),
    }));

    const { resetDb, getDbRead } = await import("@/lib/db");
    resetDb();

    const db = await getDbRead();
    expect(db).toHaveProperty("query");
    expect(db).toHaveProperty("firstOrNull");

    resetDb();
    vi.doUnmock("@/lib/d1");
  });
});
